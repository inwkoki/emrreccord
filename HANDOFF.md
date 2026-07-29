# 🫀 ED QuickCapture — Session Handoff

Continuity note for resuming work in a fresh chat. Read this + the code to get up to speed.

## What this is
A real-time **Emergency Department documentation web app**: staff type at the **bedside (phone)**,
it appears live at the **station (computer)**, formatted for one-click copy into the hospital EMR —
no retyping. Plus a **CPR/resuscitation record** and a large offline **clinical reference & tools**
library (drug calculators, ACLS/PALS, peds, etc.).

- **Repo:** https://github.com/inwkoki/emrreccord (branch `main`)
- **Live:** https://emrreccord.onrender.com/  (Render **static site**, auto-deploys on push to `main`)
- **Owner GitHub:** `inwkoki` (gh CLI is authenticated as this)

## Stack / architecture
- **Vanilla HTML/CSS/JS** (ES modules), **no build step**.
- Files: `index.html`, `styles.css`, `app.js` (~2600 lines: logic + UI),
  **`reference-data.js`** (pure clinical reference DATA, ES module imported by app.js),
  `firebase-config.js`, `database.rules.json`, `firebase.json`, `render.yaml`,
  **`sw.js`** (service worker / offline), **`manifest.json`** + **`icon.svg`** (installable PWA).
- **Firebase Realtime Database** + **Email/Password Auth**. Project **`emrtemplate`** (RTDB
  **asia-southeast1**). Web config in `firebase-config.js` (public keys — fine to commit).
- Firebase SDK loaded from gstatic CDN inside `app.js`.

## Auth model (important)
- Login is **username + PIN**. Internally email = `username@edqc.app` (lowercased),
  password = `PIN + "#EDqc"`. See `emailFor`/`passwordFor`.
- **Accounts:**
  - `ponkrit` / PIN `2486` — the real user / **ADMIN** (display "Koki").
    **uid `JwsZ2plG71R5zEdRv86T5FCuXFl2`** — hardcoded as `ADMIN_UID` in app.js and in the
    `sharedCondOverrides` rule.
  - `demodoc` / PIN `1234` — test account (display "Dr. Demo"), uid `53UzKvZmAQeocwC2hgxxpFucA5Z2`.
- No real emails → no self-service reset when fully locked out; owner resets in the Firebase console
  (Authentication → user → Reset password). Signed-in users can change PIN in ⚙️ Account.
- **I never enter the PIN to log into the live app** (credential policy). Live auth'd tests are the
  user's to run; I verify logic locally + confirm rules/deploys.

## Data model (RTDB)
- `/encounters/{id}` (shared dept board): `bed, complaint, history, homemed, immun,
  vBp,vHr,vRr,vSpo2,vTemp,vGcs, oxygen, exam, bedside, management, consult, disposition,
  by, byUid, status('active'|'recorded'), createdAt, updatedAt, cpr(text), cprState(JSON)`.
  - **`management` is now the single "Initial management" box** — orders **plus antibiotics plus
    IV fluids** all live here (collapsed). The old separate `antibiotic`/`fluid` fields are
    **legacy**: not written by new records, but old records may still have them and `formatNote`
    still renders them if present.
- `/users/{uid}`: `username, displayName, createdAt, normalPe`, `condOverrides/{key}:{fields{}}`
  (personal quick-template edits), `chips/{group}` (arrays; groups: `ud, mgmt, abx, vaso,
  fluidtypes, neb, commonmed`, `ex0..ex6` exam-builder options, `hiddenQt`),
  `templates/{tid}:{name,fields{},order}`.
- `/sharedTemplates/{tid}`: `{name,fields{},by,byUid}` — dept templates, creator-only write/delete.
- `/sharedCondOverrides/{key}`: `{fields{},by,byUid}` — **dept-wide (global) overrides of the
  built-in quick templates. Read by all; write ADMIN-ONLY (owner uid).**
- Rule limits (`database.rules.json`): chips item ≤200; template/shared/cond fields ≤8000; name ≤40;
  normalPe ≤4000; encounter cpr/cprState ≤20000; encounter $other string ≤8000.

## Security rules — model + HOW TO DEPLOY (gotcha!)
Model: `users/$uid` read+write owner-only. `encounters` shared board (any signed-in read/create/
update) but `.write` lives on `$id` with `newData.exists()` so **deletes are denied** (clear via
status `recorded`); `byUid` must `=== auth.uid`. `sharedTemplates` creator-only. `sharedCondOverrides`
read-all, **write only `auth.uid === 'JwsZ2plG71R5zEdRv86T5FCuXFl2'`**.

`database.rules.json` is the **source of truth** but is **NOT auto-deployed** (no Firebase CLI here).
**Publish manually in the Firebase console via Claude-in-Chrome:**
1. Open `https://console.firebase.google.com/project/emrtemplate/database/emrtemplate-default-rtdb/rules`
2. Set the editor value (rules file has `//` comments, so **base64-inject** to avoid escaping):
   `base64 -w0 database.rules.json` → in page:
   `const bytes=Uint8Array.from(atob(B64),c=>c.charCodeAt(0)); document.querySelector('.CodeMirror').CodeMirror.setValue(new TextDecoder().decode(bytes))`
3. Click **Publish** (~coord `[611,133]`); confirm the "unpublished changes" banner disappears.

**Any rules change MUST be republished this way or writes get PERMISSION_DENIED.**

## Deploy + cache
- Push to `main` → Render auto-deploys (~30–90 s; occasionally the CDN lags a minute). Verify with
  a wait loop: `until curl -s ".../app.js?cb=$(date +%s%N)" | grep -q MARKER; do sleep 5; done`.
- **Service worker cache:** on ANY shell change (html/css/app.js/reference-data.js/manifest/icon),
  **bump `const CACHE = "edqc-vN"` in `sw.js`** so users' caches refresh cleanly. Currently `edqc-v13`.
- `render.yaml` sets `Cache-Control: no-cache`, but Render still serves `max-age=0, s-maxage=300`
  (CDN 5-min) — the header change needs a **Blueprint re-sync in the Render dashboard** to fully
  apply. Meanwhile hard-refresh / `?cb=` for live checks.

## Features (all live + verified)
**Bedside:** patient tabs (own-first); structured vitals + O₂; U/D chips; **Home medication** field;
**Immunization / vaccine** chips (Tetanus Td/Tdap/TIG, Rabies **Speeda** D0/D3/D7/D14/D28/booster/RIG);
Physical-exam builder (per-system type-or-pick + editable option lists `ex0..ex6`); **＋ Normal** exam;
bedside test; **single Initial management box** (collapsed — orders + antibiotics + IV fluids) fed by:
management chips + septic bundle, IV-fluid chips + specific-fluid `<select>`, and the **💊 Meds
builder** (Common medication, Antibiotic, Vasopressor **with concentration**, IV-fluid loading,
Nebulization). All builder pickers are native **`<select>`** (datalists misbehave on Samsung), all
append into the management box, and every editable list supports **add / remove / reorder / rename (✎)**.
Consult + disposition; send.

**Templates** (one ⚡ Templates panel: Quick + Mine + Dept):
- **Quick** = data (`CONDITION_DEFAULTS`, macro field-fills). Editable per-user (`condOverrides`);
  **admin sees "Apply to everyone (dept)"** → writes `/sharedCondOverrides` (global). Wording
  resolves **personal → dept(global) → built-in default** (`getCond`). ✎ marks any override.
- **Mine / Dept:** save / apply / edit / reorder / delete; Dept share creator-only; emoji picker.
- **Macros** `{{now}},{{now+2h}},{{now+30m}},{{now-1h}},{{date}},{{datetime}}` (`expandMacros`).

**Station:** live board (own-first + flash); `formatNote` composes the EMR note; 📋 Copy; ✓ Mark recorded.
**CPR screen** (🫀): detailed resus record; saves `cpr` (text) + `cprState` (JSON round-trip).
**⚙️ Account:** change name / PIN / Normal-PE.

**📚 Reference & tools hub** (📚 Ref button, both roles) — `#calc-screen`: a **grouped menu**
(`SECTION_GROUPS` = Adult · Paediatric · General & drugs) + a **search box** (`buildSearchIndex`
indexes every dataset). Each section has an editable **review-status badge** (⚠ Needs review → ✓
Reviewed → ✔ Validated, saved per-device in `localStorage.edqc_refreview`) and a **"My notes &
images"** area — add/edit/delete note cards + attach JPG/PNG (auto-downscaled), saved per-device in
`localStorage.edqc_refcustom`. Sections:
- **Adult codes (ACLS)** + **Peds codes (PALS)** — cardiac-arrest **flowchart** (`buildFlow`) +
  brady/tachy/cardioversion detail cards (AHA/AAP 2025 facts).
- **Peds by weight** — enter weight → resus doses + fluids + 4-2-1 maintenance (calc).
- **Ped head trauma** — PECARN CT rule, ≥2 yr and <2 yr (CA-ACEP / Choosing Wisely).
- **Peds drug doses** — ~50 common drugs, category filter (KKU/Srinagarind peds handbook).
- **Peds vital signs** — HR/RR/hypotension-SBP/ETT tables (Pediatric Survival Guide).
- **Peds by age** — IBW/height/ETT (cuffed+uncuffed)+depth computed by age.
- **Adult mild TBI** — Thai CPG risk groups.
- **Drip calculator** — KKU-aligned inotrope/vasopressor rate⇄dose, "⬇ To management".
- **High-alert drugs** — KKU injectable guideline cards (link to source PDFs).
- **RSI drugs** · **Electrolyte correction** (K/Ca/Mg/Na/glucose + hyperK).
Data all in `reference-data.js`. Renderers: `renderCard` (card sections), `buildRefTable` (tables),
`buildFlow` (flowcharts). **Add a section = data in reference-data.js + a `SECTIONS` entry (with
`group`) + a pane in index.html; card sections reuse `renderCard`; add to `buildSearchIndex`.**

## Dev workflow
- **Local test:** `python -m http.server 8765` in the repo; open `http://localhost:8765`. To test
  UI without login, reveal a screen via JS (`document.getElementById('bedside-screen').classList
  .remove('hidden')`) — most bedside/reference logic doesn't need auth.
- **Browser tools:** drive the in-app Browser (`mcp__Claude_Browser__*`) with `javascript_tool` to
  fill/click/read; `read_console_messages{onlyErrors:true}` to check for errors.
- `node --check` a copy (`cp app.js x.mjs`) before committing; validate rules JSON after stripping
  `//` comments.
- **Commits** end with the Claude co-author trailer.

## Open items / offered-but-not-built
- **render.yaml Cache-Control** committed as `no-cache` but needs a Render **Blueprint re-sync** to
  override the CDN `s-maxage=300`. (Live checks still need `?cb=`.)
- **Per-device state → Firebase sync:** review badges + custom notes/images are `localStorage`
  (per-device). Could move to `/users/{uid}/…` for cross-device (needs a rules addition + republish).
- **Multiple admins:** `sharedCondOverrides` write is a single hardcoded uid; switch to an allowlist
  or a `users/{uid}/admin` flag if more editors are needed.
- **Thai word-spacing** button (voice-to-text produces spaceless Thai) via `Intl.Segmenter('th')` —
  offered, not built.
- **Clinical data still to verify** (transcribed from user-supplied PDFs/images): the **Peds drug
  doses**, **Peds-by-weight/electrolyte** values, and the **<2 yr PECARN** arm most of all.

## Honest constraints
Prototype — **NOT** a certified/HIPAA/PDPA-compliant EMR. `/encounters` is a shared board readable/
writable by any authenticated user. PIN is convenience-grade. Reference doses are decision aids to be
verified against local protocol. Real clinical use needs proper auth, per-department scoping, audit
logging, encryption, and institutional/legal sign-off.
