# Leadsilly - Phone Number & Email Extractor

Leadsilly is a production-ready B2B contact extraction Chrome Extension and backend API suite. It automatically parses webpages for Emails, Phone Numbers, Social Profiles (LinkedIn, Facebook, Instagram, Twitter/X), and schema elements.

---

## ✨ Features & Capabilities

### 🔍 Contact Scraping Engine
* **Multi-Record Scanning**: Scrapes lists of businesses, search result listings, and Yelp/Google Maps pages in one click, mapping properties to standard fields or marking missing data as `N/A`.
* **Deep Parsing**: Scrapes JSON-LD metadata, microdata, open-graph cards, anchor links, and uses regex scanning on raw DOM text for email and telephone matching.

### 💾 Lead Management & Exports
* **Client-Side Exporting**: Exposes robust CSV, Excel (.xlsx), and PDF download managers directly inside the browser extension.
* **Google Sheets Sync**: Links with your Google account, automatically creates a formatted sheet (or appends to an existing one), updates leads in real-time, and opens the sheet instantly in a new tab.
* **Smart Duplication Checks**: Supports `Skip Match`, `Overwrite`, or `Merge Fields` strategies when saving duplicate leads.

### 💳 Daily Usage Limits & Subscriptions
* **Tiered Accounts**:
  * **Free**: 50 credits/day
  * **Individual**: 500 credits/day (Premium Subscription)
  * **Team**: 2500 credits/day
  * **Agency**: 10000 credits/day
* **Server-Synced Tracking**: Remaining daily credits are calculated and tracked on the PostgreSQL server, preventing users from resetting credit limits by reinstalling the extension.
* **Double-Gateway Subscriptions**: Integrated with Stripe (USD subscriptions) and Razorpay (INR payments) directly in the backend.

### 🔒 Chrome Web Store Compliant & Secure
* **Least Privilege permissions**: Limits host permissions strictly to your local/production API endpoints (`http://localhost:5000/*` and `https://leadsilly.com/*`), matching Google's latest security guidelines.
* **Dynamic ActiveTab scripting**: Injects parsing scripts on-demand only when you click the scraper, eliminating broad install warnings.
* **Strict Manifest V3 Configuration**: Uses Vite for compilation and contains zero remote code execution or inline scripting (CSP compliant).

---

## 🛠 Tech Stack
* **Frontend / Extension**: React, TypeScript, Tailwind CSS, Vite (Manifest V3)
* **Backend API**: Node.js, Express.js, TypeScript
* **Database**: PostgreSQL (UUID index keys, relational models)
* **Integrations**: Stripe API, Razorpay API, Google Sheets API, Google OAuth2

---

## 📂 Project Structure
```
leadsilly/
├── backend/                   # Node.js + Express API
├── extension/                 # Chrome Extension React UI & Scraping Engine
├── database/
│   └── schema.sql             # DB Tables schema initialization
├── docker-compose.yml         # Container runner
└── README.md                  # Project details
```

---

## 🚀 Quick Start Instructions

### 1. Run via Docker Compose
To boot the database (PostgreSQL) and the Express backend API:
```bash
docker-compose up --build
```
The database will automatically initialize using `database/schema.sql`. The API server will listen on `http://localhost:5000`.

### 2. Manual Local Setup

#### Database Setup
Create a PostgreSQL database named `leadsilly` and run the queries in `database/schema.sql`:
```bash
psql -U postgres -d leadsilly -f database/schema.sql
```

#### Backend Setup
1. Move to backend directory and install:
   ```bash
   cd backend
   npm install
   ```
2. Setup environment keys in a `.env` file (copied from `.env` template).
3. Run compiler/dev mode:
   ```bash
   npm run dev
   ```

#### Chrome Extension Setup
1. Navigate to the extension folder and install:
   ```bash
   cd extension
   npm install
   ```
2. Compile and package the extension:
   ```bash
   npm run build
   ```
   This compiles output files into the `dist/` directory.
3. Open Google Chrome, navigate to `chrome://extensions/`.
4. Enable **Developer Mode** in the top right.
5. Click **Load unpacked** and select the compiled `dist/` folder inside `leadsilly/extension` (or use the packaged folder on your Desktop).

---

## 🌐 API Route Configurations

| Endpoint | Method | Security | Description |
|---|---|---|---|
| `/api/auth/google` | `POST` | Public | Sign in using Google ID / Access Tokens (saves to `oauth_tokens`) |
| `/api/leads` | `POST` | Authenticated | Create lead metadata (with auto limit constraints & duplicate filters) |
| `/api/leads` | `GET` | Authenticated | Fetch workspace leads (supports search, tags, limit) |
| `/api/team/invite` | `POST` | Authenticated | Generate invitation token link |
| `/api/billing/checkout` | `POST` | Authenticated | Create Stripe/Razorpay subscription session |
| `/api/exports/xlsx` | `GET` | Authenticated | Export leads to formatted Excel spreadsheet |
| `/api/exports/pdf` | `GET` | Authenticated | Draw PDF report tables |
| `/api/exports/google-sheets` | `POST` | Authenticated | Sync/Append leads directly to Google Sheets |
