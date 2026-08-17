import { CONFIG } from './config.js';

export class Classifier {
  /**
   * Classify the incoming review based on Phase 1 logic.
   * @param {Object} review - The Google Review object
   * @returns {Object} { ratingOnly, toxic, escalationCategory, bucket }
   */
  static classify(review) {
    const stars = this.starToNum(review.starRating);
    const comment = (review.comment || '').trim();
    const textLower = comment.toLowerCase();

    // 1. Check if rating only
    const ratingOnly = comment === '';

    // 2. Check bucket (Positive vs Negative)
    const bucket = stars >= 4 ? 'positive' : 'negative';

    if (ratingOnly) {
      return { ratingOnly, toxic: false, escalationCategory: null, bucket };
    }

    // 3. Toxic check
    let toxic = false;
    for (const word of CONFIG.bannedWords) {
      // Basic word boundary regex to avoid partial matches
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(textLower)) {
        toxic = true;
        break;
      }
    }

    // 4. Escalation check (Only if not toxic)
    let escalationCategory = null;
    if (!toxic) {
      for (const [category, keywords] of Object.entries(CONFIG.escalationKeywords)) {
        for (const keyword of keywords) {
          if (textLower.includes(keyword.toLowerCase())) {
            escalationCategory = category;
            break;
          }
        }
        if (escalationCategory) break;
      }
    }

    return { ratingOnly, toxic, escalationCategory, bucket };
  }

  /**
   * Helper to convert Google Star Rating string to number.
   * e.g., 'FIVE' -> 5
   */
  static starToNum(ratingStr) {
    const map = { 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 };
    return map[ratingStr] || parseInt(ratingStr, 10) || 0;
  }
}
