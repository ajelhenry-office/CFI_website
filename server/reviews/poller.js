import cron from 'node-cron';
import { googleClient } from './googleClient.js';
import { Classifier } from './classifier.js';
import { Orchestrator } from './orchestrator.js';
import { memoryStore } from './memoryStore.js';

// The locations to monitor. This could be loaded from config or DB.
// Hardcoding a dummy path for now until configured.
const LOCATIONS_TO_MONITOR = [
  { name: 'Frazer Town', path: 'accounts/115703539660549009804/locations/11264488731902783421' }
];

export class ReviewPoller {
  
  /**
   * Main function to fetch and process new reviews
   */
  static async runBatch() {
    console.log('[ReviewPoller] Starting review batch processing...');
    
    for (const location of LOCATIONS_TO_MONITOR) {
      try {
        const reviews = await googleClient.getLatestReviews(location.path);
        
        for (const review of reviews) {
          const reviewId = review.name;
          
          // Idempotency: Skip if already processed in memory
          if (memoryStore.hasProcessed(reviewId)) {
            continue;
          }
          
          // Skip if it already has a reply from the business
          if (review.reviewReply && review.reviewReply.comment) {
            memoryStore.markProcessed(reviewId); // mark as done
            continue;
          }
          
          console.log(`[ReviewPoller] Processing new review: ${reviewId}`);
          
          // Phase 1: Classify
          const classification = Classifier.classify(review);
          
          // Phase 2: Orchestrate (Decide what to say)
          const decision = await Orchestrator.process(review, classification, location.name);
          
          // Phase 3: Action (Post or Queue)
          if (decision.requireApproval) {
            console.log(`[ReviewPoller] Review ${reviewId} routed to HUMAN QUEUE. Reason: ${decision.reason}`);
            memoryStore.addToQueue(reviewId, { review, decision, location: location.name });
            memoryStore.logAction(reviewId, 'QUEUED', decision.reason);
          } else {
            console.log(`[ReviewPoller] Review ${reviewId} AUTO-REPLY. Scenario: ${decision.scenario}`);
            try {
              await googleClient.postReply(reviewId, decision.replyText);
              memoryStore.logAction(reviewId, 'AUTO_REPLIED', `Scenario: ${decision.scenario}, Source: ${decision.source}`);
            } catch (err) {
              console.error(`[ReviewPoller] Failed to post reply for ${reviewId}:`, err.message);
              memoryStore.logAction(reviewId, 'ERROR', `Failed to post: ${err.message}`);
              continue; // Don't mark as processed so it retries next cycle
            }
          }
          
          // Mark as processed only if successfully handled
          memoryStore.markProcessed(reviewId);
        }
      } catch (err) {
        console.error(`[ReviewPoller] Error processing location ${location.name}:`, err.message);
      }
    }
    
    console.log('[ReviewPoller] Batch processing complete.');
  }

  /**
   * Starts the cron job (e.g., every 15 minutes, or every 1 minute for testing)
   */
  static startCron() {
    // Running every 1 minute for testing as requested by user
    cron.schedule('*/1 * * * *', async () => {
      await this.runBatch();
    });
    console.log('⏰ Review Poller cron job started (every 1 minute for testing).');
  }
}
