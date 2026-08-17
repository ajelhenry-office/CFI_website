import { CONFIG } from './config.js';

export class Guardrail {
  /**
   * Check AI output for liability phrases.
   * @param {string} text - The AI generated reply.
   * @returns {Object} { safe: boolean, flaggedPhrase: string | null }
   */
  static check(text) {
    if (!text) return { safe: true, flaggedPhrase: null };
    
    const textLower = text.toLowerCase();
    
    for (const phrase of CONFIG.liabilityPhrases) {
      if (textLower.includes(phrase.toLowerCase())) {
        return { safe: false, flaggedPhrase: phrase };
      }
    }
    
    return { safe: true, flaggedPhrase: null };
  }
}
