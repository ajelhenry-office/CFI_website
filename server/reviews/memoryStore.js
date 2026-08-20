import { pool } from '../ratings/db.js';
import { Classifier } from './classifier.js';

// Postgres-backed store for reviews/queue/audit log. Named memoryStore to keep the
// existing import path stable across orchestrator.js/poller.js/reviews.routes.js —
// it used to be an in-process Map/Set, which lost all state on every restart.
class ReviewStore {
  // Idempotency: has the pipeline already decided what to do with this review?
  async hasProcessed(reviewId) {
    const { rows } = await pool.query('SELECT status FROM reviews WHERE id = $1', [reviewId]);
    return rows.length > 0 && rows[0].status !== 'new';
  }

  // No-op: upsertReview/addToQueue/markAutoReplied already persist status transitions.
  async markProcessed() {}

  // Records a freshly-fetched Google review. Detects three cases by comparing Google's
  // own updateTime against what we last stored:
  //   - brand new review -> insert, needsProcessing: true
  //   - review.updateTime changed since we last saw it (a customer edit) -> refresh the
  //     stored content, reset status so it gets reprocessed and re-replied with text
  //     matching what the review ACTUALLY says now, needsProcessing: true
  //   - unchanged -> leave alone, needsProcessing: false
  // A review that reappears after being soft-deleted (deleted_at set) is treated the
  // same as an edit, since its content needs to be trusted again either way.
  async upsertReview(review, { storeName, brand }) {
    const reviewId = review.name;
    const stars = Classifier.starToNum(review.starRating);
    const reviewerName = review.reviewer?.displayName || 'Anonymous';
    const commentText = review.comment || '';
    const reviewDate = review.createTime || review.updateTime || null;
    const googleUpdateTime = review.updateTime || review.createTime || null;

    const { rows: existingRows } = await pool.query(
      'SELECT google_update_time, deleted_at, missing_since FROM reviews WHERE id = $1', [reviewId]
    );

    if (existingRows.length === 0) {
      await pool.query(
        `INSERT INTO reviews (id, store_name, brand, reviewer_name, star_rating, review_text, review_date, google_update_time, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new')`,
        [reviewId, storeName, brand, reviewerName, stars, commentText, reviewDate, googleUpdateTime]
      );
      return { needsProcessing: true, isNew: true };
    }

    // Compared as raw strings, not parsed dates — google_update_time is stored as text
    // specifically so this can't drift from a TIMESTAMP column's timezone round-tripping,
    // which silently broke this exact-equality check during testing (a stored value came
    // back shifted by the DB session's UTC offset, making an unchanged review look edited).
    const existing = existingRows[0];
    const changed = !!existing.deleted_at || (googleUpdateTime != null && googleUpdateTime !== existing.google_update_time);

    if (!changed) {
      // It's present in this fetch, proving it was never actually gone — clear any
      // in-progress "missing" flag from markMissingAsDeleted's grace period below.
      if (existing.missing_since) {
        await pool.query('UPDATE reviews SET missing_since = NULL WHERE id = $1', [reviewId]);
      }
      return { needsProcessing: false, isNew: false };
    }

    await pool.query(
      `UPDATE reviews SET reviewer_name = $2, star_rating = $3, review_text = $4, review_date = $5,
       google_update_time = $6, status = 'new', deleted_at = NULL, missing_since = NULL, updated_at = NOW() WHERE id = $1`,
      [reviewId, reviewerName, stars, commentText, reviewDate, googleUpdateTime]
    );
    return { needsProcessing: true, isNew: false };
  }

  // Reviews for this store that were previously fetched (within the window this batch
  // actually covers) but are missing from the current fetch — Google's review-list API
  // only returns the most recent reviews, so "missing" is only a safe signal for rows
  // recent enough that they'd certainly still be in that window if they still existed.
  // Older rows are left untouched rather than risk a false "deleted" from a pagination
  // limit, not an actual deletion. Soft-delete (deleted_at set), never removed outright.
  // oldestDateInBatch must be the RAW timestamp string (e.g. review.createTime), not a
  // parsed Date — matches how review_date was originally written, avoiding a timezone
  // round-trip mismatch on this comparison.
  //
  // Two-phase, with a grace period: a review missing from ONE fetch is only flagged
  // (missing_since set), not yet deleted — confirmed as deleted only if it's STILL
  // missing after GRACE_MS has passed. This exists because Google's review-list API has
  // been observed to occasionally omit a review from one call and return it again on the
  // next, with nothing having actually changed — treating a single miss as confirmed
  // deletion caused a review to flip deleted -> restored -> deleted within an hour, with
  // each "restore" also triggering an unnecessary repost. upsertReview clears
  // missing_since above the moment a review reappears in any fetch.
  async markMissingAsDeleted(storeName, seenReviewIds, oldestDateInBatch, graceMs = 5 * 60 * 1000) {
    if (!oldestDateInBatch) return [];
    const ids = seenReviewIds.length ? seenReviewIds : [''];

    await pool.query(
      `UPDATE reviews SET missing_since = NOW(), updated_at = NOW()
       WHERE store_name = $1 AND deleted_at IS NULL AND missing_since IS NULL
         AND review_date >= $2 AND id != ALL($3::text[])`,
      [storeName, oldestDateInBatch, ids]
    );

    const { rows } = await pool.query(
      `UPDATE reviews SET deleted_at = NOW(), updated_at = NOW()
       WHERE store_name = $1 AND deleted_at IS NULL AND missing_since IS NOT NULL
         AND missing_since <= NOW() - ($4 * INTERVAL '1 millisecond')
         AND review_date >= $2 AND id != ALL($3::text[])
       RETURNING id`,
      [storeName, oldestDateInBatch, ids, graceMs]
    );
    return rows.map((r) => r.id);
  }

  async addToQueue(reviewId, { decision }) {
    await pool.query(
      `UPDATE reviews SET status = 'queued', ai_reply = $2, scenario = $3, source = $4, danger_category = $5, updated_at = NOW()
       WHERE id = $1`,
      [reviewId, decision.replyText, decision.scenario, decision.source, decision.dangerCategory || null]
    );
  }

  // Every queued review, regardless of why. Prefer getEscalationQueue()/getNegativeQueue()
  // below when the caller needs to keep dangerous reviews visually/functionally separate
  // from ordinary negative ones — this one's for callers that genuinely need everything.
  async getQueue() {
    const { rows } = await pool.query(
      `SELECT * FROM reviews WHERE status = 'queued' AND deleted_at IS NULL ORDER BY review_date DESC NULLS LAST, created_at DESC`
    );
    return rows;
  }

  // Food safety / legal / harassment / refund / toxic / reputational-threat / unclear —
  // kept deliberately separate from ordinary negative reviews, never merged into one list.
  async getEscalationQueue() {
    const { rows } = await pool.query(
      `SELECT * FROM reviews WHERE status = 'queued' AND danger_category IS NOT NULL AND deleted_at IS NULL
       ORDER BY review_date DESC NULLS LAST, created_at DESC`
    );
    return rows;
  }

  // Long negative reviews that cleared every danger category — the ordinary queue.
  async getNegativeQueue() {
    const { rows } = await pool.query(
      `SELECT * FROM reviews WHERE status = 'queued' AND danger_category IS NULL AND deleted_at IS NULL
       ORDER BY review_date DESC NULLS LAST, created_at DESC`
    );
    return rows;
  }

  async getQueuedItem(reviewId) {
    const { rows } = await pool.query(`SELECT * FROM reviews WHERE id = $1 AND status = 'queued' AND deleted_at IS NULL`, [reviewId]);
    return rows[0] || null;
  }

  // Kept for interface parity with the old in-memory queue; status transitions
  // (queued -> replied) already remove a review from `getQueue()`'s result set.
  async removeFromQueue() {}

  async markAutoReplied(reviewId, decision) {
    await pool.query(
      `UPDATE reviews SET status = 'auto_replied', final_reply = $2, scenario = $3, source = $4,
       danger_category = $5, replied_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [reviewId, decision.replyText, decision.scenario, decision.source, decision.dangerCategory || null]
    );
  }

  async markReplied(reviewId, finalReply) {
    await pool.query(
      `UPDATE reviews SET status = 'replied', final_reply = $2, replied_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [reviewId, finalReply]
    );
  }

  async setAiDraft(reviewId, aiReply) {
    await pool.query(`UPDATE reviews SET ai_reply = $2, updated_at = NOW() WHERE id = $1`, [reviewId, aiReply]);
  }

  async getReview(reviewId) {
    const { rows } = await pool.query('SELECT * FROM reviews WHERE id = $1', [reviewId]);
    return rows[0] || null;
  }

  // status can be a single value or an array (e.g. ['auto_replied', 'replied']).
  // Every filter is optional — omitting all of them behaves exactly like the old
  // unfiltered listReviews() did.
  async listReviews({ status, brand, storeName, startDate, endDate } = {}) {
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      params.push(statuses);
      conditions.push(`status = ANY($${params.length}::text[])`);
    }
    if (brand && (!Array.isArray(brand) || brand.length)) {
      params.push(Array.isArray(brand) ? brand : [brand]);
      conditions.push(`brand = ANY($${params.length}::text[])`);
    }
    if (storeName && (!Array.isArray(storeName) || storeName.length)) {
      params.push(Array.isArray(storeName) ? storeName : [storeName]);
      conditions.push(`store_name = ANY($${params.length}::text[])`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`review_date >= $${params.length}`);
    }
    if (endDate) {
      // A plain date string like '2026-08-19' is interpreted as midnight IST at the
      // START of that day — "<= endDate" would match almost nothing on the end day
      // itself. Comparing against the start of the NEXT day instead correctly includes
      // the entire end day.
      params.push(endDate);
      conditions.push(`review_date < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM reviews ${where} ORDER BY review_date DESC NULLS LAST, created_at DESC LIMIT 500`,
      params
    );
    return rows;
  }

  // Dashboard summary: total ratings, how many have actual written feedback, and a
  // positive/negative split. "Positive/negative" prefers the pipeline's own sentiment-
  // aware scenario (SCENARIO_POSITIVE_*/SCENARIO_NEGATIVE_*/SCENARIO_DANGEROUS_TEMPLATE)
  // over raw stars, since that already accounts for cases like a 5-star review with
  // genuinely negative text. Falls back to a star-rating threshold (>=4 positive) only
  // for rows with no scenario recorded — rating-only reviews, and reviews from before
  // this pipeline existed. Computed in JS rather than a single SQL expression because
  // that branching is much clearer this way than as a nested CASE/FILTER.
  async getSummaryStats({ brand, storeName, startDate, endDate } = {}) {
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (brand && (!Array.isArray(brand) || brand.length)) {
      params.push(Array.isArray(brand) ? brand : [brand]);
      conditions.push(`brand = ANY($${params.length}::text[])`);
    }
    if (storeName && (!Array.isArray(storeName) || storeName.length)) {
      params.push(Array.isArray(storeName) ? storeName : [storeName]);
      conditions.push(`store_name = ANY($${params.length}::text[])`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`review_date >= $${params.length}`);
    }
    if (endDate) {
      // A plain date string like '2026-08-19' is interpreted as midnight IST at the
      // START of that day — "<= endDate" would match almost nothing on the end day
      // itself. Comparing against the start of the NEXT day instead correctly includes
      // the entire end day.
      params.push(endDate);
      conditions.push(`review_date < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const { rows } = await pool.query(
      `SELECT star_rating, review_text, scenario FROM reviews WHERE ${conditions.join(' AND ')}`,
      params
    );

    let totalFeedback = 0;
    let positive = 0;
    let negative = 0;

    for (const row of rows) {
      if (row.review_text && row.review_text.trim() !== '') totalFeedback++;

      let bucket;
      if (row.scenario && row.scenario.startsWith('SCENARIO_POSITIVE')) bucket = 'positive';
      else if (row.scenario && row.scenario.startsWith('SCENARIO_NEGATIVE')) bucket = 'negative';
      else if (row.scenario === 'SCENARIO_DANGEROUS_TEMPLATE') bucket = 'negative';
      else bucket = (row.star_rating || 0) >= 4 ? 'positive' : 'negative';

      if (bucket === 'positive') positive++;
      else negative++;
    }

    const total = rows.length;
    const pct = (n) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

    return {
      totalRatings: total,
      totalFeedback,
      positive: { count: positive, percentage: pct(positive) },
      negative: { count: negative, percentage: pct(negative) },
    };
  }

  // Distinct brand/store pairs that actually have locations configured — drives the
  // filter dropdowns from real data instead of a hardcoded list.
  // Every configured location, not just the ones the poller is currently live on — this
  // only controls what's browsable in the filter dropdowns. "active" separately controls
  // which locations the poller actually checks for new reviews and auto-replies to; the
  // two are deliberately independent, so widening this list doesn't turn on live posting
  // for anything.
  async getFilterOptions() {
    const { rows } = await pool.query(
      `SELECT DISTINCT brand, store_name FROM review_locations ORDER BY brand, store_name`
    );
    return rows;
  }

  // actorEmail is who sent/edited the reply — omit (or pass null) for anything the
  // pipeline did on its own; never invent an actor for an auto-reply.
  async logAction(reviewId, action, details, actorEmail = null) {
    await pool.query(
      `INSERT INTO review_audit_log (review_id, action, details, actor_email) VALUES ($1, $2, $3, $4)`,
      [reviewId, action, details, actorEmail]
    );
  }

  // Joined against reviews so each entry carries what was actually said and replied,
  // not just an ID — that's what the Audit Log view needs to be useful on its own.
  async getAuditLogs() {
    const { rows } = await pool.query(
      `SELECT l.id, l.review_id, l.action, l.details, l.actor_email, l.created_at,
              r.brand, r.store_name, r.reviewer_name, r.star_rating, r.review_text,
              r.final_reply, r.danger_category, r.deleted_at AS review_deleted_at
       FROM review_audit_log l
       LEFT JOIN reviews r ON r.id = l.review_id
       ORDER BY l.created_at DESC LIMIT 500`
    );
    return rows;
  }

  async getActiveLocations() {
    const { rows } = await pool.query(
      `SELECT store_name, brand, google_account, google_location_path FROM review_locations WHERE active = true`
    );
    return rows;
  }
}

// Singleton instance
export const memoryStore = new ReviewStore();
