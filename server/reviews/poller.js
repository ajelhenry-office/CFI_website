import cron from 'node-cron';
import { googleClient } from './googleClient.js';
import { Orchestrator } from './orchestrator.js';
import { memoryStore } from './memoryStore.js';

export class ReviewPoller {

  /**
   * Main function to fetch and process new reviews across every active location.
   */
  static async runBatch() {
    console.log('[ReviewPoller] Starting review batch processing...');

    const locations = await memoryStore.getActiveLocations();
    if (locations.length === 0) {
      console.warn('[ReviewPoller] No active locations configured in review_locations.');
    }

    for (const location of locations) {
      const fullLocationPath = `${location.google_account}/${location.google_location_path}`;

      try {
        const reviews = await googleClient.getLatestReviews(fullLocationPath);
        const seenIds = new Set();

        for (const review of reviews) {
          const reviewId = review.name;
          seenIds.add(reviewId);

          // needsProcessing covers both a brand-new review AND an existing one whose
          // content changed since we last saw it (the customer edited it) — isNew tells
          // us which, since that changes what an existing Google reply on it means.
          const { needsProcessing, isNew } = await memoryStore.upsertReview(review, { storeName: location.store_name, brand: location.brand });
          if (!needsProcessing) continue;

          // Only for a genuinely NEW review: an existing reply here predates this
          // pipeline (the old bot, or a manual reply) — record it, don't touch it. An
          // EDITED review with a reply already on it means that reply is OUR own prior
          // one, now stale against the new text — always recompute and repost for those.
          if (isNew && review.reviewReply && review.reviewReply.comment) {
            await memoryStore.markReplied(reviewId, review.reviewReply.comment);
            continue;
          }

          console.log(`[ReviewPoller] Processing ${isNew ? 'new' : 'edited'} review: ${reviewId}`);

          // Every review now resolves to an auto-postable reply — decision.requireApproval
          // is always false. The only way a review still lands in Pending Review is if
          // posting to Google itself fails (network/API error, not a classification
          // question) — queued with the already-decided reply so it can be retried or
          // manually re-sent once the underlying issue clears.
          const decision = await Orchestrator.process(review, location.store_name, location.brand);
          console.log(`[ReviewPoller] Review ${reviewId} AUTO-REPLY. Scenario: ${decision.scenario}`);
          try {
            await googleClient.postReply(reviewId, decision.replyText);
            await memoryStore.markAutoReplied(reviewId, decision);
            await memoryStore.logAction(reviewId, isNew ? 'AUTO_REPLIED' : 'REPLY_UPDATED_AFTER_EDIT', `Scenario: ${decision.scenario}, Source: ${decision.source}`);
          } catch (err) {
            console.error(`[ReviewPoller] Failed to post reply for ${reviewId}:`, err.message);
            await memoryStore.addToQueue(reviewId, { decision });
            await memoryStore.logAction(reviewId, 'POST_FAILED', `Reply decided but posting failed: ${err.message}`);
          }
        }

        // Deletion detection — only within the window this fetch actually covers (the
        // oldest review returned), so a review simply falling outside the top-50-by-
        // updateTime page is never mistaken for a deletion. See markMissingAsDeleted.
        // Kept as the RAW string (not a parsed Date) since that's how upsertReview wrote
        // review_date in the first place — comparing a re-serialized Date against it can
        // shift by the DB session's timezone offset and silently break the comparison.
        if (reviews.length > 0) {
          const oldestDateInBatch = reviews.reduce((oldest, r) => {
            const raw = r.createTime || r.updateTime;
            if (!raw) return oldest;
            if (!oldest || new Date(raw) < new Date(oldest)) return raw;
            return oldest;
          }, null);
          const deletedIds = await memoryStore.markMissingAsDeleted(location.store_name, Array.from(seenIds), oldestDateInBatch);
          for (const id of deletedIds) {
            console.log(`[ReviewPoller] Review no longer on Google, marked deleted: ${id}`);
            await memoryStore.logAction(id, 'DELETED', 'Review no longer found on Google — removed from active views.');
          }
        }
      } catch (err) {
        console.error(`[ReviewPoller] Error processing location ${location.store_name}:`, err.message);
      }
    }

    console.log('[ReviewPoller] Batch processing complete.');
  }

  /**
   * Starts the cron job. Default: every 4 hours — a full sweep across every
   * location every minute would burn through Google's API quota fast.
   * Pinned to Asia/Kolkata explicitly — every store is in India, and node-cron
   * otherwise schedules against whatever timezone the server process happens to be
   * running in, which isn't guaranteed to be IST (e.g. a US-region cloud host would
   * fire "9 AM" at the wrong real-world time without this).
   */
  static startCron() {
    const schedule = process.env.REVIEWS_CRON_SCHEDULE || '0 */4 * * *';
    cron.schedule(schedule, async () => {
      await this.runBatch();
    }, { timezone: 'Asia/Kolkata' });
    console.log(`⏰ Review Poller cron job started (schedule: ${schedule}, timezone: Asia/Kolkata).`);
  }
}
