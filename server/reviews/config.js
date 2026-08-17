export const CONFIG = {
  // Brand details for AI context
  BRAND_NAME: 'Sharief Bhai',
  SUPPORT_EMAIL: 'support@curefoods.in',

  // 1. Toxic/Banned Words
  // A starter list of abusive words. In production, consider a real toxicity API.
  bannedWords: [
    'idiot', 'stupid', 'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'whore', 'slut'
  ],

  // 2. Escalation Categories (keywords that force human review, bypassing AI entirely)
  escalationKeywords: {
    health_safety: [
      'food poisoning', 'hospital', 'sick', 'vomit', 'diarrhea', 'roach', 'cockroach', 
      'insect', 'hair', 'worm', 'bug', 'allergic', 'allergy', 'raw', 'undercooked'
    ],
    legal_fraud: [
      'lawyer', 'sue', 'consumer court', 'fir', 'fraud', 'scam', 'cheated', 'police'
    ],
    discrimination_harassment: [
      'racist', 'harassment', 'misbehaved', 'assault', 'threat', 'unsafe', 'creep'
    ]
  },

  // 3. Liability Phrases (Guardrail Layer 2: Output check)
  // If the AI accidentally generates these phrases, route to human queue.
  liabilityPhrases: [
    'full refund', 'we will refund', 'our fault', 'we are liable', 'we admit',
    'free meal', 'compensation of', 'we take full responsibility', 
    'legally responsible', 'guaranteed refund'
  ],

  // 4. Pre-written Templates (No Text)
  positiveTemplatesNoText: [
    "Thank you so much for the 5-star rating! We hope to see you again soon at Sharief Bhai.",
    "We appreciate your wonderful rating! Looking forward to serving you again.",
    "Thanks for the love! Your rating means a lot to our team."
  ],
  negativeTemplatesNoText: [
    "We are sorry we didn't meet your expectations this time. Please let us know how we can improve.",
    "Thank you for your rating. We'd love to know what went wrong so we can fix it next time."
  ],

  // 5. Toxic Reply (Cold/Generic)
  toxicReply: "We have noted your feedback. Thank you.",

  // 6. Positive Keyword Match (Scenario C)
  positiveKeywordsMap: {
    'biryani': 'our authentic biryani',
    'biriyani': 'our authentic biryani',
    'mutton thali': 'the Mutton Thali',
    'thali': 'the Mutton Thali',
    'kebab': 'our delicious kebabs',
    'seekh': 'our seekh kebabs',
    'ambience': 'our ambiance',
    'atmosphere': 'our atmosphere',
    'aman': 'our team member Aman',
    'sameer': 'our team member Sameer'
  },
  
  positiveTemplatesMatch: [
    "We're thrilled you loved {matchedItem}! Thank you for the wonderful review, and we hope to welcome you back soon.",
    "Thank you for the fantastic review! It's great to hear you enjoyed {matchedItem}. See you next time!",
    "Your kind words about {matchedItem} made our day! We can't wait to serve you again at Sharief Bhai."
  ],

  sentimentMismatchWords: [
    'terrible', 'worst', 'disappointed', 'never again', 'waste of money', 'bad', 'awful', 'horrible'
  ],

  // 7. Failsafe Fallbacks (Layer 1: AI Timeout)
  failsafeFallbackPositive: "Thank you for taking the time to share this wonderful review! We truly appreciate your support and hope to see you again soon.",
  failsafeFallbackNegative: "We sincerely apologize for your disappointing experience. Please reach out to us at support@curefoods.in so our management team can investigate and make this right."
};