import express from 'express';
import { memoryStore } from './memoryStore.js';
import { ReviewPoller } from './poller.js';
import { Orchestrator } from './orchestrator.js';
import { googleClient } from './googleClient.js';
import { AIClient } from './aiClient.js';

const router = express.Router();

// brand/store may be a single value or comma-separated multiple values (the frontend's
// filter uses a multi-select) — split into an array either way.
function filtersFromQuery(req) {
  const { brand, store, startDate, endDate } = req.query;
  return {
    brand: brand ? brand.split(',').filter(Boolean) : undefined,
    storeName: store ? store.split(',').filter(Boolean) : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  };
}

/**
 * Every review that's been triaged — auto-replied, manually replied, or still pending —
 * for the "All" tab. Deliberately excludes status='new' (fetched but not yet processed by
 * the orchestrator, normally a momentary state): a review with no reply attempted yet
 * isn't "an auto or manual reply" and doesn't belong in this view.
 */
router.get('/', async (req, res) => {
  try {
    const reviews = await memoryStore.listReviews({ status: ['queued', 'auto_replied', 'replied'], ...filtersFromQuery(req) });
    res.json({ count: reviews.length, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Reviews that already have a final reply — either auto-posted by this pipeline, or
 * already replied to before this pipeline existed (the pre-existing bot's replies).
 */
router.get('/auto-replied', async (req, res) => {
  try {
    const reviews = await memoryStore.listReviews({ status: ['auto_replied', 'replied'], ...filtersFromQuery(req) });
    res.json({ count: reviews.length, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Reviews waiting for a human to review and send — ordinary negative reviews and
 * escalation (dangerous/abusive) ones both live here (status='queued'); each row's
 * danger_category tells the frontend which is which, so they're never conflated even
 * though they share one queue/one tab.
 */
router.get('/pending', async (req, res) => {
  try {
    const reviews = await memoryStore.listReviews({ status: 'queued', ...filtersFromQuery(req) });
    res.json({ count: reviews.length, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Distinct brand/store options for the filter dropdowns, driven by what's actually
 * configured in review_locations rather than hardcoded.
 */
router.get('/filter-options', async (req, res) => {
  try {
    const options = await memoryStore.getFilterOptions();
    const brands = [...new Set(options.map((o) => o.brand))];
    const stores = [...new Set(options.map((o) => o.store_name))];
    res.json({ brands, stores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Dashboard summary stats — total ratings, feedback count, positive/negative split.
 */
router.get('/summary', async (req, res) => {
  try {
    const stats = await memoryStore.getSummaryStats(filtersFromQuery(req));
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Edit an already-sent reply — re-posts to Google (overwrites the existing reply,
 * respecting REVIEWS_DRY_RUN same as every other post) and updates our own record.
 */
router.put('/:id/reply', async (req, res) => {
  const reviewId = req.params.id;
  try {
    const review = await memoryStore.getReview(reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const { replyText } = req.body;
    if (!replyText || !replyText.trim()) return res.status(400).json({ error: 'replyText is required' });

    await googleClient.postReply(reviewId, replyText);
    await memoryStore.markReplied(reviewId, replyText);
    await memoryStore.logAction(reviewId, 'REPLY_EDITED', 'Edited from the Auto-Reply Reviews tab', req.user?.email || null);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Current health of every key in the AI rotation pool — masked previews only.
 */
router.get('/ai-health', (req, res) => {
  res.json({ keys: AIClient.getKeyHealth() });
});

/**
 * Trigger a fresh sync against Google, then return the updated list
 */
router.get('/fetch-new', async (req, res) => {
  try {
    await ReviewPoller.runBatch();
    const reviews = await memoryStore.listReviews();
    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const STAR_STRINGS = { 1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE' };

/**
 * (Re)generate a reply draft for a specific review — routes through the SAME decision
 * logic (Orchestrator.process) that produced the original reply, not a separate freeform
 * AI call. That's deliberate: it's what guarantees a regenerated draft still follows the
 * template structure whenever the review is template-eligible (a fresh variant, since
 * template composition randomizes its building blocks), and only falls through to
 * freeform AI in the same rare cases the original decision would have. It also means
 * this correctly uses AI-determined sentiment rather than raw star rating.
 */
router.post('/:id/generate', async (req, res) => {
  const reviewId = req.params.id;
  try {
    const review = await memoryStore.getReview(reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const decision = await Orchestrator.process(
      {
        starRating: STAR_STRINGS[review.star_rating] || 'FIVE',
        comment: review.review_text || '',
        reviewer: { displayName: review.reviewer_name },
      },
      review.store_name,
      review.brand
    );
    const reply = decision.replyText;

    await memoryStore.setAiDraft(reviewId, reply);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger a manual review sync (Testing purposes)
 */
router.get('/run-now', async (req, res) => {
  try {
    // Run async so we don't block, but for testing we can await it
    await ReviewPoller.runBatch();
    res.json({ success: true, message: 'Batch run completed.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get items waiting for human approval
 */
router.get('/queue', async (req, res) => {
  res.json({ success: true, queue: await memoryStore.getQueue() });
});

/**
 * Approve and post a queued reply
 */
router.post('/queue/:id/approve', async (req, res) => {
  const reviewId = req.params.id;
  // User might send an edited reply text
  const { editedReply } = req.body;

  const item = await memoryStore.getQueuedItem(reviewId);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Review not found in queue' });
  }

  const textToPost = editedReply || item.ai_reply;

  if (!textToPost) {
    return res.status(400).json({ success: false, error: 'No reply text provided' });
  }

  try {
    await googleClient.postReply(reviewId, textToPost);
    await memoryStore.markReplied(reviewId, textToPost);
    await memoryStore.logAction(reviewId, 'HUMAN_APPROVED_AND_POSTED', 'Manually approved from queue', req.user?.email || null);

    res.json({ success: true, message: 'Reply posted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Webhook for push notifications (if configured with Google Cloud Pub/Sub)
 */
router.post('/webhook/review', async (req, res) => {
  const review = req.body;
  if (!review || !review.name) {
    return res.status(400).json({ error: 'Invalid review payload' });
  }

  const reviewId = review.name;
  if (await memoryStore.hasProcessed(reviewId)) {
    return res.json({ message: 'Already processed' });
  }

  try {
    // Assume location name is known or parsed from review.name
    await memoryStore.upsertReview(review, { storeName: 'Location', brand: 'Unknown' });

    const decision = await Orchestrator.process(review, "Location", 'Unknown');

    try {
      await googleClient.postReply(reviewId, decision.replyText);
      await memoryStore.markAutoReplied(reviewId, decision);
      await memoryStore.logAction(reviewId, 'AUTO_REPLIED', `Scenario: ${decision.scenario}`);
    } catch (postErr) {
      await memoryStore.addToQueue(reviewId, { decision });
      await memoryStore.logAction(reviewId, 'POST_FAILED', `Reply decided but posting failed: ${postErr.message}`);
    }

    res.json({ success: true, decision });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * View Audit Logs
 */
router.get('/audit-log', async (req, res) => {
  res.json({ success: true, logs: await memoryStore.getAuditLogs() });
});

export default router;
