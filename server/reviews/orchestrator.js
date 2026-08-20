import { CONFIG } from './config.js';
import { AIClient } from './aiClient.js';
import { Guardrail } from './guardrail.js';
import { Classifier } from './classifier.js';

// Maps the fast English keyword-list categories onto the same category names
// AIClient.classifyReview() returns, so both paths feed one unified decision.
const KEYWORD_CATEGORY_MAP = {
  food_safety: 'FOOD_SAFETY',
  legal_fraud: 'LEGAL',
  discrimination_harassment: 'HARASSMENT',
  refund_related: 'REFUND',
  reputational_threat: 'REPUTATIONAL',
};

// Human-facing label per category, used for the audit trail.
const CATEGORY_LABEL = {
  FOOD_SAFETY: 'food_safety',
  LEGAL: 'legal_fraud',
  HARASSMENT: 'harassment',
  REFUND: 'refund',
  TOXIC: 'toxic',
  REPUTATIONAL: 'reputational_threat',
  UNCLEAR: 'unclear',
};

// Joins 1-4 phrases naturally: "X" / "X and Y" / "X, Y, and Z".
function joinPhrases(list) {
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export class Orchestrator {
  /**
   * Decides what to do with an incoming review and returns a reply that always
   * auto-posts — every category (positive, negative, dangerous) resolves to a
   * pre-built template; AI is never used to write customer-facing text, only to
   * classify the rare review a rule-based pass can't confidently read on its own.
   *
   * Three tiers:
   *   1. Rule-based (free, instant) — keyword/category matching handles the vast
   *      majority of reviews outright.
   *   2. AI (only when tier 1 finds a genuine conflict or no signal at all) — reads
   *      the full sentence for context a keyword list can't have (e.g. "I loved the
   *      raw onions" isn't a food-safety complaint; "amazing service, waited an hour"
   *      is sarcasm, not praise). Retries once before being treated as failed.
   *   3. Deterministic tiebreaker (AI unreachable even after retry) — for a
   *      danger-keyword conflict, defaults to treating it as dangerous (uncertain
   *      still defaults to caution, it just can no longer route to a human); for a
   *      pure sentiment conflict, a simple word/star score decides.
   *
   * @param {Object} review - The Google Review object
   * @param {string} locationName - Name of the store
   * @param {string} [brand] - Brand name, used to pick the right contact email for a
   *   dangerous-review reply (see CONFIG.BRAND_SUPPORT_EMAILS) — falls back to
   *   CONFIG.SUPPORT_EMAIL if omitted or not a listed brand.
   * @returns {Object} { replyText, requireApproval, scenario, dangerCategory, source, reason }
   */
  static async process(review, locationName, brand) {
    const stars = Classifier.starToNum(review.starRating);
    const comment = (review.comment || '').trim();

    // SCENARIO A: rating only, no text — nothing to read, star rating is the only signal.
    if (!comment) {
      const starBucket = stars >= 4 ? 'positive' : 'negative';
      const templates = starBucket === 'positive' ? CONFIG.positiveTemplatesNoText : CONFIG.negativeTemplatesNoText;
      return {
        replyText: pick(templates),
        requireApproval: false,
        scenario: 'SCENARIO_A_RATING_ONLY',
        dangerCategory: null,
        source: 'TEMPLATE',
        reason: 'No text content in review.',
      };
    }

    const commentLower = comment.toLowerCase();

    // ── TIER 1: rule-based signals ──
    const keywordDanger = this.checkKeywords(comment);
    const hasStrongPositive = CONFIG.strongPositiveWords.some((w) => commentLower.includes(w));
    const negMatch = this.matchNegativeCategories(comment);
    const posMatch = this.matchPositiveContent(comment);

    let dangerCode = null;
    let sentiment = null;
    let needsAI = false;
    let aiReason = '';

    if (keywordDanger) {
      // A danger keyword alone isn't trusted blindly — if there's a conflicting strong
      // positive signal (or an unusually high star rating for something "dangerous"),
      // that's exactly the false-positive case ("I loved the raw onions") that needs a
      // full-context read rather than an isolated word match.
      if (hasStrongPositive || stars >= 4) {
        needsAI = true;
        aiReason = 'danger_conflict';
      } else {
        dangerCode = keywordDanger;
      }
    } else {
      const hasNegSignal = negMatch.categories.length > 0;
      if (hasStrongPositive && hasNegSignal) {
        needsAI = true; aiReason = 'sentiment_conflict'; // mixed signals, e.g. sarcasm
      } else if (hasStrongPositive && !hasNegSignal) {
        if (stars <= 2) { needsAI = true; aiReason = 'sentiment_star_mismatch'; }
        else sentiment = 'POSITIVE';
      } else if (hasNegSignal && !hasStrongPositive) {
        if (stars >= 4) { needsAI = true; aiReason = 'sentiment_star_mismatch'; }
        else sentiment = 'NEGATIVE';
      } else {
        // No rule matched anything at all — genuinely can't tell from keywords alone
        // (e.g. "I ended up in the ER after my meal" has no trigger word whatsoever).
        needsAI = true; aiReason = 'no_rule_match';
      }
    }

    // ── TIER 2 / 3: AI on conflict only, with a deterministic fallback ──
    if (needsAI) {
      const aiResult = await this.classifyWithRetry(comment, stars);
      if (aiResult) {
        dangerCode = aiResult.dangerCategory;
        sentiment = aiResult.sentiment;
      } else if (aiReason === 'danger_conflict') {
        // AI unreachable and we can't confirm the positive-sounding signal was
        // genuine — uncertain still defaults to caution.
        dangerCode = keywordDanger;
      } else {
        dangerCode = 'NONE';
        sentiment = this.tiebreakSentiment({ hasStrongPositive, negCategoryCount: negMatch.categories.length, stars });
      }
    } else if (!dangerCode) {
      dangerCode = 'NONE';
    }

    // ── Dangerous — one shared, deliberately generic template pool, every category ──
    if (dangerCode && dangerCode !== 'NONE') {
      const dangerCategory = CATEGORY_LABEL[dangerCode] || 'unclear';
      const replyText = this.buildDangerousTemplateReply(brand);
      const guard = Guardrail.check(replyText);
      if (!guard.safe) console.warn(`[Guardrail] Dangerous template unexpectedly flagged: ${guard.flaggedPhrase}`);
      return {
        replyText,
        requireApproval: false,
        scenario: 'SCENARIO_DANGEROUS_TEMPLATE',
        dangerCategory,
        source: 'TEMPLATE',
        reason: `Flagged as ${dangerCategory} — pre-built template, auto-posted.`,
      };
    }

    const bucket = this.resolveBucket(stars, sentiment);

    // ── Positive ──
    if (bucket === 'positive') {
      if (posMatch.phrases.length > 0) {
        const replyText = this.buildPositiveTemplateReply(posMatch.phrases);
        return {
          replyText,
          requireApproval: false,
          scenario: posMatch.phrases.length > 1 ? 'SCENARIO_POSITIVE_COMPLEX' : 'SCENARIO_POSITIVE_SIMPLE',
          dangerCategory: null,
          source: 'TEMPLATE',
          reason: `Matched: ${posMatch.phrases.join(', ')}`,
        };
      }
      return {
        replyText: pick(CONFIG.positiveTemplatesNoText),
        requireApproval: false,
        scenario: 'SCENARIO_POSITIVE_GENERIC',
        dangerCategory: null,
        source: 'TEMPLATE',
        reason: 'No specific category matched — generic positive template.',
      };
    }

    // ── Negative ──
    const replyText = this.buildNegativeTemplateReply(negMatch.phrases);
    return {
      replyText,
      requireApproval: false,
      scenario: negMatch.phrases.length > 1 ? 'SCENARIO_NEGATIVE_COMPLEX' : negMatch.phrases.length === 1 ? 'SCENARIO_NEGATIVE_SIMPLE' : 'SCENARIO_NEGATIVE_GENERIC',
      dangerCategory: null,
      source: 'TEMPLATE',
      reason: negMatch.phrases.length > 0 ? `Matched: ${negMatch.phrases.join(', ')}` : 'No specific category matched — generic negative template.',
    };
  }

  /**
   * Calls AIClient.classifyReview up to twice (a short pause between attempts) before
   * giving up — covers a transient failure (a momentary rate limit, a single timeout)
   * without treating it the same as AI being genuinely unreachable.
   * @returns {Promise<{dangerCategory: string, sentiment: string}|null>} null if both
   *   attempts came back as total failures (UNCLEAR/UNCLEAR).
   */
  static async classifyWithRetry(comment, stars, attempts = 2) {
    for (let i = 0; i < attempts; i++) {
      const result = await AIClient.classifyReview(comment, stars);
      if (!(result.dangerCategory === 'UNCLEAR' && result.sentiment === 'UNCLEAR')) {
        return result;
      }
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  }

  /**
   * Deterministic sentiment tiebreaker for when AI is unreachable on a pure sentiment
   * conflict (no danger keyword involved, so the stakes are just "which template," not
   * "is this safe"). A tie defaults negative — the more cautious template either way.
   */
  static tiebreakSentiment({ hasStrongPositive, negCategoryCount, stars }) {
    let score = 0;
    if (hasStrongPositive) score += 1;
    score -= negCategoryCount;
    if (stars >= 4) score += 1;
    if (stars <= 2) score -= 1;
    return score > 0 ? 'POSITIVE' : 'NEGATIVE';
  }

  /**
   * POSITIVE sentiment -> 'positive'. NEGATIVE -> 'negative'. MIXED/UNCLEAR default to
   * 'negative' — the more cautious template costs nothing extra when we're unsure.
   */
  static resolveBucket(stars, sentiment) {
    if (sentiment === 'POSITIVE') return 'positive';
    if (sentiment === 'NEGATIVE') return 'negative';
    if (sentiment === 'MIXED' || sentiment === 'UNCLEAR') return 'negative';
    return stars >= 4 ? 'positive' : 'negative'; // shouldn't happen, safety net only
  }

  /**
   * Fast English pre-filter across every escalation category + the toxic word list.
   * Returns the AIClient-style category code, or null if clean. This is a SIGNAL, not
   * a verdict — process() still checks it against conflicting positive signals before
   * trusting it outright.
   */
  static checkKeywords(commentLower0) {
    const commentLower = commentLower0.toLowerCase();

    for (const word of CONFIG.bannedWords) {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(commentLower)) return 'TOXIC';
    }

    for (const [category, keywords] of Object.entries(CONFIG.escalationKeywords)) {
      for (const keyword of keywords) {
        if (commentLower.includes(keyword.toLowerCase())) {
          return KEYWORD_CATEGORY_MAP[category] || null;
        }
      }
    }

    return null;
  }

  /**
   * Scans a positive review for up to 4 "what did they like" phrases — specific
   * dish/staff-name map first (more genuine-sounding when it applies), then the
   * broader categories. Up to 4 (not 2) so a review mentioning food, ambience, staff,
   * and a family occasion can combine all four blocks, matching the complex-positive
   * structure — more than that starts reading like a checklist.
   */
  static matchPositiveContent(comment) {
    const commentLower = comment.toLowerCase();
    const phrases = [];
    const MAX_PHRASES = 4;

    for (const [keyword, phrase] of Object.entries(CONFIG.positiveKeywordsMap)) {
      if (phrases.length >= MAX_PHRASES) break;
      if (commentLower.includes(keyword) && !phrases.includes(phrase)) phrases.push(phrase);
    }

    for (const { keywords, phrase } of Object.values(CONFIG.positiveCategories)) {
      if (phrases.length >= MAX_PHRASES) break;
      if (phrases.includes(phrase)) continue;
      if (keywords.some((k) => commentLower.includes(k))) phrases.push(phrase);
    }

    return { phrases };
  }

  /**
   * Same pattern as matchPositiveContent, for the negative-issue categories
   * (FOOD_QUALITY, SERVICE, PRICE, PORTION, ORDER_ACCURACY, WAIT_TIME). Up to 3, so a
   * "waited 40 minutes, food was cold, service was slow" review can combine all three.
   */
  static matchNegativeCategories(comment) {
    const commentLower = comment.toLowerCase();
    const phrases = [];
    const categories = [];
    const MAX_PHRASES = 3;

    for (const [key, { keywords, phrase }] of Object.entries(CONFIG.negativeCategories)) {
      if (phrases.length >= MAX_PHRASES) break;
      if (keywords.some((k) => commentLower.includes(k))) {
        phrases.push(phrase);
        categories.push(key);
      }
    }

    return { phrases, categories };
  }

  /**
   * Composes: Thank-you opener + what they liked (1-4 combined) + happy-dining
   * statement + fixed closer.
   */
  static buildPositiveTemplateReply(phrases) {
    const opener = pick(CONFIG.positiveOpeners);
    const liked = joinPhrases(phrases.slice(0, 4));
    const happy = pick(CONFIG.positiveHappyStatements);
    return `${opener} We're so glad you enjoyed ${liked}. ${happy} ${CONFIG.positiveClosingLine}`;
  }

  /**
   * Composes: apology + issue acknowledgment (1-3 matched categories combined, or the
   * generic fallback line if none matched) + appreciation + improve-promise +
   * invite-back. Every piece is a fixed, pre-approved line or a fixed phrase from
   * negativeCategories — nothing here is generated.
   */
  static buildNegativeTemplateReply(phrases) {
    const apology = pick(CONFIG.negativeApologyLines);
    const issue = phrases.length > 0
      ? `We're sorry to hear about ${joinPhrases(phrases.slice(0, 3))}.`
      : CONFIG.negativeGenericIssueLine;
    const appreciation = pick(CONFIG.negativeAppreciationLines);
    const improve = pick(CONFIG.negativeImproveLines);
    const inviteBack = pick(CONFIG.negativeInviteBackLines);
    return `${apology} ${issue} ${appreciation} ${improve} ${inviteBack}`;
  }

  /** One shared, deliberately generic template used for every danger category alike. */
  static buildDangerousTemplateReply(brand) {
    const email = CONFIG.BRAND_SUPPORT_EMAILS[brand] || CONFIG.SUPPORT_EMAIL;
    return pick(CONFIG.dangerousTemplates).replace('{EMAIL}', email);
  }
}
