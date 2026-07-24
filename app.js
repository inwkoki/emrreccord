// ED QuickCapture — Firebase Realtime Database + Anonymous Auth
// Bedside phone entry syncs live to the station computer for EMR recording.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  push,
  update,
  query,
  limitToLast,
  orderByChild,
  onValue,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

// Turn a username into a synthetic email + turn a PIN into a valid password.
// (Firebase requires a password >= 6 chars, so the PIN is peppered.)
const EMAIL_DOMAIN = "edqc.app";
const PIN_PEPPER = "#EDqc";
const emailFor = (username) => username.toLowerCase() + "@" + EMAIL_DOMAIN;
const passwordFor = (pin) => pin + PIN_PEPPER;

const authScreen = $("auth-screen");
const roleScreen = $("role-screen");
const bedsideScreen = $("bedside-screen");
const stationScreen = $("station-screen");

// Auth screen
const authForm = $("auth-form");
const authUser = $("auth-user");
const authName = $("auth-name");
const authPin = $("auth-pin");
const authPin2 = $("auth-pin2");
const authSubmit = $("auth-submit");
const authStatus = $("auth-status");
const fullnameWrap = $("fullname-wrap");
const confirmWrap = $("confirm-wrap");
const roleHello = $("role-hello");

// Bedside
const patientTabs = $("patient-tabs");
const fBed = $("f-bed");
const fComplaint = $("f-complaint");
const fHistory = $("f-history");
const fExam = $("f-exam");
const fBedside = $("f-bedside");
const vBp = $("v-bp");
const vHr = $("v-hr");
const vRr = $("v-rr");
const vSpo2 = $("v-spo2");
const vTemp = $("v-temp");
const vGcs = $("v-gcs");
const fOxygen = $("f-oxygen");
const fManagement = $("f-management");
const fAntibiotic = $("f-antibiotic");
const fFluid = $("f-fluid");
const fConsult = $("f-consult");
const fDisposition = $("f-disposition");
const sendBtn = $("send-btn");
const newBtn = $("new-btn");
const bedsideStatus = $("bedside-status");
const sentNote = $("sent-note");
const meBedside = $("me-bedside");
const dotBedside = $("dot-bedside");

// Station
const patientList = $("patient-list");
const listEmpty = $("list-empty");
const activeCount = $("active-count");
const detailEmpty = $("detail-empty");
const detailContent = $("detail-content");
const dBed = $("d-bed");
const dBy = $("d-by");
const dUpdated = $("d-updated");
const dNote = $("d-note");
const copyBtn = $("copy-btn");
const recordBtn = $("record-btn");
const detailStatus = $("detail-status");
const meStation = $("me-station");
const dotStation = $("dot-station");
const meStationEl = $("me-station");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let clinician = "";
let role = localStorage.getItem("edqc_role") || "";
let authMode = "signin"; // or "signup"
let uid = null;
let currentEncounterId = null; // bedside: which patient is being edited
let selectedId = null; // station: which patient is shown
let encounters = {}; // id -> data
const seenUpdatedAt = {}; // id -> last updatedAt (for flash detection)

// ---------------------------------------------------------------------------
// Firebase init + config guard
// ---------------------------------------------------------------------------
let app, auth, db, configured = true;
if (
  firebaseConfig.apiKey.startsWith("REPLACE_ME") ||
  firebaseConfig.databaseURL.startsWith("REPLACE_ME")
) {
  configured = false;
  setStatus(authStatus, "⚠️ Firebase not configured — fill in firebase-config.js.", "error");
}

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
} catch (err) {
  console.error(err);
  configured = false;
  setStatus(authStatus, "Failed to init Firebase: " + err.message, "error");
}

// ---------------------------------------------------------------------------
// Auth screen (username + PIN → Firebase Email/Password)
// ---------------------------------------------------------------------------

// Prefill last-used username for convenience.
authUser.value = localStorage.getItem("edqc_lastuser") || "";

// Default role suggestion by screen size (user can still choose either).
const suggestedRole = window.matchMedia("(max-width: 760px)").matches ? "bedside" : "station";

// Tab switching (Sign in / Sign up)
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    authMode = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t === tab)
    );
    const signup = authMode === "signup";
    fullnameWrap.classList.toggle("hidden", !signup);
    confirmWrap.classList.toggle("hidden", !signup);
    authSubmit.textContent = signup ? "Create account" : "Sign in";
    authPin.autocomplete = signup ? "new-password" : "current-password";
    setStatus(authStatus, "");
  });
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!configured) return;

  const username = authUser.value.trim();
  const pin = authPin.value.trim();

  if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) {
    return setStatus(authStatus, "Username: 3–20 letters, numbers, . _ - only.", "error");
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return setStatus(authStatus, "PIN must be 4–8 digits.", "error");
  }

  authSubmit.disabled = true;

  try {
    if (authMode === "signup") {
      if (pin !== authPin2.value.trim()) {
        throw { code: "custom/pin-mismatch" };
      }
      setStatus(authStatus, "Creating account…");
      const cred = await createUserWithEmailAndPassword(
        auth,
        emailFor(username),
        passwordFor(pin)
      );
      const displayName = authName.value.trim() || username;
      await updateProfile(cred.user, { displayName });
      // onAuthStateChanged may have already fired with a null displayName —
      // refresh the cached name and any visible labels.
      clinician = displayName;
      roleHello.textContent = clinician;
      meBedside.textContent = clinician;
      meStationEl.textContent = clinician;
      // Store a small profile record (best-effort).
      set(ref(db, "users/" + cred.user.uid), {
        username: username,
        displayName: displayName,
        createdAt: serverTimestamp(),
      }).catch(() => {});
    } else {
      setStatus(authStatus, "Signing in…");
      await signInWithEmailAndPassword(auth, emailFor(username), passwordFor(pin));
    }
    localStorage.setItem("edqc_lastuser", username);
    // onAuthStateChanged takes over from here.
  } catch (err) {
    console.error(err);
    setStatus(authStatus, authErrorMessage(err), "error");
    authSubmit.disabled = false;
  }
});

function authErrorMessage(err) {
  switch (err.code) {
    case "custom/pin-mismatch":
      return "PINs do not match.";
    case "auth/email-already-in-use":
      return "That username is already taken. Try signing in.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong username or PIN.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not enabled in Firebase.";
    case "auth/network-request-failed":
      return "Network error — check your connection.";
    default:
      return "Sign-in failed: " + (err.code || err.message || "unknown");
  }
}

// Role picker + device switch buttons
document.querySelectorAll(".role-btn").forEach((btn) => {
  if (btn.dataset.role === suggestedRole) btn.style.borderColor = "var(--primary)";
  btn.addEventListener("click", () => {
    role = btn.dataset.role;
    localStorage.setItem("edqc_role", role);
    showRole();
  });
});

document.querySelectorAll("[data-switch]").forEach((btn) => {
  btn.addEventListener("click", () => {
    role = btn.dataset.switch;
    localStorage.setItem("edqc_role", role);
    showRole();
  });
});

// Sign out
document.querySelectorAll("[data-signout]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    await signOut(auth);
    role = "";
    localStorage.removeItem("edqc_role");
  });
});

// ---------------------------------------------------------------------------
// Auth state → drive which screen shows
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  const online = !!user;
  dotBedside.classList.toggle("online", online);
  dotStation.classList.toggle("online", online);

  if (user) {
    uid = user.uid;
    clinician = user.displayName || (user.email || "").split("@")[0] || "Clinician";
    subscribe();
    if (role === "bedside" || role === "station") {
      showRole();
    } else {
      showRoleScreen();
    }
  } else {
    uid = null;
    clinician = "";
    authSubmit.disabled = false;
    authPin.value = "";
    if (authPin2) authPin2.value = "";
    hideAll();
    authScreen.classList.remove("hidden");
  }
});

function hideAll() {
  authScreen.classList.add("hidden");
  roleScreen.classList.add("hidden");
  bedsideScreen.classList.add("hidden");
  stationScreen.classList.add("hidden");
}

function showRoleScreen() {
  hideAll();
  roleHello.textContent = clinician;
  roleScreen.classList.remove("hidden");
}

function showRole() {
  meBedside.textContent = clinician;
  meStationEl.textContent = clinician;
  hideAll();
  if (role === "bedside") {
    bedsideScreen.classList.remove("hidden");
    renderPatientOptions();
    fBed.focus();
  } else {
    stationScreen.classList.remove("hidden");
    renderStation();
  }
}

// ---------------------------------------------------------------------------
// Realtime subscription (shared by both roles)
// ---------------------------------------------------------------------------
let subscribed = false;
function subscribe() {
  if (subscribed || !db) return;
  subscribed = true;
  const q = query(ref(db, "encounters"), orderByChild("updatedAt"), limitToLast(100));
  onValue(q, (snap) => {
    encounters = snap.val() || {};
    if (role === "station") renderStation();
    if (role === "bedside") renderPatientOptions();
  });
}

// ---------------------------------------------------------------------------
// BEDSIDE
// ---------------------------------------------------------------------------
function renderPatientOptions() {
  const active = activeSorted(); // already sorted by updatedAt, newest first
  patientTabs.innerHTML = "";

  // "New patient" tab first.
  const nw = document.createElement("button");
  nw.type = "button";
  nw.className = "ptab new" + (currentEncounterId ? "" : " active");
  nw.dataset.new = "1";
  nw.textContent = "➕ New";
  patientTabs.appendChild(nw);

  // One tab per active patient.
  active.forEach(([id, e]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ptab" + (id === currentEncounterId ? " active" : "");
    b.dataset.id = id;
    const bed = document.createElement("span");
    bed.textContent = e.bed || "(no bed)";
    b.appendChild(bed);
    if (e.complaint) {
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = truncate(e.complaint, 18);
      b.appendChild(sub);
    }
    patientTabs.appendChild(b);
  });
}

// Tap a tab to load that patient, or "New" to start a fresh entry.
patientTabs.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".ptab");
  if (!btn) return;
  if (btn.dataset.new) {
    clearForm();
  } else {
    loadIntoForm(btn.dataset.id);
  }
});

// All bedside text fields mapped to their encounter keys, so load/clear/send
// can iterate instead of repeating every field.
const FIELD_MAP = {
  bed: fBed,
  complaint: fComplaint,
  history: fHistory,
  vBp: vBp,
  vHr: vHr,
  vRr: vRr,
  vSpo2: vSpo2,
  vTemp: vTemp,
  vGcs: vGcs,
  oxygen: fOxygen,
  exam: fExam,
  bedside: fBedside,
  management: fManagement,
  antibiotic: fAntibiotic,
  fluid: fFluid,
  consult: fConsult,
  disposition: fDisposition,
};

function loadIntoForm(id) {
  const e = encounters[id];
  if (!e) return;
  currentEncounterId = id;
  for (const [key, el] of Object.entries(FIELD_MAP)) el.value = e[key] || "";
  sentNote.textContent = "loaded";
  renderPatientOptions(); // refresh active-tab highlight
}

function clearForm() {
  currentEncounterId = null;
  for (const el of Object.values(FIELD_MAP)) el.value = "";
  sentNote.textContent = "";
  renderPatientOptions(); // highlight the "New" tab
  fBed.focus();
}

newBtn.addEventListener("click", clearForm);

// --- Field template helpers ---------------------------------------------
// Append a block to a textarea (blank line between existing + new).
function appendText(el, text) {
  const cur = el.value.trim();
  el.value = cur ? cur + "\n" + text : text;
}
// Append a single "- item" line only if it is not already present.
function addMgmtLine(item) {
  const line = "- " + item;
  if (fManagement.value.includes(line)) return;
  appendText(fManagement, line);
}

// Normal physical-exam template.
const NORMAL_PE = [
  "HEENT: no pale conjunctiva, anicteric sclera",
  "Lung: clear and equal breath sounds both lungs",
  "Abd: soft, not tender, no guarding",
  "Neuro: E4V5M6, pupil 3 mm RTLBE",
  "Ext: no rash, no edema",
].join("\n");

document.getElementById("tpl-exam").addEventListener("click", () => {
  appendText(fExam, NORMAL_PE);
  fExam.focus();
});

// Management quick-pick chips.
document.querySelectorAll("[data-mgmt]").forEach((btn) => {
  btn.addEventListener("click", () => addMgmtLine(btn.dataset.mgmt));
});

// Septic work-up bundle (a set of management lines).
const SEPTIC_WORKUP = [
  "IV access x2; O2 to keep SpO2 >= 94%",
  "Hemoculture x2 (before antibiotics)",
  "CBC, BUN/Cr, electrolytes, LFT, coagulogram",
  "Lactate (repeat if >= 2)",
  "Urinalysis + urine culture; consider CXR",
  "IV fluid resuscitation (see fluid)",
  "Antibiotics within 1 hr (see antibiotic)",
  "Identify & control source: ___",
];
document.querySelectorAll("[data-mgmt-set='septic']").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!fManagement.value.includes("[Septic work-up]")) {
      appendText(fManagement, "[Septic work-up]");
    }
    SEPTIC_WORKUP.forEach(addMgmtLine);
  });
});

// IV-fluid quick chips.
document.querySelectorAll("[data-fluid]").forEach((btn) => {
  btn.addEventListener("click", () => {
    fFluid.value = btn.dataset.fluid;
  });
});

// --- Condition templates (sepsis / stroke / trauma) ---------------------
const CONDITION_TEMPLATES = {
  sepsis: () => {
    document.querySelector("[data-mgmt-set='septic']").click();
    if (!fFluid.value.trim()) fFluid.value = "NSS/RLS 30 ml/kg IV bolus, reassess";
    if (!fOxygen.value) fOxygen.value = "Nasal cannula";
    fAntibiotic.focus(); // prompt clinician to record the antibiotic given
  },
  chestpain: () => {
    const t = nowTime();
    appendText(
      fBedside,
      [
        "[Serial ECG]",
        "ECG #1 (" + t + "): rate/rhythm ___ , axis ___ , ST-segment ___ , T-wave ___",
        "ECG #2 (____): rate/rhythm ___ , ST-segment ___ (compare to #1)",
        "ECG #3 (____): ___",
      ].join("\n")
    );
    appendText(
      fManagement,
      [
        "[Chest pain / ACS work-up]",
        "- 12-lead ECG within 10 min of arrival; serial ECG (see bedside test)",
        "- Cardiac troponin (serial) + CBC, BUN/Cr, electrolytes, coagulogram",
        "- Continuous cardiac monitor + SpO2; IV access",
        "- ASA (if not contraindicated); analgesia; consider GTN",
        "- CXR; risk-stratify (e.g. HEART score)",
      ].join("\n")
    );
  },
  anaphylaxis: () => {
    const t = nowTime();
    const until = timePlusHours(2);
    appendText(
      fManagement,
      [
        "[Anaphylaxis]",
        "- Epinephrine 1:1000 0.5 ml IM anterolateral thigh (given " + t + ")",
        "- Remove trigger; high-flow O2; lay supine with legs raised",
        "- IV access; IV fluid bolus",
        "- CPM 10 mg IV stat",
        "- Dexamethasone 8 mg IV stat",
        "- Observe for at least 2 hours (until " + until + ")",
        "- Repeat epinephrine every 5-15 min if no improvement",
      ].join("\n")
    );
    if (!fFluid.value.trim()) fFluid.value = "NSS IV bolus";
    if (!fOxygen.value) fOxygen.value = "Non-rebreather mask";
  },
  stroke: () => {
    appendText(
      fExam,
      [
        "[Stroke / neuro assessment]",
        "Last known well: ___    Onset: ___",
        "GCS: E_V_M_    Pupils: R__ L__",
        "NIHSS total: ___",
        "- LOC / orientation / commands: ___",
        "- Best gaze / visual fields: ___",
        "- Facial palsy: ___",
        "- Motor arm   R: ___   L: ___",
        "- Motor leg   R: ___   L: ___",
        "- Limb ataxia: ___",
        "- Sensory: ___",
        "- Language / dysarthria: ___",
        "- Extinction / neglect: ___",
        "Capillary blood glucose: ___",
      ].join("\n")
    );
    appendText(
      fManagement,
      [
        "[Stroke fast-track]",
        "- NPO; head of bed 30°",
        "- CT brain non-contrast STAT (± CTA)",
        "- Capillary glucose; correct if abnormal",
        "- BP monitoring (avoid over-correction)",
        "- Screen thrombolysis / thrombectomy eligibility",
        "- Notify stroke team; document onset/LKW time",
      ].join("\n")
    );
  },
  trauma: () => {
    const t = nowTime();
    appendText(
      fExam,
      [
        "[Primary survey — ABCDE]",
        "A (airway + C-spine control): ___",
        "B (breathing, RR, chest, SpO2): ___",
        "C (circulation, pulses, external bleeding): ___",
        "D (disability, GCS __, pupils R__ L__): ___",
        "E (exposure, temp, log-roll / back): ___",
        "",
        "[EFAST]",
        "- Pericardial: ___",
        "- RUQ (Morison's pouch): ___",
        "- LUQ (splenorenal): ___",
        "- Pelvis / pouch of Douglas: ___",
        "- Lung sliding   R: ___   L: ___",
        "",
        "[Secondary survey / AMPLE Hx]: ___",
      ].join("\n")
    );
    appendText(
      fManagement,
      [
        "[Trauma resuscitation]",
        "- Time of arrival: " + t + "   Primary survey: " + t,
        "- 2 large-bore IV; trauma labs + group & cross-match",
        "- Control external hemorrhage; C-collar / immobilization",
        "- Analgesia; tetanus prophylaxis as indicated",
        "- Imaging: trauma series / CT as indicated",
        "- Activate massive transfusion protocol if needed",
      ].join("\n")
    );
  },
};

document.querySelectorAll("[data-cond]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const fn = CONDITION_TEMPLATES[btn.dataset.cond];
    if (fn) {
      fn();
      setStatus(bedsideStatus, "Inserted " + btn.dataset.cond + " template.", "ok");
    }
  });
});

sendBtn.addEventListener("click", async () => {
  const bed = fBed.value.trim();
  if (!bed) {
    setStatus(bedsideStatus, "Bed / identifier is required.", "error");
    fBed.focus();
    return;
  }
  if (!uid) return;

  const payload = { by: clinician, status: "active", updatedAt: serverTimestamp() };
  for (const [key, el] of Object.entries(FIELD_MAP)) {
    payload[key] = el.value.trim();
  }

  sendBtn.disabled = true;
  setStatus(bedsideStatus, "Sending…");
  try {
    if (currentEncounterId && encounters[currentEncounterId]) {
      await update(ref(db, "encounters/" + currentEncounterId), payload);
    } else {
      payload.createdAt = serverTimestamp();
      const newRef = await push(ref(db, "encounters"), payload);
      currentEncounterId = newRef.key;
    }
    setStatus(bedsideStatus, "✓ Sent to station", "ok");
    sentNote.textContent = "sent " + nowTime();
  } catch (err) {
    console.error(err);
    setStatus(bedsideStatus, "Failed: " + (err.code || err.message), "error");
  } finally {
    sendBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// STATION
// ---------------------------------------------------------------------------
function renderStation() {
  const active = activeSorted();
  activeCount.textContent = active.length;
  listEmpty.classList.toggle("hidden", active.length > 0);

  // Remove old cards (keep the empty message node)
  [...patientList.querySelectorAll(".p-card")].forEach((n) => n.remove());

  active.forEach(([id, e]) => {
    const card = document.createElement("div");
    card.className = "p-card" + (id === selectedId ? " active" : "");
    card.dataset.id = id;

    // Flash if this record changed since we last saw it.
    if (seenUpdatedAt[id] !== undefined && e.updatedAt !== seenUpdatedAt[id]) {
      card.classList.add("flash");
      setTimeout(() => card.classList.remove("flash"), 1500);
    }
    seenUpdatedAt[id] = e.updatedAt;

    card.innerHTML = `
      <div class="bed"></div>
      <div class="cc"></div>
      <div class="foot"><span class="by"></span><span class="t"></span></div>`;
    card.querySelector(".bed").textContent = e.bed || "(no bed)";
    card.querySelector(".cc").textContent = e.complaint || "—";
    card.querySelector(".by").textContent = e.by || "";
    card.querySelector(".t").textContent = relTime(e.updatedAt);
    card.addEventListener("click", () => selectPatient(id));
    patientList.appendChild(card);
  });

  // Refresh open detail if it changed
  if (selectedId && encounters[selectedId] && encounters[selectedId].status === "active") {
    renderDetail(selectedId);
  } else if (selectedId && (!encounters[selectedId] || encounters[selectedId].status !== "active")) {
    selectedId = null;
    detailContent.classList.add("hidden");
    detailEmpty.classList.remove("hidden");
  }
}

function selectPatient(id) {
  selectedId = id;
  document.querySelectorAll(".p-card").forEach((c) =>
    c.classList.toggle("active", c.dataset.id === id)
  );
  renderDetail(id);
}

function renderDetail(id) {
  const e = encounters[id];
  if (!e) return;
  detailEmpty.classList.add("hidden");
  detailContent.classList.remove("hidden");
  dBed.textContent = e.bed || "(no bed)";
  dBy.textContent = "by " + (e.by || "unknown");
  dUpdated.textContent = relTime(e.updatedAt);
  dNote.textContent = formatNote(e);
  setStatus(detailStatus, "");
}

copyBtn.addEventListener("click", async () => {
  if (!selectedId) return;
  const text = formatNote(encounters[selectedId]);
  try {
    await navigator.clipboard.writeText(text);
    setStatus(detailStatus, "✓ Copied — paste into the EMR.", "ok");
  } catch {
    // Fallback for older browsers / insecure context
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    setStatus(detailStatus, "✓ Copied — paste into the EMR.", "ok");
  }
});

recordBtn.addEventListener("click", async () => {
  if (!selectedId) return;
  try {
    await update(ref(db, "encounters/" + selectedId), {
      status: "recorded",
      updatedAt: serverTimestamp(),
    });
    setStatus(detailStatus, "Marked as recorded — removed from active list.", "ok");
  } catch (err) {
    setStatus(detailStatus, "Failed: " + (err.code || err.message), "error");
  }
});

// ---------------------------------------------------------------------------
// Note formatting for EMR paste
// ---------------------------------------------------------------------------
function formatNote(e) {
  const parts = [];
  parts.push("PATIENT: " + (e.bed || "(no bed)"));
  if (e.complaint) parts.push("\nCHIEF COMPLAINT:\n" + e.complaint);
  if (e.history) parts.push("\nHISTORY:\n" + e.history);

  const vit = vitalsLine(e);
  if (vit) parts.push("\nVITALS:\n" + vit);

  if (e.exam) parts.push("\nPHYSICAL EXAM:\n" + e.exam);
  if (e.bedside) parts.push("\nBEDSIDE TESTS:\n" + e.bedside);
  if (e.management) parts.push("\nINITIAL MANAGEMENT:\n" + e.management);
  if (e.fluid) parts.push("\nIV FLUID:\n" + e.fluid);
  if (e.antibiotic) parts.push("\nANTIBIOTIC:\n" + e.antibiotic);
  if (e.consult) parts.push("\nCONSULTATION: " + e.consult);
  if (e.disposition) parts.push("\nDISPOSITION: " + e.disposition);

  parts.push("\n— Entered by " + (e.by || "unknown") + " · " + fullTime(e.updatedAt));
  return parts.join("\n");
}

// Build a single vitals line from whichever vitals were entered.
function vitalsLine(e) {
  const bits = [];
  if (e.vBp) bits.push("BP " + e.vBp);
  if (e.vHr) bits.push("HR " + e.vHr);
  if (e.vRr) bits.push("RR " + e.vRr);
  if (e.vSpo2) bits.push("SpO2 " + e.vSpo2);
  if (e.vTemp) bits.push("T " + e.vTemp);
  if (e.vGcs) bits.push("GCS " + e.vGcs);
  let line = bits.join(", ");
  if (e.oxygen) line += (line ? "  |  " : "") + "O2: " + e.oxygen;
  return line;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function activeSorted() {
  return Object.entries(encounters)
    .filter(([, e]) => e && e.status === "active")
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Clock time `h` hours from now (e.g. anaphylaxis observation window).
function timePlusHours(h) {
  const d = new Date(Date.now() + h * 3600 * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fullTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString();
}

function relTime(ts) {
  if (!ts) return "just now";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return new Date(ts).toLocaleDateString();
}

function setStatus(el, text, kind) {
  el.textContent = text;
  el.classList.remove("error", "ok");
  if (kind) el.classList.add(kind);
}

// Keep relative timestamps fresh
setInterval(() => {
  if (role === "station") {
    document.querySelectorAll(".p-card").forEach((c) => {
      const e = encounters[c.dataset.id];
      if (e) c.querySelector(".t").textContent = relTime(e.updatedAt);
    });
    if (selectedId && encounters[selectedId]) dUpdated.textContent = relTime(encounters[selectedId].updatedAt);
  }
}, 15000);
