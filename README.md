# 💬 Realtime Chat

A minimal real-time chat web app built with **Firebase Realtime Database** and
**Anonymous Auth**, deployed as a **static site on [Render.com](https://render.com)**.

No build step, no backend server — Firebase handles realtime sync directly from
the browser.

---

## Features

- Real-time messaging (messages appear instantly for everyone)
- Anonymous sign-in — pick a display name and go
- Live connection indicator
- Last 100 messages loaded on join
- Server-side security rules validating every message
- Responsive UI (mobile + desktop)

## Tech stack

| Layer     | Choice                                   |
| --------- | ---------------------------------------- |
| Frontend  | Vanilla HTML/CSS/JS (ES modules)         |
| Realtime  | Firebase Realtime Database (modular SDK) |
| Auth      | Firebase Anonymous Auth                  |
| Hosting   | Render.com static site                   |

---

## 1. Firebase setup (project `emrtemplate`)

1. **Enable Anonymous Auth**
   Firebase console → **Build → Authentication → Sign-in method** →
   enable **Anonymous**.
   <https://console.firebase.google.com/project/emrtemplate/authentication/providers>

2. **Create a Realtime Database**
   Firebase console → **Build → Realtime Database** → **Create Database**.
   Start in locked mode — the rules in `database.rules.json` will secure it.
   <https://console.firebase.google.com/project/emrtemplate/database>

3. **Get your web config**
   Firebase console → **Project settings** → **Your apps** → add/select a **Web app**
   → copy the config object, then paste the values into
   [`firebase-config.js`](firebase-config.js).
   <https://console.firebase.google.com/project/emrtemplate/settings/general>

4. **Publish the security rules**
   Copy the contents of [`database.rules.json`](database.rules.json) into
   **Realtime Database → Rules → Publish**, or deploy via the Firebase CLI:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use emrtemplate
   firebase deploy --only database
   ```

## 2. Run locally

Because the app uses ES modules, open it through a local server (not `file://`):

```bash
npx serve .
```

Then visit the printed URL (e.g. <http://localhost:3000>).

## 3. Deploy on Render.com

This repo includes a [`render.yaml`](render.yaml) Blueprint.

1. Push this repo to GitHub (already at `inwkoki/emrreccord`).
2. In Render: **New → Blueprint**, connect the GitHub repo, and Render reads
   `render.yaml` automatically. It creates a **static site** serving the repo root.
3. Click **Apply**. Every push to `main` auto-deploys.

Alternatively, **New → Static Site** manually:
- **Build command:** _(leave empty)_
- **Publish directory:** `.`

---

## Project structure

```
index.html            Chat UI
styles.css            Styling
app.js                Chat logic (Firebase SDK from CDN)
firebase-config.js    Your Firebase web config  ← fill this in
database.rules.json   Realtime Database security rules
firebase.json         Firebase CLI config
render.yaml           Render static-site blueprint
```

## Security notes

- Firebase web API keys are **identifiers, not secrets** — safe to commit.
  Actual protection comes from the Realtime Database rules.
- Rules require authentication, pin each message's `uid` to the sender, and
  validate message length/shape. Messages are append-only (no edits/deletes).
