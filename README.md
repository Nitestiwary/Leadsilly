# Leadsilly - Phone Number & Email Extractor

Leadsilly is a production-ready B2B contact extraction Chrome Extension and backend suite that automatically parses webpages for Emails, Phone Numbers, Social Profiles (LinkedIn, Facebook, Instagram, Twitter/X), and schema elements.

---

## 🛠 Tech Stack
- **Frontend / Extension**: React, TypeScript, Tailwind CSS, Vite (Manifest V3)
- **Backend API**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL (UUID index keys, relational models)
- **Integrations**: Stripe, Razorpay (Multi-gateway USD/INR subscriptions), Google Sheets API (Manual/Auto Sync)

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
5. Click **Load unpacked** and select the compiled `dist/` folder inside `leadsilly/extension`.

---

## 🌐 API Route Configurations

| Endpoint | Method | Security | Description |
|---|---|---|---|
| `/api/auth/google` | `POST` | Public | Sign in using Google ID Tokens / user provisioning |
| `/api/leads` | `POST` | Authenticated | Create lead metadata (with auto limit constraints & duplicate filters) |
| `/api/leads` | `GET` | Authenticated | Fetch workspace leads (supports search, tags, limit) |
| `/api/team/invite` | `POST` | Authenticated | Generate invitation token link |
| `/api/billing/checkout` | `POST` | Authenticated | Create Stripe/Razorpay subscription session |
| `/api/exports/xlsx` | `GET` | Authenticated | Export leads to formatted Excel spreadsheet |
| `/api/exports/pdf` | `GET` | Authenticated | Draw PDF report tables |
| `/api/exports/google-sheets` | `POST` | Authenticated | Sync/Append leads directly to Google Sheets |
