export const CONFIG = {
  // Brand details for AI context
  BRAND_NAME: 'Sharief Bhai',
  // Fallback contact email used only for a brand not listed in BRAND_SUPPORT_EMAILS below.
  SUPPORT_EMAIL: 'support@curefoods.in',
  // Per-brand contact email for dangerous-review replies — each brand gets its own,
  // rather than one shared address, since a customer contacting the business about a
  // serious issue should reach that brand's own team directly. See
  // buildDangerousTemplateReply() in orchestrator.js.
  BRAND_SUPPORT_EMAILS: {
    'Sharief Bhai': 'hello@shariefbhai.com',
  },

  // 1. Toxic/Banned Words — deliberately scoped to actual profanity/slurs directed at a
  // person, NOT harsh opinions about the food ("trash", "garbage", "disgusting"). A
  // furious "this food is garbage" is a strongly negative review, not abuse — conflating
  // the two would misroute ordinary negative reviews into the escalation queue.
  // This is only the fast English pre-filter; AIClient.classifyDanger() is the
  // authoritative, language-agnostic check for everything this list can't catch.
  bannedWords: [
    'idiot', 'stupid', 'fuck', 'fucking', 'motherfucker', 'shit', 'bitch', 'asshole',
    'bastard', 'cunt', 'dick', 'whore', 'slut', 'shut up', 'shameless'
  ],

  // 2. Escalation Categories — keywords that force human review, bypassing auto-post
  // entirely. Fast English pre-filter only; AIClient.classifyDanger() backs this up
  // for every other language (Hindi, Kannada, Tamil, Telugu, Malayalam, transliterated
  // or mixed text) and for phrasing these lists don't happen to cover.
  escalationKeywords: {
    // 'stale' deliberately excluded — it spans everything from "the bread was a bit dry"
    // to a genuine complaint, and unlike the words below it doesn't reliably signal a
    // hazard. It's handled as an ordinary negative review instead (hybrid template+AI).
    food_safety: [
      'food poisoning', 'food poison', 'hospital', 'sick', 'fell sick', 'fell ill',
      'vomit', 'threw up', 'throw up', 'nausea', 'nauseous', 'stomach ache', 'stomach pain',
      'diarrhea', 'roach', 'cockroach', 'insect', 'hair', 'worm', 'bug', 'maggot', 'maggots',
      'lizard', 'rat', 'allergic', 'allergy', 'raw', 'undercooked', 'expired', 'expiry',
      'moldy', 'mold', 'fungus', 'rotten', 'spoiled', 'spoilt', 'contaminated',
      'contamination', 'unhygienic', 'dirty kitchen', 'food safety', 'fssai'
    ],
    legal_fraud: [
      'lawyer', 'attorney', 'advocate', 'sue', 'suing', 'consumer court', 'consumer forum',
      'fir', 'fraud', 'defraud', 'defrauded', 'scam', 'cheated', 'swindled', 'ripped off',
      'police', 'legal action', 'legal notice', 'court', 'file a case', 'filing a complaint',
      'cybercrime', 'illegal', 'unlawful', 'take this to court'
    ],
    discrimination_harassment: [
      'racist', 'harassment', 'harassed', 'misbehaved', 'assault', 'threat', 'threatened',
      'threatening', 'unsafe', 'felt unsafe', 'creep', 'molest', 'molested', 'inappropriate',
      'staring', 'catcalled', 'discriminated', 'discrimination', 'casteist', 'communal',
      'sexist', 'sexual', 'grabbed', 'stalked', 'stalking'
    ],
    refund_related: [
      'refund', 'refunded', 'money back', 'give my money back', 'return my money',
      'reimburse', 'reimbursement', 'compensate', 'compensation', 'want my money',
      'charged wrongly', 'overcharged', 'double charged', 'wrong amount charged',
      'not refunded', 'refund not received', 'waiting for refund'
    ],
    // Threats to escalate publicly rather than legally — distinct from legal_fraud on
    // purpose. These usually signal something serious even when the review text itself
    // doesn't hit any other category, and a generic auto-reply here risks looking
    // dismissive right when it matters most — so it's always human-routed too.
    reputational_threat: [
      'make this viral', 'go viral', 'post this in the news', 'post on news', 'the news',
      'the media', 'expose this', 'expose the restaurant', 'name and shame', 'social media',
      'i will post', "i'll post", 'everyone will know'
    ]
  },

  // 3. Liability Phrases (Guardrail Layer 2: Output check)
  // If the AI accidentally generates these phrases, route to human queue — checked on
  // every AI-generated reply, unconditionally, regardless of which scenario produced it.
  liabilityPhrases: [
    'full refund', 'we will refund', 'refund your money', 'refund you', 'money will be refunded',
    'our fault', 'we are liable', 'we admit', 'free meal', 'compensation of', 'compensate you fully',
    'we take full responsibility', 'legally responsible', 'guaranteed refund'
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

  // 6. Positive Keyword Match — specific dishes/staff get their own named phrase
  // ("our authentic biryani", "our team member Aman"). Checked before the broader
  // 14-category system below, since a specific match reads more genuine than a generic
  // category phrase when both would apply to the same review.
  positiveKeywordsMap: {
    'biryani': 'our authentic biryani',
    'biriyani': 'our authentic biryani',
    'mutton thali': 'the Mutton Thali',
    'thali': 'the Mutton Thali',
    'kebab': 'our delicious kebabs',
    'seekh': 'our seekh kebabs',
    'aman': 'our team member Aman',
    'sameer': 'our team member Sameer'
  },

  positiveTemplatesMatch: [
    "We're thrilled you loved {matchedItem}! Thank you for the wonderful review, and we hope to welcome you back soon.",
    "Thank you for the fantastic review! It's great to hear you enjoyed {matchedItem}. See you next time!",
    "Your kind words about {matchedItem} made our day! We can't wait to serve you again at Sharief Bhai."
  ],

  // 6b. The 14 broader "what did the customer like" categories — deliberately broad
  // (especially "food") so that template-based replies cover almost every positive
  // review, and AI is only ever needed for the genuine rare case where literally none
  // of these fourteen apply. Each entry: keywords to detect it, and the natural phrase
  // used to name it inside the composed reply template (see buildPositiveTemplateReply
  // in orchestrator.js).
  positiveCategories: {
    food: { keywords: ['food', 'tasty', 'delicious', 'yummy', 'flavour', 'flavor', 'meal', 'dish'], phrase: 'the food' },
    staff_service: { keywords: ['staff', 'service', 'waiter', 'server', 'team', 'hospitality', 'friendly'], phrase: "our team's service" },
    dining_experience: { keywords: ['experience', 'visit', 'time here', 'overall'], phrase: 'your overall experience' },
    ambience: { keywords: ['ambience', 'ambiance', 'atmosphere', 'decor', 'interior', 'vibe', 'seating'], phrase: 'our ambience' },
    price_value: { keywords: ['value for money', 'worth it', 'reasonable', 'affordable', 'good value', 'pocket friendly'], phrase: 'the value for money' },
    cleanliness_hygiene: { keywords: ['clean', 'cleanliness', 'hygiene', 'hygienic', 'spotless', 'neat and tidy'], phrase: 'how clean and hygienic we keep things' },
    speed_convenience: { keywords: ['quick', 'quickly', 'fast', 'prompt', 'on time', 'speedy', 'no wait'], phrase: 'how quick and convenient it was' },
    location: { keywords: ['location', 'parking', 'easy to find', 'accessible'], phrase: 'how convenient our location is' },
    family_group: { keywords: ['family', 'kids', 'group', 'friends', 'everyone enjoyed'], phrase: 'hosting your family and friends' },
    special_occasion: { keywords: ['birthday', 'anniversary', 'celebration', 'occasion', 'celebrated'], phrase: 'being part of your celebration' },
    delivery_takeaway: { keywords: ['delivery', 'takeaway', 'take away', 'parcel', 'swiggy', 'zomato', 'packed', 'packing'], phrase: 'your delivery experience' },
    consistency: { keywords: ['again', 'every time', 'always', 'consistent', 'regular', 'usual', 'as always'], phrase: "that we've been consistent for you" },
    overall_recommendation: { keywords: ['recommend', 'must visit', 'must try', 'highly recommend'], phrase: "that you'd recommend us" },
  },

  // 6c. Building blocks for the composed positive template: Thank-you + what they liked +
  // a happy-dining-experience line + the fixed closer. Combined in orchestrator.js's
  // buildPositiveTemplateReply — a few variants of each piece so replies aren't identical
  // even when the same category matches repeatedly.
  positiveOpeners: [
    'Thank you so much for your wonderful review!',
    'Thank you for taking the time to share this!',
    'Thank you for the kind words!',
  ],
  positiveHappyStatements: [
    "It truly makes our day to know you had a great time with us.",
    "We're so happy to hear you had a wonderful dining experience.",
    "Knowing you enjoyed your visit means the world to our team.",
  ],
  positiveClosingLine: 'Hope to welcome you again soon!',

  // 6d. Strong, unambiguous positive-sentiment words — deliberately a SHORT, STRONG list
  // (not "good"/"nice", which are common enough to false-trigger constantly). This is the
  // signal orchestrator.js uses to detect a conflict worth asking AI about (e.g. a danger
  // keyword like "raw" appearing alongside "loved" — "I loved the raw onions with my
  // biryani" is positive, not a food-safety complaint). Kept narrow on purpose: AI should
  // only be consulted for genuine ambiguity, not every mildly-mixed review.
  strongPositiveWords: [
    'loved', 'love', 'amazing', 'excellent', 'fantastic', 'wonderful', 'best', 'great',
    'perfect', 'delicious', 'outstanding', 'awesome', 'incredible', 'superb'
  ],

  // 6e. The negative-review counterpart to positiveCategories — same pattern, same
  // combinable-blocks design. 'stale'/'cold' live here, NOT in escalationKeywords.food_safety
  // — a quality complaint, not a hazard. Deliberately excludes 'raw'/'undercooked' (those
  // stay in the danger list — a real food-safety signal, not just a quality gripe).
  // Multiple phrasing variants per keyword on purpose — "service was slow" and "slow
  // service" mean the same thing but don't share a substring, and simple substring
  // matching can't infer that, so both word orders need their own entry.
  negativeCategories: {
    food_quality: { keywords: ['cold', 'stale', 'bland', 'tasteless', 'not fresh', 'overcooked', 'soggy', 'watery', 'mediocre food', 'food was bad', 'poor quality food'], phrase: 'the food quality' },
    service: { keywords: ['slow service', 'service was slow', 'service is slow', 'service was very slow', 'service was so slow', 'the service was slow', 'service here is slow', 'poor service', 'bad service', 'rude', 'unfriendly', 'unprofessional', 'ignored us', 'inattentive staff', 'no one attended', 'staff was rude', 'staff were rude'], phrase: 'our service' },
    price: { keywords: ['expensive', 'overpriced', 'too costly', 'pricey', 'not worth the price', 'not worth the money', 'price was high', 'too expensive'], phrase: 'the pricing' },
    portion: { keywords: ['small portion', 'portion was small', 'portion size was small', 'tiny portion', 'less quantity', 'quantity was less', 'not enough food', 'portion size'], phrase: 'the portion size' },
    order_accuracy: { keywords: ['wrong order', 'wrong item', 'order was wrong', 'missing item', 'items missing', 'incomplete order', "didn't get what i ordered", "wasn't what i ordered"], phrase: 'getting your order right' },
    wait_time: { keywords: ['waited', 'long wait', 'took forever', 'long delay', 'late delivery', 'slow delivery', 'kept us waiting', 'delayed'], phrase: 'the wait time' },
  },

  // 7. Negative reply building blocks — pure pre-built templates, no AI generation
  // anywhere in this reply. Apology / appreciate feedback / promise to improve / invite
  // back are fixed lines; the "mention issue" slot is built from negativeCategories phrases
  // (see buildNegativeTemplateReply() in orchestrator.js) — one, or several combined for a
  // complex multi-issue review.
  negativeApologyLines: [
    "We're really sorry to hear about your experience.",
    "We sincerely apologize that things didn't go well.",
    "We're sorry your visit didn't meet your expectations.",
    "We're truly sorry to hear this.",
  ],
  negativeAppreciationLines: [
    "Thank you for taking the time to share this with us.",
    "We appreciate you letting us know.",
    "Thank you for your honest feedback.",
    "We're grateful you brought this to our attention.",
  ],
  negativeImproveLines: [
    "We're taking this feedback seriously and working on improving.",
    "We're already looking into this so we can do better.",
    "Your feedback helps us improve, and we're taking it to heart.",
    "We're committed to doing better going forward.",
  ],
  negativeInviteBackLines: [
    "We hope you'll give us another chance to serve you better.",
    "We'd love the opportunity to make your next visit a better one.",
    "We hope to welcome you back for a much better experience.",
    "We'd be glad to have you visit us again.",
  ],
  // Used in place of a matched issue phrase whenever no negativeCategory keyword matched
  // at all — inventing specifics that weren't in the review is worse than staying generic.
  negativeGenericIssueLine: "We're sorry we didn't meet your expectations this time.",

  // 8. Dangerous-review templates — the ONLY reply used for all 5 danger categories alike
  // (food safety, legal/fraud, harassment, refund, reputational threat). Deliberately
  // generic on purpose: specificity is what makes an ordinary reply sound genuine, but
  // specificity here is the risk (referencing the wrong detail, sounding like it confirms
  // something) — so every variant stays professional and non-committal. {EMAIL} is
  // replaced with SUPPORT_EMAIL when composed. See buildDangerousTemplateReply() in
  // orchestrator.js. Several variants so the same review type doesn't always post
  // identical wording.
  dangerousTemplates: [
    "We're very sorry to hear about your experience. We sincerely apologize for the concern you've raised. We take this kind of feedback very seriously and would like to understand what happened. Please contact us directly at {EMAIL} so our team can look into this for you. Thank you for bringing this to our attention.",
    "We're truly sorry to hear this. Please accept our sincere apologies for what you experienced. This is something we take very seriously, and we'd like the chance to address it properly. Kindly reach out to us at {EMAIL} so we can assist you further. Thank you for letting us know.",
    "We're deeply sorry about your experience. We want to acknowledge your concern and assure you we're taking it seriously. Please get in touch with us at {EMAIL} so our team can look into this properly. We appreciate you bringing this to our attention.",
    "We sincerely apologize for what happened. This is a serious matter, and we want to make sure it's addressed properly. Please contact us directly at {EMAIL} so we can assist you further. Thank you for sharing this with us.",
  ],
};