# OMSU Mamburao Campus Portal — Official Announcements & Notifications

Centralized school announcement web application for **Occidental Mindoro State University — Mamburao Campus** with **Admin**, **Enrolled College Student (`BSIT 1-B`)**, and **Teacher / Faculty** accounts, strict OMSU enrollment verification, real-time WebSocket updates, and automated HTML email alerts.

## Key Features

- **Role-Based Portal Accounts**:
  - **Admin Dashboard**: Manage announcements (create, edit, pin, archive, delete), manage Portal Accounts, manage the Official OMSU Enrolled Roster (single add + bulk import), inspect Email Dispatch Logs, and configure Portal & Student Portal settings live.
  - **Enrolled Student & Teacher Portals**: Search and filter campus announcements by category (`Academics`, `Operations`, `Events`, `Health & Safety`, `Financial`, `Athletics`) and priority (`Standard`, `Important`, `Urgent`), acknowledge notices, and manage email notification opt-ins.
- **OMSU-Only Enrollment Gate**: Student and teacher registration/login verify against the `enrolled_roster` table (`enrollment_status = 'enrolled'`), blocking unauthorized guest access (`401`/`403`).
- **Real-Time WebSocket Sync (`/ws`)**: Authenticated Admin, Student, and Teacher sessions receive live bulletin updates, read-count updates, and portal settings changes without refreshing.
- **Automated Email Alerts (`nodemailer`)**: Sends responsive HTML announcements to opted-in students and teachers via configured `SMTP_*` credentials, with full HTML Outbox Previews logged in Admin Email Logs.

## Upload & Deploy from a GitHub Branch

### 1. Push Code to a GitHub Branch

```bash
git init
git add .
git commit -m "OMSU Mamburao Campus Announcement Portal"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

To deploy from a dedicated branch (for example `deploy` or `production`):

```bash
git checkout -b deploy
git push -u origin deploy
```

> **Note on Hosting:** Because this app includes an Express backend, SQLite database (`better-sqlite3`), WebSockets (`ws`), and `nodemailer`, deploy your GitHub branch to a **Node.js hosting platform** (such as **Render**, **Railway**, **Fly.io**, or **Google Cloud Run**)—static-only GitHub Pages cannot execute the Node/SQLite backend.

### 2. Hosting Build & Start Commands

- **Runtime**: Node.js `>=22.18.0` (pinned via `.node-version` and `package.json` `engines`)
- **Install Command**: `npm install`
- **Build Command**: `npm run build`
- **Start Command**: `npm start` (runs `node server.ts` on `process.env.PORT || 3000`)

### 3. Production Environment Variables (See `.env.example`)

- `ADMIN_PASSCODE` — Recommended in production to protect initial Admin claiming and disable quick-fill demo credentials.
- `APP_URL` — Public HTTPS URL of your deployed site.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — SMTP credentials for sending live email alerts.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. SQLite stores data automatically in `data/campus.db` (ignored by `.gitignore`).
