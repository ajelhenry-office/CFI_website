import { CONFIG } from './config.js';
import { AIClient } from './aiClient.js';
import { Guardrail } from './guardrail.js';

export class Orchestrator {
  /**
   * Run the Phase 2 Decision Engine
   * @param {Object} review - The Google Review object
   * @param {Object} classification - The result from Phase 1 Classifier
   * @param {string} locationName - Name of the store
   * @returns {Object} { replyText: string, requireApproval: boolean, scenario: string, source: string, reason: string }
   */
  static async process(review, classification, locationName) {
    const { ratingOnly, toxic, escalationCategory, bucket } = classification;
    const comment = (review.comment || '').trim();
    const commentLower = comment.toLowerCase();

    // PHASE 1 CRITICAL GATE
    if (escalationCategory) {
      return {
        replyText: null,
        requireApproval: true,
        scenario: 'ESCALATION',
        source: 'NONE',
        reason: `Matched escalation category: ${escalationCategory}. No auto-reply generated.`
      };
    }

    // SCENARIO A: Rating only, no text
    if (ratingOnly) {
      const templates = bucket === 'positive' 
        ? CONFIG.positiveTemplatesNoText 
        : CONFIG.negativeTemplatesNoText;
      const replyText = templates[Math.floor(Math.random() * templates.length)];
      
      return {
        replyText,
        requireApproval: false,
        scenario: 'SCENARIO_A_RATING_ONLY',
        source: 'TEMPLATE',
        reason: 'No text content in review.'
      };
    }

    // SCENARIO B: Toxic / Abusive
    if (toxic) {
      return {
        replyText: CONFIG.toxicReply,
        requireApproval: true, // Still flag for human review, though reply is safe
        scenario: 'SCENARIO_B_TOXIC',
        source: 'TEMPLATE_GENERIC',
        reason: 'Review text matched toxicity filter.'
      };
    }

    // SCENARIO C: Positive (4-5 stars) with text
    if (bucket === 'positive') {
      // 1. Keyword match check
      let matchedItem = null;
      for (const [keyword, templatePhrase] of Object.entries(CONFIG.positiveKeywordsMap)) {
        if (commentLower.includes(keyword)) {
          matchedItem = templatePhrase;
          break;
        }
      }

      if (matchedItem) {
        // 2. Sentiment mismatch check (e.g. sarcasm)
        let hasMismatch = false;
        for (const mismatchWord of CONFIG.sentimentMismatchWords) {
          if (commentLower.includes(mismatchWord)) {
            hasMismatch = true;
            break;
          }
        }

        if (!hasMismatch) {
          // Safe to use dynamic template
          const templates = CONFIG.positiveTemplatesMatch;
          const template = templates[Math.floor(Math.random() * templates.length)];
          const replyText = template.replace('{matchedItem}', matchedItem);

          return {
            replyText,
            requireApproval: false,
            scenario: 'SCENARIO_C_POSITIVE_TEMPLATE',
            source: 'TEMPLATE_DYNAMIC',
            reason: `Matched keyword for: ${matchedItem}`
          };
        }
      }

      // If no match, OR sentiment mismatch failed -> send to AI
      const aiReply = await AIClient.generateReply(review, bucket, locationName);
      const guard = Guardrail.check(aiReply);

      return {
        replyText: aiReply,
        requireApproval: !guard.safe,
        scenario: 'SCENARIO_C_POSITIVE_AI',
        source: guard.safe ? 'GROQ_AI' : 'GROQ_AI_FLAGGED',
        reason: guard.safe ? 'No template match, AI generated safe reply.' : `AI reply flagged for liability phrase: ${guard.flaggedPhrase}`
      };
    }

    // SCENARIO D: Negative/Critical (1-3 stars) with text
    if (bucket === 'negative') {
      const aiReply = await AIClient.generateReply(review, bucket, locationName);
      const guard = Guardrail.check(aiReply);

      return {
        replyText: aiReply,
        // Spec rule: By default, mark AI replies from this scenario as requiring human approval before posting
        requireApproval: true,
        scenario: 'SCENARIO_D_NEGATIVE_AI',
        source: guard.safe ? 'GROQ_AI' : 'GROQ_AI_FLAGGED',
        reason: guard.safe ? 'Negative review requires human approval per v1 rules.' : `AI reply flagged for liability phrase: ${guard.flaggedPhrase}`
      };
    }
  }
}
