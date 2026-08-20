import 'dotenv/config';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function parseKeys(envVar) {
  return (process.env[envVar] || '').split(',').map((k) => k.trim()).filter(Boolean);
}

// Rotation pool: every Groq key first (fastest), then every OpenRouter key, in order.
// Neither requires a paid subscription — both are free-tier keys. Rotating means one
// key hitting its free-tier rate limit, or one provider having an outage, doesn't take
// classification down — it just moves to the next one.
const PROVIDERS = [
  ...parseKeys('GROQ_API_KEYS').map((key) => ({ url: GROQ_URL, key, model: 'openai/gpt-oss-20b', provider: 'groq' })),
  ...parseKeys('OPENROUTER_API_KEYS').map((key) => ({ url: OPENROUTER_URL, key, model: 'openai/gpt-oss-20b:free', provider: 'openrouter' })),
];

// Current-status telemetry per key, for the "AI Keys" health panel — not a history log,
// just "as of the last attempt." Seeded with every configured key up front (status
// 'untested') so the panel shows all of them even before the first real call.
const KEY_HEALTH = new Map(
  PROVIDERS.map((p) => [p.key, {
    provider: p.provider,
    keyPreview: `${p.key.slice(0, 10)}...`,
    status: 'untested',
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
  }])
);

// 429/rate-limit and 401/invalid-key are the two states worth calling out distinctly in
// the health panel — anything else is just "error", still worth showing but not one of
// the two specific, actionable failure modes.
function classifyKeyError(message) {
  if (!message) return 'unknown';
  if (message.includes('429') || /rate.?limit/i.test(message)) return 'rate_limited';
  if (message.includes('401') || /invalid_api_key/i.test(message)) return 'invalid';
  return 'error';
}

function recordKeyAttempt(provider, error) {
  const entry = KEY_HEALTH.get(provider.key);
  if (!entry) return; // shouldn't happen — every provider in PROVIDERS is pre-seeded
  entry.lastAttemptAt = new Date().toISOString();
  if (error) {
    entry.lastError = error.message;
    entry.status = classifyKeyError(error.message);
  } else {
    entry.lastSuccessAt = entry.lastAttemptAt;
    entry.lastError = null;
    entry.status = 'ok';
  }
}

export class AIClient {
  // Categories this can return. UNCLEAR and NONE are both "no keyword-list match", but
  // they mean opposite things for routing: NONE is a confident "this is a normal
  // review", UNCLEAR is "couldn't confidently tell" — callers must treat UNCLEAR as
  // dangerous (route to a human), never as safe. Defaulting uncertainty to "safe" is
  // exactly backwards — the cases the classifier is least sure about are where a human
  // matters most, not least.
  static DANGER_CATEGORIES = ['FOOD_SAFETY', 'LEGAL', 'HARASSMENT', 'REFUND', 'TOXIC', 'REPUTATIONAL', 'UNCLEAR', 'NONE'];

  static SENTIMENTS = ['POSITIVE', 'NEGATIVE', 'MIXED', 'UNCLEAR'];

  /**
   * One combined, language-agnostic classification call — danger category AND actual
   * sentiment of the text itself, in a single request (not two, to keep API usage down).
   *
   * The sentiment half exists because star rating alone is not trustworthy: a 5-star
   * review can carry a genuine complaint ("Terrible service", 5 stars — happens more
   * than you'd think), and a 1-star review can be genuinely glowing text. An earlier
   * version of this pipeline trusted star rating alone for choosing reply tone and
   * auto-posted a cheerful "thanks for the love!" reply to a 5-star review that said
   * "Terrible service" — this call is what the orchestrator uses to catch that instead
   * of trusting the star icon someone clicked.
   *
   * @param {string} reviewText
   * @param {number} [stars] - Optional star rating (1-5), passed only as weak supporting
   *   context for genuinely ambiguous cases (e.g. a danger keyword next to a strong
   *   positive word) — this call is only ever made when a rule-based pass already found
   *   the review ambiguous, so the extra context can help without reintroducing the
   *   earlier bug where star rating was trusted over what the text actually says.
   * @returns {Promise<{dangerCategory: string, sentiment: string}>}
   *   dangerCategory is one of AIClient.DANGER_CATEGORIES, sentiment one of
   *   AIClient.SENTIMENTS. Both default to their "needs caution" value (UNCLEAR) if
   *   every provider fails or returns something unparseable — never silently defaults
   *   to the safe-looking value (NONE / a trusted sentiment) on failure.
   */
  static async classifyReview(reviewText, stars) {
    const starContext = stars
      ? `\n\nThe review's star rating is ${stars}/5 — use this ONLY as weak supporting context for a genuinely ambiguous review. If the review text clearly says something different from what the star rating alone would suggest, the text always wins.`
      : '';

    const systemPrompt = `You are a content classifier for restaurant review replies. The review may be written in ANY language (English, Hindi, Kannada, Tamil, Telugu, Malayalam, or a mix/transliteration) — judge the actual meaning, not just English keywords.

Respond with EXACTLY TWO WORDS separated by a single space, nothing else: <DANGER_CATEGORY> <SENTIMENT>

DANGER_CATEGORY — one of:
FOOD_SAFETY - food poisoning, illness after eating, contamination, pests, hygiene issues
LEGAL - threats of legal action, lawyer, police, fraud/scam accusations
HARASSMENT - inappropriate behavior, discrimination, feeling unsafe, assault
REFUND - requests for a refund, money back, compensation, being overcharged
TOXIC - profanity, slurs, or language personally abusive toward staff (NOT just a harsh opinion about the food, like "this was garbage" — that's a normal negative review, not abuse)
REPUTATIONAL - explicit threats to make this go viral, post it on the news/media, or "expose" the business
UNCLEAR - you cannot confidently tell what the review is about
NONE - none of the above apply — this also covers a word that LOOKS like a danger trigger but is clearly used in a positive sense (e.g. "I loved the raw onions" is NOT a food-safety complaint, it's praise)

SENTIMENT — the ACTUAL sentiment of the review TEXT itself:
POSITIVE - genuinely happy or satisfied
NEGATIVE - genuinely unhappy or complaining, even if phrased mildly or sarcastically (e.g. "Oh yes, amazing service, waited one hour" is NEGATIVE, not positive)
MIXED - real positive and negative elements both present
UNCLEAR - can't confidently tell${starContext}

Example valid responses: "NONE POSITIVE" or "FOOD_SAFETY NEGATIVE" or "NONE MIXED"`;

    const userPrompt = `Review text: ${reviewText}`;

    for (const provider of PROVIDERS) {
      try {
        const result = await this.callWithTimeout(provider, systemPrompt, userPrompt, 8000);
        const parsed = this.parseClassification(result);
        if (parsed) return parsed;
        console.warn(`[AI Failsafe] ${provider.url} returned an unparseable classification ("${result}"), trying next provider.`);
      } catch (err) {
        console.warn(`[AI Failsafe] classifyReview via ${provider.url} failed: ${err.message}`);
      }
    }

    console.error('[AI Failsafe] Classification failed on every provider — defaulting to UNCLEAR/UNCLEAR (routes to human).');
    return { dangerCategory: 'UNCLEAR', sentiment: 'UNCLEAR' };
  }

  static parseClassification(text) {
    if (!text) return null;
    const tokens = text.trim().toUpperCase().split(/\s+/);
    const dangerCategory = this.DANGER_CATEGORIES.find((c) => tokens.includes(c))
      || this.DANGER_CATEGORIES.find((c) => text.toUpperCase().includes(c));
    const sentiment = this.SENTIMENTS.find((s) => tokens.includes(s))
      || this.SENTIMENTS.find((s) => text.toUpperCase().includes(s));
    if (!dangerCategory && !sentiment) return null;
    return { dangerCategory: dangerCategory || 'UNCLEAR', sentiment: sentiment || 'UNCLEAR' };
  }

  static async callWithTimeout(provider, systemPrompt, userPrompt, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.5,
          max_tokens: 250, // gpt-oss's reasoning tokens count against this budget too
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      recordKeyAttempt(provider, null);
      return data.choices?.[0]?.message?.content;
    } catch (err) {
      recordKeyAttempt(provider, err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Current status of every key in the rotation pool, for the health panel. */
  static getKeyHealth() {
    return Array.from(KEY_HEALTH.values());
  }
}
