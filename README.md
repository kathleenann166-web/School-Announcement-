# Crestview Bulletin — Campus Announcement & Resident Notification Hub

Centralized web application for schools and residential campuses so announcements are never scattered or missed. Includes **Admin** and **Resident** accounts, real-time WebSocket updates, read acknowledgments, and automated HTML email notifications.

## Features

- **Admin & Resident Accounts**: Secure `scrypt`-hashed password authentication and signed Bearer sessions. First-run Admin setup flow (`Setup Admin Account`) locks automatically after claiming, with optional `ADMIN_PASSCODE` environment guard.
- **Admin Dashboard**: Publish, edit, pin, archive, and delete announcements; track live read acknowledgments; manage the Resident directory; and inspect email dispatch logs.
- **Resident Portal**: Filter announcements by category, priority (`Standard`, `Important`, `Urgent`), or unread status; acknowledge notices; and manage email alert preferences.
- **Real-Time WebSocket Updates (`/ws`)**: Newly posted, edited, pinned, archived, or acknowledged announcements broadcast immediately to all connected dashboards without refreshing.
- **Email Notifications (`nodemailer`)**: Automatically dispatches responsive HTML emails to opted-in residents when `SMTP_*` variables are configured, and logs a full HTML Outbox Preview in the Admin Email Logs tab.

## Deploying from a GitHub Branch

1. Push this repository to a GitHub branch (e.g., `main`).
2. Connect the branch to your Node.js hosting provider (Render, Railway, Fly.io, Cloud Run, etc.).
3. Configure build and start commands:
   - **Install**: `npm install`
   - **Build**: `npm run build`
   - **Start**: `npm start` (runs `node server.ts` on `process.env.PORT || 3000`)
4. Optional Environment Variables (see `.env.example`):
   - `ADMIN_PASSCODE` — Optional setup passcode required when claiming the initial Admin account.
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — SMTP credentials for live resident email delivery.
   - `APP_URL` — Public URL included in announcement notification emails.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser. SQLite persists data automatically in `data/campus.db`.
