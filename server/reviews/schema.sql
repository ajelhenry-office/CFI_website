CREATE TABLE IF NOT EXISTS review_locations (
  id SERIAL PRIMARY KEY,
  store_name VARCHAR(255) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  google_account VARCHAR(255) NOT NULL,
  google_location_path VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT true,
  UNIQUE(google_account, google_location_path)
);

-- All point-in-time columns are TIMESTAMPTZ (never TIMESTAMP WITHOUT TIME ZONE) —
-- storing a raw ISO string (e.g. Google's createTime) into a WITHOUT TIME ZONE column
-- silently strips its UTC marker on write, while reads re-interpret the naive value
-- using the DB session's timezone (Asia/Kolkata) — an asymmetry that shifted every
-- review_date by 5:30 until this was found and fixed. TIMESTAMPTZ has no such ambiguity;
-- the DB session timezone (Asia/Kolkata) is what renders it correctly as IST wherever
-- it's displayed as text.
CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(500) PRIMARY KEY,
  store_name VARCHAR(255),
  brand VARCHAR(100),
  reviewer_name VARCHAR(255),
  star_rating INT,
  review_text TEXT,
  review_date TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'pending',
  ai_reply TEXT,
  final_reply TEXT,
  scenario VARCHAR(100),
  source VARCHAR(50),
  danger_category VARCHAR(50), -- food_safety/legal_fraud/harassment/refund/toxic/reputational_threat/unclear, else NULL
  replied_at TIMESTAMPTZ,
  google_update_time VARCHAR(50), -- Google's own updateTime string, compared as raw text (not a timestamp type) to avoid any timezone round-trip risk on this equality check; a change here means the customer edited it
  deleted_at TIMESTAMPTZ, -- set when the review no longer appears on Google (soft delete, not removed from the table)
  missing_since TIMESTAMPTZ, -- first time a review was noticed missing; only confirmed deleted after being missing across a grace period, since Google's review-list API has been observed to be occasionally inconsistent between calls
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_audit_log (
  id SERIAL PRIMARY KEY,
  review_id VARCHAR(500),
  action VARCHAR(100),
  details TEXT,
  actor_email VARCHAR(255), -- who sent/edited it, for manual actions; NULL for auto-replies
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reviews_filter ON reviews(status, brand, store_name, review_date);
