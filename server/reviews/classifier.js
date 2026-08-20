export class Classifier {
  /**
   * Helper to convert Google Star Rating string to number.
   * e.g., 'FIVE' -> 5
   */
  static starToNum(ratingStr) {
    const map = { 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 };
    return map[ratingStr] || parseInt(ratingStr, 10) || 0;
  }
}
