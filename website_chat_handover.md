# CUREFOODS Partner Dashboard — Complete Project Handover Document

## 1. Project Overview & Objective
The **CUREFOODS Partner Dashboard** (internally known as "KitchenPulse") is a high-performance, full-stack operational web application built to centralize the management and analytics for Curefoods' massive portfolio of restaurant brands (CakeZone, EatFit, Olio, Chaat Street, Krispy Kreme, etc.).

It solves the critical problem of fragmented dashboards across delivery platforms (Swiggy, Zomato, UrbanPiper) by providing a single pane of glass to:
1. Turn hundreds of stores online/offline instantly (respecting API rate limits).
2. Bulk update store timings.
3. Analyze thousands of raw customer reviews using Groq-powered AI.
4. Track core operational metrics (Ops Matrix) through Metabase integrations.

## 2. Tech Stack & Architecture
- **Frontend:** React 19 + Vite. Built with a strictly enforced "Royal Blue & White" custom CSS design system (no Tailwind/MUI). Uses `recharts` for visualization and `xlsx-js-style` / `jspdf` for robust reporting exports.
- **Backend:** Node.js + Express.
- **Database:** PostgreSQL (`pg` driver). Upgraded from legacy Supabase to handle complex analytical queries over large datasets (order ratings).
- **Task Management:** Built-in queuing system with Node `setInterval` and `node-cron` workers to handle asynchronous tasks and third-party rate limits.
- **AI Integration:** Groq SDK (`groq-sdk`) is used for generating rapid AI summaries of customer feedback.

---

## 3. Core Tabs & Workflows (Deep Dive)

### A. Toggle Tab (Store Management)
- **What it does:** Allows Operations Managers to bulk enable/disable (Online/Offline) hundreds of stores across Swiggy, Zomato, UrbanPiper, etc.
- **Why it was built:** Manually toggling stores during operational crises (e.g., ran out of gas, extreme weather, system outage) is too slow. 
- **Workflow & Features:**
  - **Draggable Bulk Progress Island:** When a bulk job starts, a sleek floating widget appears to track the real-time success/failure of each API call. It can be paused, resumed, or canceled.
  - **Intelligent Rate Limiting:** Delivery APIs (like Zomato/UrbanPiper) strict rate limit at ~18 requests/minute. The backend (`server/toggle/queue.js` and `workers.js`) handles these limits natively, automatically pacing API calls so IPs don't get banned.
  - **Audit Log Modal:** Retains a full history of all store toggles (with a 48-hour auto-purge in Postgres).

### B. Timing Tab
- **What it does:** Facilitates the bulk updating of store operational timings (Opening and Closing slots).
- **Workflow & Features:**
  - Managers select multiple stores and submit new timing payloads.
  - The request hits `/api/timing/bulk-update` which dumps the job into the `zomato_timing_queue` table in Postgres.
  - A background worker processes these updates.
  - **Legacy Fallback:** The system also has routes that can trigger GitHub Actions workflows to sync timings from legacy repositories if required.

### C. Ratings & Insights Tab
- **What it does:** The most complex analytical piece of the app. Transforms raw order reviews (parsed from daily Zomato/Swiggy emails) into 30+ dimensional insights.
- **Why it was built:** Curefoods needs to know *why* ratings are dropping. Is it the kitchen, delivery, or packaging? Is a specific SKU performing terribly?
- **Workflow & Features:**
  - **Command Palette Search:** Users press `/` to open a quick-search palette to jump between insights (e.g., "Peak Complaint Hours", "Worst Rated SKUs").
  - **Filter Optimizer:** Validates the user's global filters (Brand, City, Zone, Date Range). If a user tries to run a "Brand Comparison" with only one brand selected, the system alerts them to fix the filters.
  - **AI Text Insights (`TextAIInsight`):** Sends chunks of negative reviews to Groq AI to generate plain-English operational reports (e.g., "The primary reason for low ratings at CakeZone Indiranagar today is stale bread").
  - **Export Engine:** Every table and matrix can be instantly exported to highly-styled PDFs, Excel (`.xlsx`), CSVs, or embedded into HTML emails.

### D. Ops Matrix Tab
- **What it does:** Provides high-level operational performance metrics (prep time, dispatch time, cancellations).
- **Workflow & Features:**
  - Pulls live data from internal ClickHouse/Metabase servers.
  - Due to Metabase API limits, the backend (`server/ops_matrix/ops.routes.js`) proactively "warms up" and caches queries for different date ranges (7 days, 14 days, 30 days) and maps them to specific normalized brands (e.g., converting sub-brands into master brands like "Eatfit").

### E. Dine-in Reviews / Reviews Tab
- **What it does:** Centralized hub for managing Google Business Reviews.
- **Workflow & Features:**
  - Uses `server/reviews/poller.js` running on a `node-cron` schedule.
  - Automatically fetches the latest Google reviews for mapped locations.
  - Enables the team to setup rules for Auto-Replying to reviews, saving hours of manual reputation management.

### F. Route Backfilling
- **What it does:** An operational patch tool.
- **Why it was built:** Sometimes order routing systems fail, or data drops during platform syncs. This tab allows operations to manually assign or "backfill" the missing logistical data so financial reconciliation remains accurate.

### G. Settings & System Theme Tabs
- **Settings:** A static overview page showing the active user profile (e.g., "Ops Manager") and the connection health of integrations (Swiggy: ✅ Connected, Zomato: ✅ Connected).
- **System Theme:** Displays information about the app's fixed design system. The prompt explicitly mandated a strict "Royal Blue & White" theme (`#132664`). Dark mode and other themes are intentionally locked out to maintain a premium corporate aesthetic.

---

## 4. Backend Workers & Cron Jobs (Critical Context)
The backend does **not** just passively wait for HTTP requests. It acts as an active daemon:
1. `startWorkers()` (Toggle / Timing): Continuously polls Postgres queues to process rate-limited API calls in chunks.
2. `ReviewPoller.startCron()`: Periodically hits Google APIs to pull in new reviews.
3. `warmUpOpsCache()`: Pre-fetches heavy Metabase queries so the Ops Matrix tab loads instantly for frontend users.

## 5. Development Cheat Sheet
- **Start Frontend:** `npm run dev` (Runs Vite on `localhost:5173`)
- **Start Backend:** `npm run start` (Runs Express on `localhost:3001`)
- **Main Entry Points:** 
  - `src/App.jsx` (Frontend Layout & Routing)
  - `server.js` (Backend API & Worker initialization)
- **Database Context:** All data logic is located in `server/ratings/db.js`. Ensure you have a valid Postgres connection string in the `.env` file before running the backend.
