import express from 'express';
import { memoryStore } from './memoryStore.js';
import { ReviewPoller } from './poller.js';
import { Classifier } from './classifier.js';
import { Orchestrator } from './orchestrator.js';
import { googleClient } from './googleClient.js';

const router = express.Router();

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
router.get('/queue', (req, res) => {
  res.json({ success: true, queue: memoryStore.getQueue() });
});

/**
 * Approve and post a queued reply
 */
router.post('/queue/:id/approve', async (req, res) => {
  const reviewId = req.params.id;
  // User might send an edited reply text
  const { editedReply } = req.body; 

  const item = memoryStore.getQueuedItem(reviewId);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Review not found in queue' });
  }

  const textToPost = editedReply || item.decision.replyText;
  
  if (!textToPost) {
    return res.status(400).json({ success: false, error: 'No reply text provided' });
  }

  try {
    await googleClient.postReply(reviewId, textToPost);
    memoryStore.removeFromQueue(reviewId);
    memoryStore.logAction(reviewId, 'HUMAN_APPROVED_AND_POSTED', 'Manually approved from queue');
    memoryStore.markProcessed(reviewId);

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
  if (memoryStore.hasProcessed(reviewId)) {
    return res.json({ message: 'Already processed' });
  }

  try {
    const classification = Classifier.classify(review);
    // Assume location name is known or parsed from review.name
    const decision = await Orchestrator.process(review, classification, "Location");

    if (decision.requireApproval) {
      memoryStore.addToQueue(reviewId, { review, decision, location: "Location" });
      memoryStore.logAction(reviewId, 'QUEUED', decision.reason);
    } else {
      await googleClient.postReply(reviewId, decision.replyText);
      memoryStore.logAction(reviewId, 'AUTO_REPLIED', `Scenario: ${decision.scenario}`);
    }
    
    memoryStore.markProcessed(reviewId);
    res.json({ success: true, decision });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * View Audit Logs
 */
router.get('/audit-log', (req, res) => {
  res.json({ success: true, logs: memoryStore.getAuditLogs() });
});

export default router;
