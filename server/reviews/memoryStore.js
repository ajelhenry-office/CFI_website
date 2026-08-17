export class MemoryStore {
  constructor() {
    this.processedReviews = new Set();
    this.approvalQueue = new Map(); // key: reviewId, value: { review, reply, reason }
    this.auditLog = []; // Simple array to store past actions
  }

  // Idempotency: Check if a review was already processed
  hasProcessed(reviewId) {
    return this.processedReviews.has(reviewId);
  }

  markProcessed(reviewId) {
    this.processedReviews.add(reviewId);
  }

  // Queue management for AI / Guardrail flagged reviews
  addToQueue(reviewId, data) {
    this.approvalQueue.set(reviewId, {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  getQueue() {
    return Array.from(this.approvalQueue.values());
  }

  removeFromQueue(reviewId) {
    this.approvalQueue.delete(reviewId);
  }

  getQueuedItem(reviewId) {
    return this.approvalQueue.get(reviewId);
  }

  // Audit logging
  logAction(reviewId, action, details) {
    this.auditLog.push({
      reviewId,
      action,
      details,
      timestamp: new Date().toISOString()
    });
    // Optional: Keep log bounded in memory
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }
  }

  getAuditLogs() {
    return this.auditLog;
  }
}

// Singleton instance
export const memoryStore = new MemoryStore();
