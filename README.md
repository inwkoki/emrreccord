# 🩺 ED QuickCapture

Type patient notes at the **bedside on your phone** → they pop up **live at the
station computer**, formatted and ready to paste into the EMR. Built for a busy
ED where retyping at a workstation wastes time.

Built with **Firebase Realtime Database** + **Anonymous Auth**, hosted as a
static site on **[Render.com](https://render.com)**. No build step, no server.

> ⚠️ **Prototype — not a certified / HIPAA / PDPA-compliant EMR.** Do not store
> real identifiable patient data until it is properly secured, access-controlled,
> and covered by your institution's data-governance policies. Use bed numbers,
> not patient names.

---

## How it works

```
  📱 Bedside phone                       🖥️ Station computer
  ───────────────                        ──────────────────
  Bed / identifier                       ┌ live patient list ┐
  Chief complaint          ──Firebase──▶ │  Bed 12 · chest…  │ ──▶ 📋 Copy → paste
  History                    realtime    │  Bed 7  · SOB…    │      into hospital EMR
  Physical exam                          └───────────────────┘ ──▶ ✓ Mark recorded
  Bedside test
     [ ⬆️ Send ]
```

- **Bedside (phone):** create/select a patient by bed number, fill any of the
  four sections, hit **Send**. You can re-open the same patient later to add the
  exam or bedside test — it updates live.
- **Station (computer):** a real-time board of active patients; cards **flash**
  when updated. Click one to see the compiled note, **📋 Copy for EMR**, then
  **✓ Mark recorded** to clear it from the board.

## Accounts

- **Username + PIN** login with a **Sign up** option, backed by Firebase Auth.
- Under the hood, usernames map to `username@edqc.app` (Firebase Email/Password);
  the 4–8 digit PIN is the password (padded to meet Firebase's minimum length).
- Login persists across refreshes, and your display name is stamped on every note.
- A PIN is **convenience-grade** security — see the privacy note below.

## Features

- Real-time bedside → station sync (no refresh, no retyping)
- One patient = one live record, editable section-by-section from the phone
- Station note is pre-formatted for pasting into any EMR
- Connection indicator, relative timestamps, "who entered it"
- Server-side security rules validating every field
- Responsive — phone-first bedside view, wide station view

## Tech stack

| Layer    | Choice                                   |
| -------- | ---------------------------------------- |
| Frontend | Vanilla HTML/CSS/JS (ES modules)         |
| Realtime | Firebase Realtime Database (modular SDK) |
| Auth     | Firebase Anonymous Auth                  |
| Hosting  | Render.com static site                   |

---

## 1. Firebase setup (project `emrtemplate`)

1. **Enable Email/Password Auth** — Authentication → Sign-in method → enable
   **Email/Password**. (Usernames are mapped to `username@edqc.app` internally;
   the PIN is the password.)
   <https://console.firebase.google.com/project/emrtemplate/authentication/providers>
2. **Create a Realtime Database** — Build → Realtime Database → Create Database (locked mode).
   <https://console.firebase.google.com/project/emrtemplate/database>
3. **Get your web config** — Project settings → Your apps → Web app → copy the
   config into [`firebase-config.js`](firebase-config.js).
   <https://console.firebase.google.com/project/emrtemplate/settings/general>
4. **Publish the rules** — paste [`database.rules.json`](database.rules.json) into
   Realtime Database → Rules → Publish (or `firebase deploy --only database`).

## 2. Run locally

```bash
npx serve .
```

Open the URL on a computer (Station) and on your phone (Bedside) — same database,
live sync. For local phone testing, both devices must reach the same host.

## 3. Deploy on Render.com

Includes a [`render.yaml`](render.yaml) blueprint:

1. Push to GitHub (`inwkoki/emrreccord`).
2. Render → **New → Blueprint** → connect the repo → **Apply**.
3. Every push to `main` auto-deploys.

---

## Data model

```
/encounters/{id}:
  bed        "Bed 12"            (required identifier)
  complaint  "..."               chief complaint
  history    "..."               HPI / PMH / meds / allergies
  exam       "..."               physical exam
  bedside    "..."               ECG / POCUS / CBG / dip …
  by         "Dr. Koki"          who entered it
  status     "active" | "recorded"
  createdAt / updatedAt          server timestamps
```

## Files

```
index.html            Setup + bedside + station views
styles.css            Clinical UI
app.js                Realtime logic (Firebase SDK from CDN)
firebase-config.js    Your Firebase web config  ← fill this in
database.rules.json   Realtime Database security rules
firebase.json         Firebase CLI config
render.yaml           Render static-site blueprint
```

## Security & privacy notes

- Firebase web API keys are identifiers, not secrets — safe to commit. Real
  protection comes from the database rules.
- The current rules allow any anonymous device to read/write the shared board —
  fine for a prototype/demo, **not** for real PHI. For production you would add
  proper (non-anonymous) staff authentication, per-user/department scoping,
  audit logging, encryption, and a signed BAA/data-processing agreement.
