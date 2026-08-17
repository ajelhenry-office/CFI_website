import Groq from 'groq-sdk';
import { CONFIG } from './config.js';

// Initialize Groq client. Expects GROQ_API_KEY environment variable.
// If it's missing, it will throw, which is fine since we want failsafe to trigger or fail fast in dev.
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy_to_prevent_crash_if_not_set' });

export class AIClient {
  /**
   * Generates a reply using Groq AI. Wraps it in a 5-second timeout and 1 retry failsafe.
   * @param {Object} review - The Google Review object
   * @param {string} bucket - 'positive' or 'negative'
   * @param {string} locationName - The name of the outlet
   * @returns {Promise<string>} The generated reply, or the failsafe fallback string.
   */
  static async generateReply(review, bucket, locationName) {
    const stars = review.starRating;
    const comment = review.comment || '';
    
    let systemPrompt = '';
    
    if (bucket === 'positive') {
      systemPrompt = `You are a friendly staff member replying to a positive Google review for ${CONFIG.BRAND_NAME}, ${locationName} outlet. Write a short, warm, genuine thank-you. Do not use generic corporate language. Keep it under 2 sentences. At most one emoji. No matter what language the customer uses, you must ALWAYS write your reply in English.`;
    } else {
      systemPrompt = `You are the Senior Manager at ${CONFIG.BRAND_NAME}. A customer had a bad experience at the ${locationName} outlet. Follow these strict rules:
1. Identify their specific complaint and apologize for that specific thing without making excuses.
2. State that the issue is being escalated to the outlet manager.
3. End by asking them to email ${CONFIG.SUPPORT_EMAIL} so we can investigate.
Never admit legal fault, never promise a specific refund or compensation amount, never argue with the customer or blame them. Keep it polite, highly professional, and under 3 sentences. No matter what language the customer uses, you must ALWAYS write your reply in English.`;
    }

    const userPrompt = `Star Rating: ${stars}\nReview Text: ${comment}`;

    try {
      // Layer 1: Availability failsafe (Timeout & Retry)
      return await this.callGroqWithRetry(systemPrompt, userPrompt);
    } catch (error) {
      console.error('[AI Failsafe] Groq generation failed:', error.message);
      // Fallback to static templates
      return bucket === 'positive' 
        ? CONFIG.failsafeFallbackPositive 
        : CONFIG.failsafeFallbackNegative;
    }
  }

  static async callGroqWithRetry(systemPrompt, userPrompt, retries = 1, timeoutMs = 5000) {
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await this.callGroqWithTimeout(systemPrompt, userPrompt, timeoutMs);
        if (response && response.trim()) {
          return response.trim();
        }
      } catch (err) {
        if (i === retries) throw err;
        console.warn(`[AI Failsafe] Groq call failed, retrying... (${err.message})`);
      }
    }
    throw new Error('Groq returned empty response');
  }

  static callGroqWithTimeout(systemPrompt, userPrompt, timeoutMs) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          model: 'llama3-8b-8192', // Fast and cheap for production
          temperature: 0.5,
          max_tokens: 150, // We only want short replies
        });
        
        clearTimeout(timer);
        resolve(chatCompletion.choices[0]?.message?.content);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }
}
