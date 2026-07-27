# 🫀 ED QuickCapture — Session Handoff

Continuity note for resuming work in a fresh chat. Read this + the code to get up to speed.

## What this is
A real-time **Emergency Department documentation web app**: nurses/doctors type at the
**bedside (phone)**, it appears live at the **station (computer)**, formatted for one-click
copy into the hospital EMR — no retyping. Plus a dedicated **CPR/resuscitation record**.

- **Repo:** https://github.com/inwkoki/emrreccord (branch `main`)
- **Live:** https://emrreccord.onrender.com/  (Render **static site**, auto-deploys on push to `main`)
- **Owner GitHub:** `inwkoki` (gh CLI is authenticated as this)

## Stack / architecture
- **Vanilla HTML/CSS/JS** (ES modules), **no build step**. Files: `index.html`, `styles.css`,
  `app.js`, `firebase-config.js`, `database.rules.json`, `firebase.json`, `render.yaml`.
- **Firebase Realtime Database** + **Email/Password Auth**. Firebase project: **`emrtemplate`**
  (RTDB region **asia-southeast1**). Web config is in `firebase-config.js` (public keys — fine to commit).
- Firebase SDK loaded from gstatic CDN inside `app.js`.

## Auth model (important)
- Login is **username + PIN**. Internally: email = `username@edqc.app` (lowercased),
  password = `PIN + "#EDqc"` (pepper, to meet Firebase's 6-char min). See `emailFor`/`passwordFor`.
- **Accounts:**
  - `ponkrit` / PIN `2486` — the real user (display name "Koki").
  - `demodoc` / PIN `1234` — my test account (display "Dr. Demo"). Has leftover test chips/templates
    (per-user, so they do NOT show in ponkrit's view).
- No real emails → **no self-service reset when fully locked out**; owner resets in the Firebase
  console (Authentication → user → Reset password). Signed-in users can change PIN in ⚙️ Account.

## Data model (RTDB)
- `/encounters/{id}` (shared dept board): `bed, complaint, history, vBp,vHr,vRr,vSpo2,vTemp,vGcs,
  oxygen, exam, bedside, management, antibiotic, fluid, consult, disposition, by, byUid,
  status('active'|'recorded'), createdAt, updatedAt, cpr(text), cprState(JSON)`.
- `/users/{uid}`: `username, displayName, createdAt, normalPe,
  chips/{group}` (arrays; groups: `ud, mgmt, abx, vaso, fluidtypes, neb`),
  `templates/{tid}: {name, fields{}, order}`.
- `/sharedTemplates/{tid}`: `{name, fields{}, by, byUid}` (dept templates; creator-only write/delete).

## Security rules — HOW TO DEPLOY THEM (gotcha!)
`database.rules.json` is the **source of truth** but is **NOT auto-deployed**. There's no Firebase
CLI login here. **Rules are published manually in the Firebase console via Claude-in-Chrome:**
1. Open `https://console.firebase.google.com/project/emrtemplate/database/emrtemplate-default-rtdb/rules`
2. Set the CodeMirror value via JS: `document.querySelector('.CodeMirror').CodeMirror.setValue(JSON.stringify(rules,null,2))`
3. Click **Publish** (button ~coord [611,133]); confirm the "unpublished changes" banner disappears
   (sometimes needs 2 clicks; navigating away triggers a "Leave site?" dialog if not published).

**Any rules change in `database.rules.json` MUST be republished this way or writes get PERMISSION_DENIED.**

## Features built (all live + verified)
- Screens: **auth → role picker → bedside / station / cpr**, plus **⚙️ Account** modal.
- **Bedside:** tappable patient tabs (own-first, sorted by recent); condition quick-templates
  (Sepsis, Chest pain, Anaphylaxis [observe +2h auto-time], Stroke, Trauma); one-tap **U/D chips**
  (editable per user); **structured vitals** + O₂; **Physical exam builder** (each system is a
  type-or-pick combobox) + **＋ Normal** (uses per-user editable Normal PE); bedside test;
  **Initial management** chips + septic-workup bundle (editable); **💊 Meds builder** — antibiotic
  (searchable input+datalist, editable list), vasopressor / IV-fluid-loading / nebulization
  (all editable per-user lists); consult + disposition; **personal + dept templates**
  (save / apply / **✎ edit** / delete / **▲▼ reorder** / share-with-dept); send.
- **Templates support auto-time macros:** `{{now}}, {{now+2h}}, {{now+30m}}, {{now-1h}}, {{date}},
  {{datetime}}` — expanded on apply (`expandMacros` in app.js). This is how users build their own
  dynamic templates like anaphylaxis.
- **Station:** live board (own-first + "mine" tag, flashes on update); detail note (`formatNote`
  composes vitals/exam/mgmt/meds/consult/dispo + full **CPR record**); **📋 Copy for EMR**;
  **✓ Mark recorded**.
- **CPR screen** (🫀 from bedside): detailed resuscitation record (~94 inputs, radios/checkboxes/
  text) modeled on a real case; saves `cpr` (readable) + `cprState` (JSON for round-trip repopulate).
- **⚙️ Account:** change display name (updateProfile + /users/uid/displayName), change PIN
  (reauth + updatePassword), forgot-PIN explainer, edit **Normal physical exam** (/users/uid/normalPe).
- Per-user chips (ud/mgmt/abx/vaso/fluid/neb) are editable (✏️): add/remove/reorder, custom items
  appear first (favourites-first).

## Dev workflow
- **Local test:** `cd emrreccord && python -m http.server 8765`, open `http://localhost:8765`.
  Firebase session persists across reloads. Sign in as `demodoc`/`1234`.
- **Testing via browser tools:** I drive the in-app Browser (`mcp__Claude_Browser__*`) with
  `javascript_tool` to fill/click/read state (fast). Fill BOTH username+pin fields; use
  `auth-submit.click()`.
- **Deploy:** commit + push to `main` → Render auto-deploys (~20–60s). Verify with
  `curl -s https://emrreccord.onrender.com/app.js | grep -c <marker>`.
- **CACHE GOTCHA:** Render/browser cache aggressively. After deploy, **hard-refresh**
  (`Ctrl+Shift+R`) or append `?v=x` to the URL, or your live check will see the OLD build.
- **Commits** end with the Claude co-author trailer.

## Open items / offered-but-not-built
- Add **cache-control headers** to `render.yaml` to kill the stale-cache-after-deploy problem (user
  keeps needing hard-refresh). Small, safe — offered, awaiting yes.
- Migrate the **built-in condition templates** (Sepsis/Stroke/etc.) into editable dept templates so
  their wording is user-editable too (currently they're code in `CONDITION_TEMPLATES`).
- **Thai word-spacing button**: voice-to-text produces Thai with no spaces (grammatically fine but
  dense). Proposed a lightweight button using native `Intl.Segmenter('th',{granularity:'word'})` to
  insert spaces at word boundaries. Offered, awaiting yes.

## Honest constraints
Prototype — **NOT** a certified/HIPAA/PDPA-compliant EMR. `/encounters` is a shared board readable/
writable by any authenticated user. PIN is convenience-grade. Real clinical use needs proper auth,
per-department scoping, audit logging, encryption, and institutional/legal sign-off.
