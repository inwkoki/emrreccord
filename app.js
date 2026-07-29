// ED QuickCapture — Firebase Realtime Database + Email/Password Auth
// (username + PIN mapped to a synthetic email; see emailFor/passwordFor below).
// Bedside phone entry syncs live to the station computer for EMR recording.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
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
import {
  HA_P307, HA_P306, PRESSORS, HIGH_ALERT, CODES_ADULT, CODES_PEDS, RSI_DRUGS, TBI_GROUPS, PEDS_VITALS, PEDS_DRUGS, ELYTE_CORRECTION, PECARN,
  ARREST_ADULT_FLOW, ARREST_PEDS_FLOW,
} from "./reference-data.js";

// Register the service worker for offline support (best-effort).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {})
  );
}

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
const cprScreen = $("cpr-screen");

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
const fHomemed = $("f-homemed");
const fImmun = $("f-immun");
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
let customChips = {
  ud: [], mgmt: [], abx: [], vaso: [], fluidtypes: [], neb: [], commonmed: [],
  ex0: [], ex1: [], ex2: [], ex3: [], ex4: [], ex5: [], ex6: [], // exam-builder per-system options
  hiddenQt: [], // quick-templates the user has hidden
};
let chipsSubscribed = false;
let customNormalPe = ""; // per-user editable "Normal" physical-exam text
let condOverrides = {}; // per-user edited wording for quick (condition) templates

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

// --- Account settings: change display name / change PIN -----------------
const settingsModal = document.getElementById("settings-modal");
const settingsStatus = document.getElementById("settings-status");

document.querySelectorAll("[data-settings]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("set-name").value = clinician;
    document.getElementById("set-normal-pe").value = customNormalPe || NORMAL_PE;
    setStatus(settingsStatus, "");
    settingsModal.classList.remove("hidden");
  });
});

document.getElementById("set-normal-pe-save").addEventListener("click", async () => {
  const txt = document.getElementById("set-normal-pe").value.trim();
  try {
    await set(ref(db, "users/" + uid + "/normalPe"), txt);
    customNormalPe = txt;
    setStatus(settingsStatus, "✓ Normal exam saved", "ok");
  } catch (e) {
    setStatus(settingsStatus, "Failed: " + (e.code || e.message), "error");
  }
});
document.getElementById("settings-close").addEventListener("click", () => {
  settingsModal.classList.add("hidden");
});
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.classList.add("hidden");
});

document.getElementById("set-name-save").addEventListener("click", async () => {
  const name = document.getElementById("set-name").value.trim();
  if (!name) return setStatus(settingsStatus, "Enter a name.", "error");
  try {
    await updateProfile(auth.currentUser, { displayName: name });
    await set(ref(db, "users/" + uid + "/displayName"), name);
    clinician = name;
    roleHello.textContent = clinician;
    meBedside.textContent = clinician;
    meStationEl.textContent = clinician;
    setStatus(settingsStatus, "✓ Name updated (applies to new notes)", "ok");
  } catch (e) {
    setStatus(settingsStatus, "Failed: " + (e.code || e.message), "error");
  }
});

document.getElementById("set-pin-save").addEventListener("click", async () => {
  const cur = document.getElementById("set-pin-cur").value.trim();
  const nw = document.getElementById("set-pin-new").value.trim();
  const nw2 = document.getElementById("set-pin-new2").value.trim();
  if (!/^\d{4,8}$/.test(nw)) return setStatus(settingsStatus, "New PIN must be 4–8 digits.", "error");
  if (nw !== nw2) return setStatus(settingsStatus, "New PINs do not match.", "error");
  try {
    const user = auth.currentUser;
    const cred = EmailAuthProvider.credential(user.email, passwordFor(cur));
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, passwordFor(nw));
    ["set-pin-cur", "set-pin-new", "set-pin-new2"].forEach((id) => (document.getElementById(id).value = ""));
    setStatus(settingsStatus, "✓ PIN changed", "ok");
  } catch (e) {
    const bad = e.code === "auth/invalid-credential" || e.code === "auth/wrong-password";
    setStatus(settingsStatus, bad ? "Current PIN is incorrect." : "Failed: " + (e.code || e.message), "error");
  }
});

// Forgot-PIN explainer toggle
document.getElementById("forgot-pin").addEventListener("click", () => {
  document.getElementById("forgot-note").classList.toggle("hidden");
});

// --- CPR record ----------------------------------------------------------
const cprForm = document.getElementById("cpr-form");
const cprStatus = document.getElementById("cpr-status");

function gatherCprState() {
  const fd = new FormData(cprForm);
  const s = {};
  for (const [k, v] of fd.entries()) {
    if (v === "") continue;
    if (k in s) {
      if (!Array.isArray(s[k])) s[k] = [s[k]];
      s[k].push(v);
    } else s[k] = v;
  }
  return s;
}

function populateCpr(state) {
  cprForm.reset();
  if (!state) return;
  cprForm.querySelectorAll("input, textarea, select").forEach((el) => {
    const val = state[el.name];
    if (val === undefined) return;
    if (el.type === "radio" || el.type === "checkbox") {
      const arr = Array.isArray(val) ? val : [val];
      el.checked = arr.includes(el.value);
    } else {
      el.value = Array.isArray(val) ? val[0] : val;
    }
  });
}

function composeCprNote(s) {
  if (!s || !Object.keys(s).length) return "";
  const g = (k) => {
    const v = s[k];
    return Array.isArray(v) ? v.join(", ") : v || "";
  };
  const withNote = (main, note, sep) => (main ? main + (note ? (sep || " — ") + note : "") : note);
  const L = (label, val) => (val ? label + ": " + val + "\n" : "");
  const parts = [];
  parts.push("=== CPR / RESUSCITATION RECORD ===");
  let a = "";
  a += L("Arrival", withNote(g("arrival"), g("arrival_other")));
  a += L("Place of arrest", g("place"));
  a += L("Est. time of arrest", g("arrest_time"));
  a += L("Witnessed", g("witnessed"));
  a += L("Bystander CPR", g("bystander"));
  a += L("Initiated by", g("initiator"));
  a += L("AED used", g("aed"));
  if (a) parts.push(a.trim());
  if (g("prehosp")) parts.push("Pre-hospital: " + g("prehosp"));
  if (g("history")) parts.push("History:\n" + g("history"));
  if (g("ud") || g("ud_other")) parts.push("Underlying: " + withNote(g("ud"), g("ud_other"), ", "));

  let r = "";
  r += L("First rhythm", withNote(g("first_rhythm"), g("first_rhythm_note"), " "));
  r += L("Final EKG", withNote(g("final_ekg"), g("final_ekg_note"), " "));
  r += L("Etiology", withNote(g("etiology"), g("etiology_note")));
  if (r) parts.push(r.trim());

  const examLines = [];
  if (g("mortis")) examLines.push(g("mortis"));
  const sys = [
    ["HEENT", "heent_wnl", "heent_note"],
    ["Heart", "heart_wnl", "heart_note"],
    ["Lungs", "lungs_wnl", "lungs_note"],
    ["Abdomen", "abd_wnl", "abd_note"],
    ["Ext", "ext_wnl", "ext_note"],
    ["N/S", "ns_wnl", "ns_note"],
  ];
  sys.forEach(([label, wk, nk]) => {
    const val = withNote(g(wk), g(nk));
    if (val) examLines.push(label + ": " + val);
  });
  if (g("pupil")) examLines.push("Pupil: " + g("pupil"));
  if (examLines.length) parts.push("Physical exam:\n" + examLines.join("\n"));

  let t = "";
  t += L("CPR total", g("cpr_min") ? g("cpr_min") + " min" : "");
  t += L("Defibrillation", g("defib"));
  t += L("Airway", g("airway"));
  t += L("Ventilation", g("vent"));
  if (t) parts.push(t.trim());
  if (g("meds")) parts.push("Medications/procedures:\n- " + (Array.isArray(s.meds) ? s.meds.join("\n- ") : s.meds));
  if (g("med_detail")) parts.push("Drug doses / timeline:\n" + g("med_detail"));
  if (g("abg")) parts.push("ABG/VBG:\n" + g("abg"));
  if (g("investigation")) parts.push("Investigations:\n" + g("investigation"));
  if (g("post_rosc")) parts.push("Post-ROSC:\n" + g("post_rosc"));
  if (g("diagnosis")) parts.push("Final diagnosis: " + g("diagnosis"));
  if (g("impression")) parts.push("Impression: " + g("impression"));
  if (g("outcome") || g("outcome_note")) parts.push("Outcome: " + withNote(g("outcome"), g("outcome_note")));
  return parts.join("\n\n");
}

// Open the CPR screen for the current patient
document.getElementById("open-cpr").addEventListener("click", () => {
  const e = currentEncounterId ? encounters[currentEncounterId] : null;
  if (e && e.cprState) {
    try {
      populateCpr(JSON.parse(e.cprState));
    } catch {
      cprForm.reset();
    }
  } else {
    cprForm.reset();
  }
  // Prefill bed from the current bedside entry / patient.
  document.getElementById("cpr-bed").value = (e && e.bed) || fBed.value.trim() || "";
  document.getElementById("cpr-me").textContent = clinician;
  setStatus(cprStatus, "");
  hideAll();
  cprScreen.classList.remove("hidden");
});

document.getElementById("cpr-back").addEventListener("click", () => {
  role = "bedside";
  showRole();
});
document.getElementById("cpr-clear").addEventListener("click", () => {
  cprForm.reset();
  setStatus(cprStatus, "");
});

document.getElementById("cpr-save").addEventListener("click", async () => {
  const bed = document.getElementById("cpr-bed").value.trim();
  if (!bed) {
    setStatus(cprStatus, "Bed / identifier is required.", "error");
    return;
  }
  if (!uid) return;
  const state = gatherCprState();
  const payload = {
    cpr: composeCprNote(state),
    cprState: JSON.stringify(state),
    updatedAt: serverTimestamp(),
  };
  document.getElementById("cpr-save").disabled = true;
  setStatus(cprStatus, "Saving…");
  try {
    if (currentEncounterId && encounters[currentEncounterId]) {
      payload.bed = bed;
      await update(ref(db, "encounters/" + currentEncounterId), payload);
    } else {
      const p = {
        bed,
        by: clinician,
        byUid: uid,
        status: "active",
        complaint: "Cardiac arrest / CPR",
        createdAt: serverTimestamp(),
        ...payload,
      };
      const newRef = await push(ref(db, "encounters"), p);
      currentEncounterId = newRef.key;
    }
    setStatus(cprStatus, "✓ CPR record saved to station", "ok");
  } catch (err) {
    console.error(err);
    setStatus(cprStatus, "Failed: " + (err.code || err.message), "error");
  } finally {
    document.getElementById("cpr-save").disabled = false;
  }
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
    subscribeCustomChips();
    subscribeUserTemplates();
    subscribeDeptTemplates();
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
  cprScreen.classList.add("hidden");
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
    b.className =
      "ptab" + (id === currentEncounterId ? " active" : "") + (isOwn(e) ? " mine" : "");
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
  homemed: fHomemed,
  immun: fImmun,
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
  appendText(fExam, customNormalPe || NORMAL_PE);
  fExam.focus();
});

// --- Physical-exam builder: one dropdown per system, tap to pick a phrase ---
// First option of each system is the "normal" default. "(skip)" omits it.
const EXAM_SYSTEMS = [
  ["General", ["Alert, not in distress", "Ill-looking", "Drowsy", "In respiratory distress", "Dehydrated"]],
  ["HEENT", ["No pale conjunctiva, anicteric sclera", "Pale conjunctiva", "Icteric sclera", "Dry mucous membranes", "Injected pharynx"]],
  ["Heart", ["Normal S1S2, no murmur", "Tachycardia", "Irregularly irregular", "Murmur present", "Distant heart sounds"]],
  ["Lung", ["Clear and equal breath sounds both lungs", "Fine crepitations", "Coarse crepitations", "Expiratory wheezing", "Decreased breath sounds, right", "Decreased breath sounds, left"]],
  ["Abdomen", ["Soft, not tender, no guarding", "Tenderness", "Guarding / rigidity", "Distended", "Rebound tenderness"]],
  ["Neuro", ["E4V5M6, pupils 3 mm RTLBE", "Drowsy (GCS decreased)", "Focal weakness", "Pupils unequal", "Neck stiffness"]],
  ["Ext / Skin", ["No edema, no rash", "Pitting edema", "Rash", "Cold peripheries", "Cyanosis"]],
];

const examBuilder = document.getElementById("exam-builder");
const examBuilderRows = document.getElementById("exam-builder-rows");
const examPreview = document.getElementById("exam-preview");

// Build the rows once.
EXAM_SYSTEMS.forEach(([sys, opts], i) => {
  const row = document.createElement("div");
  row.className = "eb-row";
  const label = document.createElement("span");
  label.textContent = sys;
  // Combobox: pick a common phrase from the list OR type anything.
  const input = document.createElement("input");
  input.type = "text";
  input.dataset.sys = sys;
  input.setAttribute("list", "eb-dl-" + i);
  input.value = opts[0]; // default to the normal finding
  input.autocomplete = "off";
  input.placeholder = "type or pick…";
  const dl = document.createElement("datalist");
  dl.id = "eb-dl-" + i;
  input.addEventListener("input", updateExamPreview);
  const clr = document.createElement("button");
  clr.type = "button";
  clr.className = "eb-clear";
  clr.textContent = "✕";
  clr.title = "clear this field";
  clr.addEventListener("click", () => {
    input.value = "";
    updateExamPreview();
    input.focus();
  });
  row.append(label, input, dl, clr);
  examBuilderRows.appendChild(row);
  renderExamDatalist(i);
  const o = document.createElement("option"); // system in the edit-list selector
  o.value = i;
  o.textContent = sys;
  document.getElementById("exam-opt-sys").appendChild(o);
});

// Datalist options for a system = built-in defaults + the user's custom options.
function renderExamDatalist(i) {
  const dl = document.getElementById("eb-dl-" + i);
  if (!dl || !EXAM_SYSTEMS[i]) return;
  dl.innerHTML = "";
  EXAM_SYSTEMS[i][1].concat(customChips["ex" + i] || []).forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o;
    dl.appendChild(opt);
  });
}

// Removable chips for the currently-selected system's custom options.
function renderExamOptChips(idx) {
  const container = document.querySelector("#exam-opt-chips .custom-chips");
  if (!container) return;
  container.innerHTML = "";
  (customChips["ex" + idx] || []).forEach((item, j) => {
    const chip = document.createElement("span");
    chip.className = "chip mini custom";
    const t = document.createElement("span");
    t.className = "lbl-txt";
    t.textContent = item;
    t.style.cursor = "default";
    const ren = document.createElement("button");
    ren.type = "button";
    ren.className = "mv";
    ren.textContent = "✎";
    ren.title = "rename";
    ren.style.display = "inline";
    ren.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "chip-rename";
      input.value = customChips["ex" + idx][j];
      let done = false;
      const commit = () => {
        if (done) return;
        done = true;
        const val = input.value.trim();
        if (val && val !== customChips["ex" + idx][j]) {
          customChips["ex" + idx][j] = val;
          saveCustomChips("ex" + idx);
          renderExamDatalist(idx);
        }
        renderExamOptChips(idx);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { done = true; renderExamOptChips(idx); }
      });
      input.addEventListener("blur", commit);
      t.replaceWith(input);
      input.focus();
      input.select();
    });
    const x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.textContent = "✕";
    x.style.display = "inline";
    x.addEventListener("click", () => {
      customChips["ex" + idx].splice(j, 1);
      saveCustomChips("ex" + idx);
      renderExamOptChips(idx);
      renderExamDatalist(idx);
    });
    chip.append(t, ren, x);
    container.appendChild(chip);
  });
}

function composeExam() {
  const lines = [];
  examBuilderRows.querySelectorAll("input[data-sys]").forEach((inp) => {
    const v = inp.value.trim();
    if (v) lines.push(inp.dataset.sys + ": " + v);
  });
  return lines.join("\n");
}

function updateExamPreview() {
  examPreview.textContent = composeExam();
}
updateExamPreview();

document.getElementById("exam-builder-toggle").addEventListener("click", () => {
  examBuilder.classList.toggle("hidden");
});

document.getElementById("exam-insert").addEventListener("click", () => {
  appendText(fExam, composeExam());
  examBuilder.classList.add("hidden");
  fExam.focus();
});

// Clear all builder fields (empty every system).
document.getElementById("exam-clear").addEventListener("click", () => {
  examBuilderRows.querySelectorAll("input[data-sys]").forEach((inp) => (inp.value = ""));
  updateExamPreview();
});

// Edit-lists: add/remove custom dropdown options per system.
document.getElementById("exam-edit-toggle").addEventListener("click", () => {
  const ed = document.getElementById("exam-opt-editor");
  const chips = document.getElementById("exam-opt-chips");
  const show = ed.classList.contains("hidden");
  ed.classList.toggle("hidden", !show);
  chips.classList.toggle("hidden", !show);
  if (show) renderExamOptChips(parseInt(document.getElementById("exam-opt-sys").value || "0", 10));
});
document.getElementById("exam-opt-sys").addEventListener("change", (e) => {
  renderExamOptChips(parseInt(e.target.value, 10));
});
function addExamOption() {
  const idx = parseInt(document.getElementById("exam-opt-sys").value || "0", 10);
  const inp = document.getElementById("exam-opt-input");
  const val = inp.value.trim();
  if (!val) return;
  const g = "ex" + idx;
  if (!customChips[g]) customChips[g] = [];
  if (!customChips[g].includes(val)) {
    customChips[g].push(val);
    saveCustomChips(g);
    renderExamOptChips(idx);
    renderExamDatalist(idx);
  }
  inp.value = "";
  inp.focus();
}
document.getElementById("exam-opt-add").addEventListener("click", addExamOption);
document.getElementById("exam-opt-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addExamOption();
  }
});

// --- Per-user saved templates -------------------------------------------
// A template captures the reusable clinical fields (not bed/vitals) so a user
// can save "my febrile-neutropenia orders" etc. and re-apply with one tap.
const TEMPLATE_FIELDS = [
  "complaint", "history", "vBp", "vHr", "vRr", "vSpo2", "vTemp", "vGcs",
  "oxygen", "exam", "bedside", "management", "antibiotic", "fluid",
  "consult", "disposition",
];
let userTemplates = {};
let templatesSubscribed = false;
const myTemplatesEl = document.getElementById("my-templates");
const myTemplatesBar = document.getElementById("templates-panel");

function subscribeUserTemplates() {
  if (templatesSubscribed || !db || !uid) return;
  templatesSubscribed = true;
  onValue(ref(db, "users/" + uid + "/templates"), (snap) => {
    userTemplates = snap.val() || {};
    renderMyTemplates();
  });
}

let editingTemplate = null; // {id, shared} while editing an existing template

function mkBtn(cls, txt, title, handler) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = txt;
  b.title = title;
  b.addEventListener("click", handler);
  return b;
}

function sortedTemplateEntries(obj) {
  return Object.entries(obj).sort((a, b) => (a[1].order ?? 9999) - (b[1].order ?? 9999));
}

function reorderTemplate(id, dir) {
  const sorted = sortedTemplateEntries(userTemplates);
  const idx = sorted.findIndex(([tid]) => tid === id);
  const swap = dir === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= sorted.length) return;
  [sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]];
  const updates = {};
  sorted.forEach(([tid], i) => (updates["users/" + uid + "/templates/" + tid + "/order"] = i));
  update(ref(db), updates).catch((e) => console.error("reorder", e));
}

function loadTemplateForEdit(id, shared, t) {
  clearForm();
  loadFieldsRaw(t.fields); // keep macros unexpanded while editing
  editingTemplate = { id, shared };
  document.getElementById("save-template-editor").classList.remove("hidden");
  document.getElementById("macro-hint").classList.remove("hidden");
  document.getElementById("tpl-name").value = t.name || "";
  const shareCb = document.getElementById("tpl-share");
  shareCb.checked = shared;
  shareCb.disabled = true; // scope is fixed while editing
  document.getElementById("tpl-save-confirm").textContent = "Update template";
  setStatus(bedsideStatus, "Editing “" + (t.name || "") + "” — change fields, then Update", "ok");
}

function renderMyTemplates() {
  myTemplatesEl.innerHTML = "";
  sortedTemplateEntries(userTemplates).forEach(([tid, t]) => {
    const chip = document.createElement("span");
    chip.className = "chip mini custom";
    const lbl = document.createElement("span");
    lbl.className = "lbl-txt";
    lbl.textContent = t.name || "template";
    lbl.addEventListener("click", () => applyTemplate(tid));
    chip.appendChild(lbl);
    chip.append(
      mkBtn("mv", "▲", "move up", (ev) => { ev.stopPropagation(); reorderTemplate(tid, "up"); }),
      mkBtn("mv", "▼", "move down", (ev) => { ev.stopPropagation(); reorderTemplate(tid, "down"); }),
      mkBtn("x", "✎", "edit", (ev) => { ev.stopPropagation(); loadTemplateForEdit(tid, false, t); }),
      mkBtn("x", "✕", "delete", (ev) => {
        ev.stopPropagation();
        set(ref(db, "users/" + uid + "/templates/" + tid), null).catch((e) => console.error("del template", e));
      })
    );
    myTemplatesEl.appendChild(chip);
  });
}

function applyTemplateObj(t) {
  if (!t || !t.fields) return;
  Object.entries(t.fields).forEach(([field, val]) => {
    const el = FIELD_MAP[field];
    if (!el) return;
    const v = expandMacros(val); // resolve {{now+2h}} etc. at apply time
    if (el.tagName === "TEXTAREA") appendText(el, v);
    else el.value = v;
  });
  setStatus(bedsideStatus, "Applied template: " + (t.name || ""), "ok");
}
function applyTemplate(tid) {
  applyTemplateObj(userTemplates[tid]);
}

// --- Department (shared) templates --------------------------------------
let deptTemplates = {};
let deptSubscribed = false;
const deptTemplatesEl = document.getElementById("dept-templates");

function subscribeDeptTemplates() {
  if (deptSubscribed || !db) return;
  deptSubscribed = true;
  onValue(ref(db, "sharedTemplates"), (snap) => {
    deptTemplates = snap.val() || {};
    renderDeptTemplates();
  });
}

function renderDeptTemplates() {
  deptTemplatesEl.innerHTML = "";
  Object.entries(deptTemplates).forEach(([tid, t]) => {
    const chip = document.createElement("span");
    chip.className = "chip mini custom";
    const lbl = document.createElement("span");
    lbl.className = "lbl-txt";
    lbl.textContent = (t.name || "template") + (t.by ? " · " + t.by : "");
    lbl.addEventListener("click", () => applyTemplateObj(t));
    chip.appendChild(lbl);
    if (t.byUid === uid) {
      // Only the creator may edit or delete a shared template.
      const edit = mkBtn("x", "✎", "edit", (ev) => {
        ev.stopPropagation();
        loadTemplateForEdit(tid, true, t);
      });
      const del = mkBtn("x", "✕", "delete", (ev) => {
        ev.stopPropagation();
        set(ref(db, "sharedTemplates/" + tid), null).catch((e) => console.error("del shared", e));
      });
      edit.style.display = "inline";
      del.style.display = "inline";
      chip.append(edit, del);
    }
    deptTemplatesEl.appendChild(chip);
  });
}

function resetTemplateEditor() {
  editingTemplate = null;
  document.getElementById("tpl-name").value = "";
  document.getElementById("tpl-name").classList.remove("hidden");
  const shareCb = document.getElementById("tpl-share");
  shareCb.checked = false;
  shareCb.disabled = false;
  document.querySelector("#save-template-editor .share-label").classList.remove("hidden");
  document.getElementById("tpl-reset").classList.add("hidden");
  document.getElementById("tpl-save-confirm").textContent = "Save template";
  document.getElementById("save-template-editor").classList.add("hidden");
  document.getElementById("macro-hint").classList.add("hidden");
}

// Reset a quick template's wording back to the built-in default.
document.getElementById("tpl-reset").addEventListener("click", () => {
  if (editingTemplate && editingTemplate.condKey) {
    set(ref(db, "users/" + uid + "/condOverrides/" + editingTemplate.condKey), null).catch((e) =>
      console.error("reset cond", e)
    );
    setStatus(bedsideStatus, "Reset “" + editingTemplate.label + "” to default.", "ok");
  }
  clearForm();
  resetTemplateEditor();
});

document.getElementById("save-template").addEventListener("click", () => {
  document.getElementById("templates-panel").classList.remove("hidden"); // expand panel
  const ed = document.getElementById("save-template-editor");
  const willShow = ed.classList.contains("hidden");
  resetTemplateEditor(); // start a fresh (non-editing) save
  if (willShow) {
    ed.classList.remove("hidden");
    document.getElementById("macro-hint").classList.remove("hidden");
    document.getElementById("tpl-name").focus();
  }
});
document.getElementById("tpl-edit").addEventListener("click", () => {
  const panel = document.getElementById("templates-panel");
  panel.classList.remove("hidden"); // expand so edits are visible
  const editing = panel.classList.toggle("editing");
  const btn = document.getElementById("tpl-edit");
  btn.textContent = editing ? "✓ Done" : "✏️";
  btn.classList.toggle("active", editing);
  btn.title = editing ? "Finish editing" : "Edit / hide templates";
  document.getElementById("tpl-edit-banner").classList.toggle("hidden", !editing);
  renderQuickTemplates(); // show/hide the ✕/↺ hide toggles
});
function saveTemplate() {
  const fields = {};
  TEMPLATE_FIELDS.forEach((f) => {
    const v = (FIELD_MAP[f].value || "").trim();
    if (v) fields[f] = v;
  });

  // Editing a quick (condition) template's wording → save as an override.
  if (editingTemplate && editingTemplate.condKey) {
    set(ref(db, "users/" + uid + "/condOverrides/" + editingTemplate.condKey), { fields }).catch((e) =>
      console.error("save cond override", e)
    );
    setStatus(bedsideStatus, "Saved changes to “" + editingTemplate.label + "”.", "ok");
    clearForm();
    resetTemplateEditor();
    return;
  }

  const name = document.getElementById("tpl-name").value.trim();
  if (!name) return;
  const share = document.getElementById("tpl-share").checked;

  if (editingTemplate) {
    // Update an existing template in place, keeping its scope and sort order.
    const payload = editingTemplate.shared
      ? { name, fields, by: clinician, byUid: uid }
      : { name, fields };
    const existing = editingTemplate.shared
      ? deptTemplates[editingTemplate.id]
      : userTemplates[editingTemplate.id];
    if (!editingTemplate.shared && existing && typeof existing.order === "number") {
      payload.order = existing.order;
    }
    const path = editingTemplate.shared
      ? "sharedTemplates/" + editingTemplate.id
      : "users/" + uid + "/templates/" + editingTemplate.id;
    set(ref(db, path), payload).catch((e) => console.error("update template", e));
    setStatus(bedsideStatus, "Updated template: " + name, "ok");
  } else if (share) {
    push(ref(db, "sharedTemplates"), { name, fields, by: clinician, byUid: uid }).catch((e) =>
      console.error("share template", e)
    );
    setStatus(bedsideStatus, "Shared template: " + name, "ok");
  } else {
    push(ref(db, "users/" + uid + "/templates"), { name, fields }).catch((e) =>
      console.error("save template", e)
    );
    setStatus(bedsideStatus, "Saved template: " + name, "ok");
  }
  resetTemplateEditor();
}
// Emoji picker: prepend the chosen icon to the template name (swap any existing).
document.querySelectorAll("#tpl-emoji-row .emoji-btn").forEach((b) => {
  b.addEventListener("click", () => {
    const inp = document.getElementById("tpl-name");
    let rest = inp.value;
    try {
      rest = rest.replace(/^\s*\p{Extended_Pictographic}[\p{Extended_Pictographic}️‍]*\s*/u, "");
    } catch {
      rest = rest.replace(/^\s*\S*\s*/, ""); // fallback
    }
    inp.value = b.textContent + " " + rest;
    inp.focus();
  });
});

document.getElementById("tpl-save-confirm").addEventListener("click", saveTemplate);
document.getElementById("tpl-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveTemplate();
  }
});

// --- Meds builder --------------------------------------------------------
const DEFAULT_ABX = [
  "Ceftriaxone", "Cefazolin", "Ceftazidime", "Cefotaxime", "Cefoxitin",
  "Ampicillin/Sulbactam", "Piperacillin/Tazobactam", "Meropenem", "Imipenem",
  "Ciprofloxacin", "Levofloxacin", "Azithromycin", "Clindamycin",
  "Metronidazole", "Vancomycin", "Amoxicillin/Clavulanate", "Gentamicin",
  "Doxycycline", "Cloxacillin",
];
const DEFAULT_VASO = ["Norepinephrine", "Adrenaline", "Dopamine", "Dobutamine", "Vasopressin", "Phenylephrine"];
const DEFAULT_FLUIDS = ["NSS", "RLS", "Acetar", "D5W", "D5S", "D5N/2", "DNSS", "D5LR", "Plasma-Lyte", "3% NaCl", "Sterofundin"];
// Specific IV fluids for the "IV fluid" picker (descriptive names).
const FLUID_OPTIONS = [
  "0.9% NaCl (NSS)",
  "Ringer's lactate (RLS / Hartmann)",
  "Acetar (balanced)",
  "D5W",
  "D5/0.9% NaCl (D5S)",
  "D5/0.45% NaCl (D5 N/2)",
  "D5/0.225% NaCl (D5 N/5)",
  "DNSS (D5 + NSS)",
  "D5 Ringer's lactate (D5LR)",
  "Plasma-Lyte / Sterofundin (balanced)",
  "3% NaCl (hypertonic)",
  "5% Albumin",
];
const DEFAULT_NEB = ["Salbutamol (Ventolin)", "Ipratropium (Atrovent)", "Berodual"];
const DEFAULT_CMED = [
  "Paracetamol", "Tramadol", "Morphine", "Pethidine", "Ketorolac", "Diclofenac",
  "Ondansetron", "Metoclopramide (Plasil)", "Dimenhydrinate", "Domperidone",
  "Dexamethasone", "Hydrocortisone", "Chlorpheniramine (CPM)", "Hydroxyzine",
  "Omeprazole", "Pantoprazole", "Ranitidine", "Hyoscine (Buscopan)",
  "Diazepam", "Midazolam", "Furosemide (Lasix)", "Tranexamic acid",
  "Vitamin K", "Calcium gluconate", "MgSO4", "50% glucose", "Naloxone",
  "Adrenaline", "Atropine",
];

// Select-backed med lists: the user's custom (favourite) items come first,
// then the built-in defaults.
const MED_SELECTS = {
  vaso: { el: document.getElementById("vaso-drug"), defaults: DEFAULT_VASO },
  fluidtypes: { el: document.getElementById("load-fluid"), defaults: DEFAULT_FLUIDS },
  commonmed: { el: document.getElementById("cmed-drug"), defaults: DEFAULT_CMED },
};

function renderMedSelect(group) {
  const cfg = MED_SELECTS[group];
  if (!cfg) return;
  const prev = cfg.el.value;
  cfg.el.innerHTML = "";
  (customChips[group] || []).concat(cfg.defaults).forEach((name) => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    cfg.el.appendChild(o);
  });
  if (prev) cfg.el.value = prev;
}

// Antibiotic is a native <select> (real dropdown — datalists misbehave on
// some Android/Samsung keyboards, showing only in the suggestion strip).
function renderAbxList() {
  const sel = document.getElementById("abx-drug");
  const prev = sel.value;
  sel.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "— antibiotic —";
  sel.appendChild(blank);
  (customChips.abx || []).concat(DEFAULT_ABX).forEach((name) => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}

// Nebulization is checkbox-backed (multi-select).
function renderNeb() {
  const list = document.getElementById("neb-list");
  const checked = new Set([...list.querySelectorAll("input:checked")].map((c) => c.value));
  list.innerHTML = "";
  (customChips.neb || []).concat(DEFAULT_NEB).forEach((name) => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = name;
    if (checked.has(name)) cb.checked = true;
    label.append(cb, document.createTextNode(" " + name.replace(/\s*\(.*\)$/, "")));
    list.appendChild(label);
  });
}

renderAbxList();
["vaso", "fluidtypes", "commonmed"].forEach(renderMedSelect);
renderNeb();

document.getElementById("meds-toggle").addEventListener("click", () => {
  document.getElementById("meds-builder").classList.toggle("hidden");
});

// Antibiotic → append to the antibiotic field
document.getElementById("abx-add").addEventListener("click", () => {
  const drug = document.getElementById("abx-drug").value.trim();
  if (!drug) return;
  const dose = document.getElementById("abx-dose").value.trim();
  const route = document.getElementById("abx-route").value;
  const line = drug + (dose ? " " + dose : "") + " " + route + " @ " + nowTime();
  const cur = fAntibiotic.value.trim();
  fAntibiotic.value = cur ? cur + "; " + line : line;
  document.getElementById("abx-drug").value = "";
  document.getElementById("abx-dose").value = "";
});

// Vasopressor concentration suggestions come from the drip-calculator preps.
function pressorFor(drugName) {
  const first = (drugName || "").split(/[\s(/]/)[0].toLowerCase();
  return first ? PRESSORS.find((p) => p.name.toLowerCase().includes(first)) : null;
}
function updateVasoConc() {
  const sel = document.getElementById("vaso-conc");
  const prev = sel.value;
  sel.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "— concentration —";
  sel.appendChild(blank);
  const p = pressorFor(document.getElementById("vaso-drug").value);
  (p ? p.preps : []).forEach((prep) => {
    const o = document.createElement("option");
    o.value = prep.label.replace(/\s{2,}/g, " ").trim();
    o.textContent = o.value;
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}
document.getElementById("vaso-drug").addEventListener("change", updateVasoConc);
updateVasoConc();

// Vasopressor → append to management (drug · concentration · rate)
document.getElementById("vaso-add").addEventListener("click", () => {
  const drug = document.getElementById("vaso-drug").value;
  const conc = document.getElementById("vaso-conc").value.trim();
  const rate = document.getElementById("vaso-rate").value.trim();
  appendText(
    fManagement,
    "- Vasopressor: " + drug + (conc ? " " + conc : "") + (rate ? " @ " + rate : "") + " (started " + nowTime() + ")"
  );
  document.getElementById("vaso-conc").value = "";
  document.getElementById("vaso-rate").value = "";
});

// Specific IV-fluid picker → append the chosen fluid into the IV fluid field.
const fluidTypeSel = document.getElementById("fluid-type");
const ftBlank = document.createElement("option");
ftBlank.value = "";
ftBlank.textContent = "— pick a specific fluid —";
fluidTypeSel.appendChild(ftBlank);
FLUID_OPTIONS.forEach((name) => {
  const o = document.createElement("option");
  o.value = name;
  o.textContent = name;
  fluidTypeSel.appendChild(o);
});
fluidTypeSel.addEventListener("change", () => {
  const v = fluidTypeSel.value;
  if (!v) return;
  const cur = fFluid.value.trim();
  fFluid.value = cur ? cur + "; " + v + " " : v + " ";
  fluidTypeSel.value = "";
  fFluid.focus();
});

// Common medication → append to management (drug · dose · route · time)
document.getElementById("cmed-add").addEventListener("click", () => {
  const drug = document.getElementById("cmed-drug").value;
  if (!drug) return;
  const dose = document.getElementById("cmed-dose").value.trim();
  const route = document.getElementById("cmed-route").value;
  appendText(fManagement, "- " + drug + (dose ? " " + dose : "") + " " + route + " @ " + nowTime());
  document.getElementById("cmed-dose").value = "";
});

// Immunization / vaccine quick chips → append (deduped) to the immun field.
document.querySelectorAll("[data-immun]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const token = btn.dataset.immun;
    const items = fImmun.value.split(";").map((s) => s.trim()).filter(Boolean);
    if (!items.includes(token)) items.push(token);
    fImmun.value = items.join("; ");
  });
});

// IV fluid loading → append to fluid field
document.getElementById("load-add").addEventListener("click", () => {
  const fluid = document.getElementById("load-fluid").value;
  const vol = document.getElementById("load-vol").value.trim();
  const min = document.getElementById("load-min").value.trim();
  if (!vol) return;
  const line = fluid + " " + vol + " ml IV load" + (min ? " over " + min + " min" : "");
  const cur = fFluid.value.trim();
  fFluid.value = cur ? cur + "; " + line : line;
  document.getElementById("load-vol").value = "";
  document.getElementById("load-min").value = "";
});

// Nebulization → append to management
document.getElementById("neb-add").addEventListener("click", () => {
  const drugs = [...document.querySelectorAll("#neb-list input[type=checkbox]:checked")].map(
    (c) => c.value
  );
  if (!drugs.length) return;
  const doses = document.getElementById("neb-doses").value.trim();
  appendText(fManagement, "- Nebulization: " + drugs.join(" + ") + (doses ? " × " + doses : ""));
  document.querySelectorAll("#neb-list input[type=checkbox]").forEach((c) => (c.checked = false));
  document.getElementById("neb-doses").value = "";
});

// Management quick-pick chips.
document.querySelectorAll("[data-mgmt]").forEach((btn) => {
  btn.addEventListener("click", () => addMgmtLine(btn.dataset.mgmt));
});

// Underlying-disease chips — maintain a single deduped "Underlying: ..." line
// at the top of the history field, preserving whatever else was typed.
const UD_PREFIX = "Underlying: ";
function addUnderlying(token) {
  const lines = fHistory.value.split("\n");
  const idx = lines.findIndex((l) => l.startsWith(UD_PREFIX));
  if (idx === -1) {
    lines.unshift(UD_PREFIX + token);
  } else {
    const items = lines[idx]
      .slice(UD_PREFIX.length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.includes(token)) items.push(token);
    lines[idx] = UD_PREFIX + items.join(", ");
  }
  fHistory.value = lines.join("\n");
}
document.querySelectorAll("[data-ud]").forEach((btn) => {
  btn.addEventListener("click", () => addUnderlying(btn.dataset.ud));
});

// --- Per-user custom quick-item chips -----------------------------------
// Each user can add/edit their own chips for the "ud" and "mgmt" rows; they
// are stored under /users/{uid}/chips/{group} and sync across their devices.
const GROUP_APPLY = { ud: addUnderlying, mgmt: addMgmtLine };

function renderCustomChips(group) {
  const row = document.getElementById(group + "-chips");
  if (!row) return;
  const container = row.querySelector(".custom-chips");
  container.innerHTML = "";
  customChips[group].forEach((item, i) => {
    const chip = document.createElement("span");
    chip.className = "chip mini custom";
    const t = document.createElement("span");
    t.className = "lbl-txt";
    t.textContent = item;
    if (GROUP_APPLY[group]) t.addEventListener("click", () => GROUP_APPLY[group](item));
    else t.style.cursor = "default";

    // Reorder controls (shown in edit mode).
    const up = document.createElement("button");
    up.type = "button";
    up.className = "mv";
    up.textContent = "▲";
    up.title = "move up";
    up.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (i > 0) {
        [customChips[group][i - 1], customChips[group][i]] = [customChips[group][i], customChips[group][i - 1]];
        saveCustomChips(group);
        renderCustomChips(group);
      }
    });
    const down = document.createElement("button");
    down.type = "button";
    down.className = "mv";
    down.textContent = "▼";
    down.title = "move down";
    down.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (i < customChips[group].length - 1) {
        [customChips[group][i + 1], customChips[group][i]] = [customChips[group][i], customChips[group][i + 1]];
        saveCustomChips(group);
        renderCustomChips(group);
      }
    });

    const ren = document.createElement("button");
    ren.type = "button";
    ren.className = "mv";
    ren.textContent = "✎";
    ren.title = "rename";
    ren.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const input = document.createElement("input");
      input.type = "text";
      input.className = "chip-rename";
      input.value = customChips[group][i];
      let done = false;
      const commit = () => {
        if (done) return;
        done = true;
        const val = input.value.trim();
        if (val && val !== customChips[group][i]) {
          customChips[group][i] = val;
          saveCustomChips(group);
        }
        renderCustomChips(group);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { done = true; renderCustomChips(group); }
      });
      input.addEventListener("blur", commit);
      t.replaceWith(input);
      input.focus();
      input.select();
    });

    const x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.textContent = "✕";
    x.title = "remove";
    x.addEventListener("click", (ev) => {
      ev.stopPropagation();
      customChips[group].splice(i, 1);
      saveCustomChips(group);
      renderCustomChips(group);
    });
    chip.append(t, ren, up, down, x);
    container.appendChild(chip);
  });
  if (group === "abx") renderAbxList();
  else if (MED_SELECTS[group]) renderMedSelect(group);
  else if (group === "neb") renderNeb();
}

function saveCustomChips(group) {
  if (!uid) return;
  set(ref(db, "users/" + uid + "/chips/" + group), customChips[group]).catch((e) =>
    console.error("save chips", e)
  );
}

function subscribeCustomChips() {
  if (chipsSubscribed || !db || !uid) return;
  chipsSubscribed = true;
  onValue(ref(db, "users/" + uid + "/chips"), (snap) => {
    const v = snap.val() || {};
    ["ud", "mgmt", "abx", "vaso", "fluidtypes", "neb", "commonmed",
     "ex0", "ex1", "ex2", "ex3", "ex4", "ex5", "ex6", "hiddenQt"].forEach((g) => {
      customChips[g] = v[g] ? Object.values(v[g]) : [];
      renderCustomChips(g);
    });
    [0, 1, 2, 3, 4, 5, 6].forEach(renderExamDatalist);
    renderQuickTemplates();
  });
  onValue(ref(db, "users/" + uid + "/normalPe"), (snap) => {
    customNormalPe = snap.val() || "";
  });
  onValue(ref(db, "users/" + uid + "/condOverrides"), (snap) => {
    condOverrides = snap.val() || {};
    renderQuickTemplates();
  });
}

function addCustomItem(group) {
  const editor = document.getElementById(group + "-editor");
  const input = editor.querySelector("input");
  const val = input.value.trim();
  if (!val) return;
  if (!customChips[group].includes(val)) {
    customChips[group].push(val);
    saveCustomChips(group);
    renderCustomChips(group);
  }
  input.value = "";
  input.focus();
}

// Toggle a row's edit mode (reveals the add-input and per-chip remove ✕).
document.querySelectorAll("[data-edit]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const group = btn.dataset.edit;
    const row = document.getElementById(group + "-chips");
    const editor = document.getElementById(group + "-editor");
    const on = row.classList.toggle("editing");
    editor.classList.toggle("hidden", !on);
    if (on) editor.querySelector("input").focus();
  });
});
document.querySelectorAll("[data-additem]").forEach((btn) => {
  btn.addEventListener("click", () => addCustomItem(btn.dataset.additem));
});
document.querySelectorAll(".chip-editor input").forEach((inp) => {
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomItem(inp.closest(".chip-editor").id.replace("-editor", ""));
    }
  });
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

// Quick (condition) templates. Each has editable field-fill defaults (with
// {{now}} / {{now+2h}} macros for dynamic times). Users can edit the wording
// (stored as an override in /users/{uid}/condOverrides/{key}), hide, or restore.
const QUICK_TEMPLATES = [
  { key: "sepsis", label: "🦠 Sepsis" },
  { key: "chestpain", label: "🫀 Chest pain" },
  { key: "anaphylaxis", label: "🐝 Anaphylaxis" },
  { key: "stroke", label: "🧠 Stroke" },
  { key: "trauma", label: "🚑 Trauma" },
];

const CONDITION_DEFAULTS = {
  sepsis: { fields: {
    management: "[Septic work-up]\n- IV access x2; O2 to keep SpO2 >= 94%\n- Hemoculture x2 (before antibiotics)\n- CBC, BUN/Cr, electrolytes, LFT, coagulogram\n- Lactate (repeat if >= 2)\n- Urinalysis + urine culture; consider CXR\n- IV fluid resuscitation (see fluid)\n- Antibiotics within 1 hr (see antibiotic)\n- Identify & control source: ___",
    fluid: "NSS/RLS 30 ml/kg IV bolus, reassess",
    oxygen: "Nasal cannula",
  } },
  chestpain: { fields: {
    bedside: "[Serial ECG]\nECG #1 ({{now}}): rate/rhythm ___ , axis ___ , ST-segment ___ , T-wave ___\nECG #2 (____): rate/rhythm ___ , ST-segment ___ (compare to #1)\nECG #3 (____): ___",
    management: "[Chest pain / ACS work-up]\n- 12-lead ECG within 10 min of arrival; serial ECG (see bedside test)\n- Cardiac troponin (serial) + CBC, BUN/Cr, electrolytes, coagulogram\n- Continuous cardiac monitor + SpO2; IV access\n- ASA (if not contraindicated); analgesia; consider GTN\n- CXR; risk-stratify (e.g. HEART score)",
  } },
  anaphylaxis: { fields: {
    management: "[Anaphylaxis]\n- Epinephrine 1:1000 0.5 ml IM anterolateral thigh (given {{now}})\n- Remove trigger; high-flow O2; lay supine with legs raised\n- IV access; IV fluid bolus\n- CPM 10 mg IV stat\n- Dexamethasone 8 mg IV stat\n- Observe for at least 2 hours (until {{now+2h}})\n- Repeat epinephrine every 5-15 min if no improvement",
    fluid: "NSS IV bolus",
    oxygen: "Non-rebreather mask",
  } },
  stroke: { fields: {
    exam: "[Stroke / neuro assessment]\nLast known well: ___    Onset: ___\nGCS: E_V_M_    Pupils: R__ L__\nNIHSS total: ___\n- LOC / orientation / commands: ___\n- Best gaze / visual fields: ___\n- Facial palsy: ___\n- Motor arm   R: ___   L: ___\n- Motor leg   R: ___   L: ___\n- Limb ataxia: ___\n- Sensory: ___\n- Language / dysarthria: ___\n- Extinction / neglect: ___\nCapillary blood glucose: ___",
    management: "[Stroke fast-track]\n- NPO; head of bed 30°\n- CT brain non-contrast STAT (± CTA)\n- Capillary glucose; correct if abnormal\n- BP monitoring (avoid over-correction)\n- Screen thrombolysis / thrombectomy eligibility\n- Notify stroke team; document onset/LKW time",
  } },
  trauma: { fields: {
    exam: "[Primary survey — ABCDE]\nA (airway + C-spine control): ___\nB (breathing, RR, chest, SpO2): ___\nC (circulation, pulses, external bleeding): ___\nD (disability, GCS __, pupils R__ L__): ___\nE (exposure, temp, log-roll / back): ___\n\n[EFAST]\n- Pericardial: ___\n- RUQ (Morison's pouch): ___\n- LUQ (splenorenal): ___\n- Pelvis / pouch of Douglas: ___\n- Lung sliding   R: ___   L: ___\n\n[Secondary survey / AMPLE Hx]: ___",
    management: "[Trauma resuscitation]\n- Time of arrival: {{now}}   Primary survey: {{now}}\n- 2 large-bore IV; trauma labs + group & cross-match\n- Control external hemorrhage; C-collar / immobilization\n- Analgesia; tetanus prophylaxis as indicated\n- Imaging: trauma series / CT as indicated\n- Activate massive transfusion protocol if needed",
  } },
};

// Current fields for a condition = the user's override if present, else default.
function getCond(key) {
  return (condOverrides[key] && condOverrides[key].fields) || CONDITION_DEFAULTS[key].fields;
}

// Populate the form from field data WITHOUT expanding macros (for editing).
function loadFieldsRaw(fields) {
  Object.entries(fields || {}).forEach(([field, val]) => {
    const el = FIELD_MAP[field];
    if (!el) return;
    if (el.tagName === "TEXTAREA") appendText(el, val);
    else el.value = val;
  });
}

function loadCondForEdit(key, label) {
  clearForm();
  loadFieldsRaw(getCond(key));
  editingTemplate = { condKey: key, label };
  document.getElementById("templates-panel").classList.remove("editing");
  document.getElementById("tpl-edit").textContent = "✏️";
  document.getElementById("tpl-edit").classList.remove("active");
  document.getElementById("tpl-edit-banner").classList.add("hidden");
  const ed = document.getElementById("save-template-editor");
  ed.classList.remove("hidden");
  document.getElementById("macro-hint").classList.remove("hidden");
  document.getElementById("tpl-name").classList.add("hidden");
  document.querySelector("#save-template-editor .share-label").classList.add("hidden");
  document.getElementById("tpl-reset").classList.remove("hidden");
  document.getElementById("tpl-save-confirm").textContent = "Save changes to " + label;
  setStatus(bedsideStatus, "Editing quick template “" + label + "” — edit the fields, then Save changes.", "ok");
}

function renderQuickTemplates() {
  const el = document.getElementById("quick-templates");
  if (!el) return;
  el.innerHTML = "";
  const editing = document.getElementById("templates-panel").classList.contains("editing");
  const hidden = customChips.hiddenQt || [];
  QUICK_TEMPLATES.forEach((qt) => {
    const isHidden = hidden.includes(qt.key);
    if (!editing && isHidden) return;
    if (!editing) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip cond";
      btn.textContent = qt.label + (condOverrides[qt.key] ? " ✎" : "");
      btn.addEventListener("click", () => {
        applyTemplateObj({ name: qt.label, fields: getCond(qt.key) });
      });
      el.appendChild(btn);
    } else {
      const chip = document.createElement("span");
      chip.className = "chip cond custom" + (isHidden ? " qt-hidden" : "");
      const t = document.createElement("span");
      t.className = "lbl-txt";
      t.textContent = qt.label;
      t.style.cursor = "default";
      chip.appendChild(t);
      if (!isHidden) {
        const e = document.createElement("button");
        e.type = "button";
        e.className = "x";
        e.style.display = "inline";
        e.textContent = "✎";
        e.title = "edit wording";
        e.addEventListener("click", (ev) => {
          ev.stopPropagation();
          loadCondForEdit(qt.key, qt.label);
        });
        chip.appendChild(e);
      }
      const x = document.createElement("button");
      x.type = "button";
      x.className = "x";
      x.style.display = "inline";
      x.textContent = isHidden ? "↺" : "✕";
      x.title = isHidden ? "restore" : "hide";
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const h = customChips.hiddenQt || (customChips.hiddenQt = []);
        if (isHidden) {
          const i = h.indexOf(qt.key);
          if (i >= 0) h.splice(i, 1);
        } else h.push(qt.key);
        saveCustomChips("hiddenQt");
        renderQuickTemplates();
      });
      chip.appendChild(x);
      el.appendChild(chip);
    }
  });
}
renderQuickTemplates();

// Collapse/expand the whole templates panel.
document.getElementById("templates-toggle").addEventListener("click", () => {
  document.getElementById("templates-panel").classList.toggle("hidden");
});

sendBtn.addEventListener("click", async () => {
  const bed = fBed.value.trim();
  if (!bed) {
    setStatus(bedsideStatus, "Bed / identifier is required.", "error");
    fBed.focus();
    return;
  }
  if (!uid) return;

  const payload = { by: clinician, byUid: uid, status: "active", updatedAt: serverTimestamp() };
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
    card.className =
      "p-card" + (id === selectedId ? " active" : "") + (isOwn(e) ? " mine" : "");
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
    if (isOwn(e)) {
      const tag = document.createElement("span");
      tag.className = "mine-tag";
      tag.textContent = "mine";
      card.querySelector(".bed").appendChild(tag);
    }
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
  if (e.homemed) parts.push("\nHOME MEDICATION:\n" + e.homemed);
  if (e.immun) parts.push("\nIMMUNIZATION / VACCINE:\n" + e.immun);

  const vit = vitalsLine(e);
  if (vit) parts.push("\nVITALS:\n" + vit);

  if (e.exam) parts.push("\nPHYSICAL EXAM:\n" + e.exam);
  if (e.bedside) parts.push("\nBEDSIDE TESTS:\n" + e.bedside);
  if (e.management) parts.push("\nINITIAL MANAGEMENT:\n" + e.management);
  if (e.fluid) parts.push("\nIV FLUID:\n" + e.fluid);
  if (e.antibiotic) parts.push("\nANTIBIOTIC:\n" + e.antibiotic);
  if (e.consult) parts.push("\nCONSULTATION: " + e.consult);
  if (e.disposition) parts.push("\nDISPOSITION: " + e.disposition);
  if (e.cpr) parts.push("\n" + e.cpr);

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
// Is this encounter mine? Prefer the stored creator uid; fall back to the
// display name for records saved before byUid existed.
function isOwn(e) {
  return !!e && (e.byUid ? e.byUid === uid : e.by === clinician);
}

// Active encounters, my own first, then everyone else's — each newest-first.
function activeSorted() {
  return Object.entries(encounters)
    .filter(([, e]) => e && e.status === "active")
    .sort((a, b) => {
      const ao = isOwn(a[1]) ? 0 : 1;
      const bo = isOwn(b[1]) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (b[1].updatedAt || 0) - (a[1].updatedAt || 0);
    });
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

// Expand dynamic macros in template text so users can build time-aware
// templates (like anaphylaxis "observe until {{now+2h}}") without any code.
// Supported: {{now}}, {{now+2h}}, {{now+30m}}, {{now-1h}}, {{date}}, {{datetime}}
function expandMacros(text) {
  if (!text) return text;
  return text.replace(
    /\{\{\s*(now|date|datetime)\s*([+-]\s*\d+\s*[hm])?\s*\}\}/gi,
    (_, base, delta) => {
      let d = new Date();
      if (delta) {
        const clean = delta.replace(/\s+/g, "");
        const sign = clean[0] === "-" ? -1 : 1;
        const num = parseInt(clean.slice(1), 10);
        const unit = clean.slice(-1).toLowerCase();
        d = new Date(d.getTime() + sign * num * (unit === "h" ? 3600000 : 60000));
      }
      if (/^date$/i.test(base)) return d.toLocaleDateString();
      if (/^datetime$/i.test(base)) return d.toLocaleString();
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  );
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

// ---------------------------------------------------------------------------
// DRUG DOSE CALCULATOR — inotropes / vasopressors
// dose(mcg/min)     = rate(mL/hr) × conc(mcg/mL) / 60
// dose(mcg/kg/min)  = dose(mcg/min) / weight(kg)
// conc(mcg/mL)      = amount(mg) × 1000 / volume(mL)   (or U/mL for vasopressin)
// Ranges are usual-practice guidance only — always verify against protocol.
// ---------------------------------------------------------------------------

const calcDrugSel = $("calc-drug");
const calcPrepSel = $("calc-prep");
const calcDrugNote = $("calc-drug-note");
const calcWeight = $("calc-weight");
const calcRate = $("calc-rate");
const calcAmt = $("calc-amt");
const calcAmtUnit = $("calc-amt-unit");
const calcVol = $("calc-vol");
const calcConcEl = $("calc-conc");
const calcOutMin = $("calc-out-min");
const calcOutKg = $("calc-out-kg");
const calcOutKgWrap = $("calc-out-kg-wrap");
const calcRangeEl = $("calc-range");
const calcTarget = $("calc-target");
const calcTargetUnit = $("calc-target-unit");
const calcOutRate = $("calc-out-rate");
const calcScreen = $("calc-screen");
const dotCalc = $("dot-calc");

let curDrug = PRESSORS[0];

// Short mass label ("mcg" for most, "U" for vasopressin).
const massShort = (d) => (d.massUnit === "unit" ? "U" : "mcg");

// Show a dose with a sensible number of decimals, trailing zeros trimmed.
function fmtDose(v) {
  if (!isFinite(v) || v <= 0) return "—";
  const dp = v < 1 ? 3 : v < 10 ? 2 : 1;
  return parseFloat(v.toFixed(dp)).toString();
}

// Current concentration in massUnit per mL (mcg/mL or U/mL).
function currentConc() {
  const amt = parseFloat(calcAmt.value);
  const vol = parseFloat(calcVol.value);
  if (!(amt > 0) || !(vol > 0)) return NaN;
  return (curDrug.massUnit === "unit" ? amt : amt * 1000) / vol;
}

function showRange(value) {
  const r = curDrug.range;
  let cls = "within", txt = "within usual range";
  if (value < r.lo) { cls = "low"; txt = "below usual starting range"; }
  else if (value > r.hi) { cls = "high"; txt = "ABOVE usual max — double-check"; }
  calcRangeEl.className = "calc-range " + cls;
  calcRangeEl.textContent = "Usual " + r.lo + "-" + r.hi + " " + r.unit + " · " + txt;
}

function recomputeReverse(conc, w) {
  const t = parseFloat(calcTarget.value);
  if (!(t > 0) || !isFinite(conc)) { calcOutRate.textContent = "—"; return; }
  let perMin;
  if (calcTargetUnit.value === "perkg") {
    if (!(w > 0)) { calcOutRate.textContent = "enter weight"; return; }
    perMin = t * w;
  } else {
    perMin = t; // mcg/min or U/min
  }
  calcOutRate.textContent = fmtDose((perMin * 60) / conc) + " mL/hr";
}

function recompute() {
  const conc = currentConc();
  const w = parseFloat(calcWeight.value);
  const rate = parseFloat(calcRate.value);

  calcConcEl.textContent = isFinite(conc)
    ? "= " + fmtDose(conc) + " " + massShort(curDrug) + "/mL"
    : "";

  if (isFinite(conc) && rate > 0) {
    const perMin = (rate * conc) / 60;
    calcOutMin.textContent = fmtDose(perMin) + " " + massShort(curDrug) + "/min";
    if (curDrug.weightBased) {
      calcOutKgWrap.style.display = "";
      if (w > 0) {
        const perKg = perMin / w;
        calcOutKg.textContent = fmtDose(perKg) + " mcg/kg/min";
        showRange(perKg);
      } else {
        calcOutKg.textContent = "enter weight";
        calcRangeEl.textContent = "";
        calcRangeEl.className = "calc-range";
      }
    } else {
      calcOutKgWrap.style.display = "none";
      showRange(perMin); // vasopressin: compare U/min directly
    }
  } else {
    calcOutMin.textContent = "—";
    calcOutKg.textContent = "—";
    calcRangeEl.textContent = "";
    calcRangeEl.className = "calc-range";
  }

  recomputeReverse(conc, w);
}

function applyPrep(i) {
  const p = curDrug.preps[i];
  if (!p) return;
  calcAmt.value = curDrug.massUnit === "unit" ? p.u : p.mg;
  calcVol.value = p.ml;
  calcPrepSel.value = String(i);
  recompute();
}

function selectDrug(key) {
  curDrug = PRESSORS.find((d) => d.key === key) || PRESSORS[0];
  calcDrugNote.textContent = curDrug.note;
  calcAmtUnit.textContent = curDrug.massUnit === "unit" ? "units" : "mg";

  // Preparation presets (+ a "Custom…" sentinel).
  calcPrepSel.innerHTML = "";
  curDrug.preps.forEach((p, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = p.label;
    calcPrepSel.appendChild(o);
  });
  const cust = document.createElement("option");
  cust.value = "custom";
  cust.textContent = "Custom…";
  calcPrepSel.appendChild(cust);

  // Target-dose units depend on whether the drug is weight-based.
  calcTargetUnit.innerHTML = "";
  const unitOpts = curDrug.weightBased
    ? [["perkg", "mcg/kg/min"], ["permin", "mcg/min"]]
    : [["permin", "U/min"]];
  unitOpts.forEach(([val, txt]) => {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = txt;
    calcTargetUnit.appendChild(o);
  });

  applyPrep(0); // seed concentration from the first prep, then compute
}

calcDrugSel.addEventListener("change", () => selectDrug(calcDrugSel.value));
calcPrepSel.addEventListener("change", () => {
  if (calcPrepSel.value !== "custom") applyPrep(parseInt(calcPrepSel.value, 10));
});
// Editing the amount/volume by hand switches the prep selector to "Custom…".
[calcAmt, calcVol].forEach((el) =>
  el.addEventListener("input", () => {
    calcPrepSel.value = "custom";
    recompute();
  })
);
[calcWeight, calcRate, calcTarget].forEach((el) => el.addEventListener("input", recompute));
calcTargetUnit.addEventListener("change", recompute);

// One-line summary of the current drip result, e.g.
// "Norepinephrine 16 mcg/mL at 5 mL/hr (60 kg) = 1.33 mcg/min = 0.022 mcg/kg/min".
function calcSummary() {
  const min = calcOutMin.textContent;
  if (min === "—") return "";
  const kg = curDrug.weightBased ? calcOutKg.textContent : "";
  return (
    curDrug.name +
    " " + (calcConcEl.textContent || "").replace(/^=\s*/, "") +
    " at " + (calcRate.value || "?") + " mL/hr" +
    (calcWeight.value ? " (" + calcWeight.value + " kg)" : "") +
    " = " + min + (kg && kg !== "enter weight" ? " = " + kg : "")
  );
}

function flashBtn(btn, msg) {
  const prev = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => (btn.textContent = prev), 1200);
}

$("calc-copy").addEventListener("click", async () => {
  const summary = calcSummary();
  if (!summary) return;
  try {
    await navigator.clipboard.writeText(summary);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = summary;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  flashBtn($("calc-copy"), "✓ Copied");
});

// Drop the computed drip straight into the bedside "Initial management" field.
$("calc-to-mgmt").addEventListener("click", () => {
  const summary = calcSummary();
  if (!summary) {
    flashBtn($("calc-to-mgmt"), "enter rate first");
    return;
  }
  addMgmtLine(summary); // appends "- <summary>" to fManagement (deduped)
  flashBtn($("calc-to-mgmt"), "✓ Added to management");
});

// Populate the drug picker once, then seed the default drug.
PRESSORS.forEach((d) => {
  const o = document.createElement("option");
  o.value = d.key;
  o.textContent = d.name;
  calcDrugSel.appendChild(o);
});
selectDrug(PRESSORS[0].key);

// Open from either role's top bar; remember where to return.
let calcReturn = "bedside";
document.querySelectorAll("[data-open-calc]").forEach((btn) => {
  btn.addEventListener("click", () => {
    calcReturn = role || "bedside";
    hideAll();
    calcScreen.classList.remove("hidden");
    showCalcHome();
    dotCalc.classList.toggle("online", !!uid);
  });
});
$("calc-back").addEventListener("click", () => {
  role = calcReturn;
  showRole();
});

// ---------------------------------------------------------------------------
// HIGH-ALERT DRUG REFERENCE
// Source: Faculty of Medicine, Khon Kaen University (Srinagarind Hospital)
// high-alert injectable drug guidelines. Each row is transcribed from the
// linked PDF; verify against the current local protocol before use.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// One card renderer for every card-shaped reference (high-alert, RSI, ACLS,
// PALS, TBI). Renders whichever fields the data provides, in a fixed order:
//   head (name · strength · tag) → need → items[] → rows[] → sections[]
//   → dispo → source link
// Adding a new card-based reference needs data only — no new render code.
// ---------------------------------------------------------------------------
function renderCard(d) {
  const card = document.createElement("div");
  card.className = "ha-card" + (d.cls ? " " + d.cls : "");

  const head = document.createElement("div");
  head.className = "ha-head";
  const nm = document.createElement("span");
  nm.className = "ha-name";
  nm.textContent = d.name;
  head.appendChild(nm);
  if (d.strength) {
    const st = document.createElement("span");
    st.className = "ha-strength";
    st.textContent = d.strength;
    head.appendChild(st);
  }
  if (d.tag) {
    const tg = document.createElement("span");
    tg.className = "ha-tag";
    tg.textContent = d.tag;
    head.appendChild(tg);
  }
  card.appendChild(head);

  if (d.need) {
    const p = document.createElement("p");
    p.className = "ha-need";
    p.textContent = d.need;
    card.appendChild(p);
  }
  if (d.items) {
    const ul = document.createElement("ul");
    ul.className = "ha-list";
    d.items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it;
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }
  (d.rows || []).forEach(([k, v, warn]) => {
    const row = document.createElement("div");
    row.className = "ha-row" + (warn ? " warn" : "");
    const kk = document.createElement("span");
    kk.className = "k";
    kk.textContent = k;
    const vv = document.createElement("span");
    vv.className = "v";
    vv.textContent = v;
    row.append(kk, vv);
    card.appendChild(row);
  });
  (d.sections || []).forEach((sec) => {
    const lb = document.createElement("p");
    lb.className = "ha-need";
    lb.textContent = sec.label;
    card.appendChild(lb);
    const ul = document.createElement("ul");
    ul.className = "ha-list";
    sec.lines.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    card.appendChild(ul);
  });
  if (d.dispo) {
    const dp = document.createElement("div");
    dp.className = "ha-dispo";
    const ar = document.createElement("span");
    ar.className = "arrow";
    ar.textContent = "→ ";
    dp.appendChild(ar);
    dp.appendChild(document.createTextNode(d.dispo));
    card.appendChild(dp);
  }
  if (d.url) {
    const a = document.createElement("a");
    a.className = "ha-src";
    a.href = d.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "KKU guideline ↗";
    card.appendChild(a);
  }
  return card;
}

// Render an array of card specs into a container, once.
function renderInto(boxId, data) {
  const box = $(boxId);
  if (!box || box.childElementCount) return;
  data.forEach((d) => box.appendChild(renderCard(d)));
}

function renderHighAlert() { renderInto("ha-cards", HIGH_ALERT); }

// ---------------------------------------------------------------------------
// RSI drugs, Mild TBI risk stratification, Paediatric vitals — reference cards
// General ED references (not drug-specific KKU docs). Verify locally.
// ---------------------------------------------------------------------------



function renderRSI() { renderInto("rsi-cards", RSI_DRUGS); }
function renderTBI() { renderInto("tbi-cards", TBI_GROUPS); }
function renderPecarn() { renderInto("pecarn-cards", PECARN); }

// Build a titled, horizontally-scrollable reference table from {title, cols, rows}.
function buildRefTable(spec) {
  const container = document.createElement("div");
  container.className = "ref-block";
  if (spec.title) {
    const h = document.createElement("h4");
    h.className = "pd-h";
    h.textContent = spec.title;
    container.appendChild(h);
  }
  const wrap = document.createElement("div");
  wrap.className = "ref-table-wrap";
  const table = document.createElement("table");
  table.className = "ref-table";
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  spec.cols.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    htr.appendChild(th);
  });
  thead.appendChild(htr);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  spec.rows.forEach((r) => {
    const tr = document.createElement("tr");
    r.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
  return container;
}

function renderPeds() {
  const box = $("peds-table");
  if (!box || box.childElementCount) return;
  PEDS_VITALS.tables.forEach((t) => box.appendChild(buildRefTable(t)));
  const foot = document.createElement("p");
  foot.className = "hint";
  foot.textContent = PEDS_VITALS.foot;
  box.appendChild(foot);
}

// Weight / height / tube-size by age, computed from the Survival-Guide formulae.
function renderPedsByAge() {
  const box = $("pedage-table");
  if (!box || box.childElementCount) return;
  const ages = [
    { lbl: "3 mo", m: 3 }, { lbl: "6 mo", m: 6 }, { lbl: "9 mo", m: 9 },
    { lbl: "1 yr", y: 1 }, { lbl: "2 yr", y: 2 }, { lbl: "3 yr", y: 3 }, { lbl: "4 yr", y: 4 },
    { lbl: "5 yr", y: 5 }, { lbl: "6 yr", y: 6 }, { lbl: "7 yr", y: 7 }, { lbl: "8 yr", y: 8 },
    { lbl: "9 yr", y: 9 }, { lbl: "10 yr", y: 10 }, { lbl: "11 yr", y: 11 }, { lbl: "12 yr", y: 12 },
  ];
  const r1 = (v) => parseFloat(v.toFixed(1)).toString();
  const half = (v) => (Math.round(v * 2) / 2).toString();
  const ibw = (a) =>
    a.m !== undefined ? r1((a.m + 9) / 2) : a.y <= 6 ? r1(2 * a.y + 8) : r1((7 * a.y - 5) / 2);
  const rows = ages.map((a) => {
    const infant = a.m !== undefined || a.y < 2;
    const height = a.m !== undefined ? "—" : a.y === 1 ? "75" : String(a.y * 6 + 77);
    const uncuff = a.m !== undefined ? "3.5-4.0" : a.y < 2 ? "4.0" : half(a.y / 4 + 4);
    const cuff = a.m !== undefined ? "3.0-3.5" : a.y < 2 ? "3.5" : half(a.y / 4 + 3.5);
    const depth = infant ? "—" : r1(a.y / 2 + 12);
    return [a.lbl, ibw(a), height, uncuff, cuff, depth];
  });
  box.appendChild(buildRefTable({
    title: "Weight, height & tube size by age",
    cols: ["Age", "IBW (kg)", "Height (cm)", "ETT uncuff (mm)", "ETT cuff (mm)", "Depth (cm)"],
    rows,
  }));
  const foot = document.createElement("p");
  foot.className = "hint";
  foot.textContent =
    "IBW: 3-12 mo (age+9)/2 · 1-6 yr 2×age+8 · 7-12 yr (7×age−5)/2. Height P50 (≥2 yr): age×6+77. " +
    "ETT: uncuffed age/4+4, cuffed age/4+3.5, depth age/2+12 (formulae for ≥2 yr).";
  box.appendChild(foot);
}

// ---------------------------------------------------------------------------
// Resuscitation quick reference — ACLS (adult) and PALS (paediatric)
// Transcribed clinical content (doses, energies, steps) based on the
// AHA / AAP 2025 Guidelines. Quick reference only — not the full algorithm.
// ---------------------------------------------------------------------------


// Build an HTML/CSS flowchart from a node list (offline-safe, no libraries).
// Node types: start · action · decision(branch) · shock · drug · loop · end.
function buildFlow(nodes) {
  const flow = document.createElement("div");
  flow.className = "flow";
  nodes.forEach((n, i) => {
    if (i > 0) {
      const arrow = document.createElement("div");
      arrow.className = "flow-arrow";
      arrow.textContent = "▼";
      flow.appendChild(arrow);
    }
    if (n.type === "branch") {
      const q = document.createElement("div");
      q.className = "flow-node flow-decision";
      q.textContent = n.question;
      flow.appendChild(q);
      const a2 = document.createElement("div");
      a2.className = "flow-arrow";
      a2.textContent = "▼";
      flow.appendChild(a2);
      const branches = document.createElement("div");
      branches.className = "flow-branches";
      n.branches.forEach((b) => {
        const col = document.createElement("div");
        col.className = "flow-branch";
        const lab = document.createElement("div");
        lab.className = "flow-branch-label";
        lab.textContent = b.label;
        col.appendChild(lab);
        col.appendChild(buildFlow(b.nodes));
        branches.appendChild(col);
      });
      flow.appendChild(branches);
    } else {
      const box = document.createElement("div");
      box.className = "flow-node flow-" + n.type;
      box.textContent = n.text;
      flow.appendChild(box);
    }
  });
  return flow;
}

function renderFlowInto(boxId, nodes) {
  const box = $(boxId);
  if (!box || box.childElementCount) return;
  box.appendChild(buildFlow(nodes));
}

function renderCodesA() {
  renderFlowInto("codesA-flow", ARREST_ADULT_FLOW);
  renderInto("codesA-cards", CODES_ADULT);
}
function renderCodesP() {
  renderFlowInto("codesP-flow", ARREST_PEDS_FLOW);
  renderInto("codesP-cards", CODES_PEDS);
}

// ---------------------------------------------------------------------------
// COMMON PAEDIATRIC DRUG DOSES
// Curated from the Srinagarind / KKU "common paediatric drug doses" handbook.
// mkDose = mg/kg/dose · mkDay = mg/kg/day. Doses transcribed where legible;
// ambiguous rows omitted. Verify every dose/max for the individual child.
// ---------------------------------------------------------------------------

function renderPedsDrugs() {
  const list = $("pd-list");
  if (!list || list.childElementCount) return;

  // Category filter chips (All + one per category).
  const filter = $("pd-filter");
  const cats = ["All", ...PEDS_DRUGS.map((c) => c.cat)];
  cats.forEach((cat, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (i === 0 ? " active" : "");
    chip.textContent = cat;
    chip.addEventListener("click", () => {
      filter.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      list.querySelectorAll(".pd-cat").forEach((b) =>
        b.classList.toggle("hidden", cat !== "All" && b.dataset.cat !== cat)
      );
    });
    filter.appendChild(chip);
  });

  PEDS_DRUGS.forEach((c) => {
    const block = document.createElement("div");
    block.className = "pd-cat";
    block.dataset.cat = c.cat;
    const h = document.createElement("h4");
    h.className = "pd-h";
    h.textContent = c.cat;
    block.appendChild(h);
    c.drugs.forEach((d) => {
      const it = document.createElement("div");
      it.className = "pd-item";
      const n = document.createElement("div");
      n.className = "pd-name";
      n.textContent = d.n;
      const ds = document.createElement("div");
      ds.className = "pd-dose";
      ds.textContent = d.d;
      const p = document.createElement("div");
      p.className = "pd-prep";
      p.textContent = d.p;
      it.append(n, ds, p);
      block.appendChild(it);
    });
    list.appendChild(block);
  });
}

function renderElyte() { renderInto("elyte-cards", ELYTE_CORRECTION); }

// ---------------------------------------------------------------------------
// Paediatric weight-based resuscitation doses + maintenance fluids.
// One weight in → the critical code doses and fluids out. Estimates only.
// ---------------------------------------------------------------------------
function pbwClamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
function pbwNum(v) {
  if (!isFinite(v)) return "—";
  const dp = v < 1 ? 3 : v < 10 ? 2 : v < 100 ? 1 : 0;
  return parseFloat(v.toFixed(dp)).toString();
}
function pbwMaintHr(w) {
  return w <= 10 ? 4 * w : w <= 20 ? 40 + 2 * (w - 10) : 60 + (w - 20); // 4-2-1 rule
}
function pbwMaintDay(w) {
  return w <= 10 ? 100 * w : w <= 20 ? 1000 + 50 * (w - 10) : 1500 + 20 * (w - 20); // 100-50-20
}
function recomputePBW() {
  const out = $("pbw-out");
  if (!out) return;
  const w = parseFloat($("pbw-weight").value);
  out.innerHTML = "";
  if (!(w > 0)) return;
  const im = pbwClamp(0.01 * w, 0, 0.5);
  const groups = [
    ["Resuscitation", [
      ["Adrenaline (arrest)", pbwNum(0.01 * w) + " mg IV/IO = " + pbwNum(0.1 * w) + " mL of 1:10,000 · q3-5 min"],
      ["Adrenaline (anaphylaxis IM)", pbwNum(im) + " mg = " + pbwNum(im) + " mL of 1:1000 (max 0.3 child / 0.5 adol)"],
      ["Atropine", pbwNum(pbwClamp(0.02 * w, 0.1, 0.5)) + " mg (0.02 mg/kg; min 0.1, max 0.5)"],
      ["Amiodarone (arrest)", pbwNum(Math.min(5 * w, 300)) + " mg (5 mg/kg, max 300)"],
      ["Adenosine (SVT)", pbwNum(Math.min(0.1 * w, 6)) + " mg then " + pbwNum(Math.min(0.2 * w, 12)) + " mg (max 6 / 12)"],
      ["Defibrillation", pbwNum(2 * w) + " J (2 J/kg) → " + pbwNum(4 * w) + " J (4 J/kg)"],
      ["Sync cardioversion", pbwNum(0.5 * w) + "-" + pbwNum(1 * w) + " J → " + pbwNum(2 * w) + " J"],
    ]],
    ["Fluids & glucose", [
      ["Fluid bolus", pbwNum(20 * w) + " mL (20 mL/kg; 10 mL/kg if neonate/trauma/DKA/cardiac)"],
      ["Dextrose", pbwNum(5 * w) + " mL D10W (0.5 g/kg) or " + pbwNum(2 * w) + " mL D25W"],
      ["Maintenance (4-2-1)", pbwNum(pbwMaintHr(w)) + " mL/hr ≈ " + pbwNum(pbwMaintDay(w)) + " mL/day"],
    ]],
  ];
  groups.forEach(([label, rows]) => {
    const lb = document.createElement("p");
    lb.className = "ha-need";
    lb.textContent = label;
    out.appendChild(lb);
    rows.forEach(([k, v]) => {
      const row = document.createElement("div");
      row.className = "ha-row";
      const kk = document.createElement("span");
      kk.className = "k";
      kk.textContent = k;
      const vv = document.createElement("span");
      vv.className = "v";
      vv.textContent = v;
      row.append(kk, vv);
      out.appendChild(row);
    });
  });
}
$("pbw-weight").addEventListener("input", recomputePBW);

// ---------------------------------------------------------------------------
// Review status — mark each reference section as you check it. Three states:
// Needs review → Reviewed → Validated w/ ref. Editable by tapping the badge;
// saved per-device in localStorage (survives reloads, no login needed).
// ---------------------------------------------------------------------------
const REVIEW_STATES = [
  { key: "need-review", label: "⚠ Needs review", cls: "rev-need" },
  { key: "reviewed", label: "✓ Reviewed", cls: "rev-done" },
  { key: "validated", label: "✔ Validated w/ ref", cls: "rev-valid" },
];
let refReview = {};
try { refReview = JSON.parse(localStorage.getItem("edqc_refreview") || "{}"); } catch {}
const getRev = (key) => refReview[key] || "need-review";
function revMeta(status) { return REVIEW_STATES.find((s) => s.key === status) || REVIEW_STATES[0]; }
function applyRevBadge(el, key) {
  const m = revMeta(getRev(key));
  el.className = "rev-badge " + m.cls;
  el.textContent = m.label;
  el.title = "Review status — tap to change";
}
function updateRevBadges(key) {
  document.querySelectorAll('.rev-badge[data-rev-key="' + key + '"]').forEach((el) => applyRevBadge(el, key));
}
function cycleRev(key) {
  const order = REVIEW_STATES.map((s) => s.key);
  refReview[key] = order[(order.indexOf(getRev(key)) + 1) % order.length];
  try { localStorage.setItem("edqc_refreview", JSON.stringify(refReview)); } catch {}
  updateRevBadges(key);
}
function makeRevBadge(key) {
  const el = document.createElement("span");
  el.dataset.revKey = key;
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  applyRevBadge(el, key);
  el.addEventListener("click", (e) => { e.stopPropagation(); cycleRev(key); });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); cycleRev(key); }
  });
  return el;
}

// ---------------------------------------------------------------------------
// Custom content — user's own note cards (editable bullets) and images (JPG)
// appended to any reference section. Saved per-device in localStorage; images
// are downscaled to keep within the storage quota. No login, works offline.
// ---------------------------------------------------------------------------
let refCustom = {};
try { refCustom = JSON.parse(localStorage.getItem("edqc_refcustom") || "{}"); } catch {}
function customList(key) { return refCustom[key] || (refCustom[key] = []); }
function saveCustom() {
  try {
    localStorage.setItem("edqc_refcustom", JSON.stringify(refCustom));
  } catch {
    alert("Couldn't save — device storage is full. Delete an old note/image or use a smaller picture.");
  }
}
const newId = () => "c" + Date.now() + Math.random().toString(36).slice(2, 6);

// Read a picked image file, downscale to <=1400 px, return a JPEG data URL.
function readAndCompressImage(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => alert("Could not read that image.");
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function buildCustomCard(key, item) {
  const card = document.createElement("div");
  card.className = "ha-card custom-card";
  const head = document.createElement("div");
  head.className = "ha-head";
  const nm = document.createElement("span");
  nm.className = "ha-name";
  nm.textContent = item.title || (item.kind === "image" ? "Image" : "Note");
  const tag = document.createElement("span");
  tag.className = "ha-tag";
  tag.textContent = "mine";
  head.append(nm, tag);
  card.appendChild(head);

  if (item.kind === "image" && item.img) {
    const img = document.createElement("img");
    img.className = "custom-img";
    img.src = item.img;
    img.alt = item.title || "reference image";
    card.appendChild(img);
  } else {
    const ul = document.createElement("ul");
    ul.className = "ha-list";
    (item.lines || []).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }

  const actions = document.createElement("div");
  actions.className = "custom-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "chip mini";
  edit.textContent = "✎ Edit";
  edit.addEventListener("click", () => openEditor(key, item));
  const del = document.createElement("button");
  del.type = "button";
  del.className = "chip mini";
  del.textContent = "✕ Delete";
  del.addEventListener("click", () => {
    if (!confirm("Delete this " + (item.kind === "image" ? "image" : "note") + "?")) return;
    refCustom[key] = customList(key).filter((x) => x.id !== item.id);
    saveCustom();
    renderCustomArea(key);
  });
  actions.append(edit, del);
  card.appendChild(actions);
  return card;
}

// Inline editor for a note (new or existing) or an image title.
function openEditor(key, item) {
  const area = $("calc-" + key).querySelector(".custom-area");
  const old = area.querySelector(".custom-editor");
  if (old) old.remove();
  const isImage = item && item.kind === "image";
  const form = document.createElement("div");
  form.className = "custom-editor";
  const titleIn = document.createElement("input");
  titleIn.type = "text";
  titleIn.placeholder = "Title (optional)";
  titleIn.value = item ? item.title || "" : "";
  form.appendChild(titleIn);
  let ta = null;
  if (!isImage) {
    ta = document.createElement("textarea");
    ta.rows = 5;
    ta.placeholder = "One bullet per line…";
    ta.value = item ? (item.lines || []).join("\n") : "";
    form.appendChild(ta);
  }
  const save = document.createElement("button");
  save.type = "button";
  save.className = "chip";
  save.textContent = item ? "Save changes" : "Add note";
  save.addEventListener("click", () => {
    const title = titleIn.value.trim();
    const lines = ta ? ta.value.split("\n").map((s) => s.trim()).filter(Boolean) : null;
    if (item) {
      item.title = title;
      if (ta) item.lines = lines;
    } else {
      if (!title && !(lines && lines.length)) { form.remove(); return; }
      customList(key).push({ id: newId(), kind: "note", title, lines: lines || [] });
    }
    saveCustom();
    renderCustomArea(key);
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "chip mini";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => form.remove());
  form.append(save, cancel);
  area.appendChild(form);
  titleIn.focus();
}

function pickImage(key) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    readAndCompressImage(file, (dataUrl) => {
      customList(key).push({ id: newId(), kind: "image", title: file.name.replace(/\.[^.]+$/, ""), img: dataUrl });
      saveCustom();
      renderCustomArea(key);
    });
  });
  input.click();
}

// (Re)build the "My notes & images" area at the bottom of a section pane.
function renderCustomArea(key) {
  const pane = $("calc-" + key);
  if (!pane) return;
  const existing = pane.querySelector(".custom-area");
  if (existing) existing.remove();
  const area = document.createElement("div");
  area.className = "custom-area";
  const h = document.createElement("h4");
  h.className = "pd-h";
  h.textContent = "My notes & images (this device)";
  area.appendChild(h);
  customList(key).forEach((item) => area.appendChild(buildCustomCard(key, item)));
  const bar = document.createElement("div");
  bar.className = "custom-bar";
  const addNote = document.createElement("button");
  addNote.type = "button";
  addNote.className = "chip";
  addNote.textContent = "＋ Note";
  addNote.addEventListener("click", () => openEditor(key, null));
  const addImg = document.createElement("button");
  addImg.type = "button";
  addImg.className = "chip";
  addImg.textContent = "＋ Image (JPG)";
  addImg.addEventListener("click", () => pickImage(key));
  bar.append(addNote, addImg);
  area.appendChild(bar);
  pane.appendChild(area);
}

// ---------------------------------------------------------------------------
// Reference navigation: a section menu (table of contents) + section views.
// Adding a new reference = add a pane in index.html + one entry here.
// ---------------------------------------------------------------------------
const SECTIONS = [
  // group: "Adult" | "Paediatric" | "General & drugs"
  { key: "codesA", em: "🫀", title: "Adult codes", desc: "ACLS: arrest · brady · tachy · cardioversion", group: "Adult", lazy: renderCodesA },
  { key: "tbi", em: "🧠", title: "Adult mild TBI", desc: "Thai CPG risk stratification", group: "Adult", lazy: renderTBI },
  { key: "codesP", em: "👶", title: "Peds codes", desc: "PALS: arrest · brady · tachy", group: "Paediatric", lazy: renderCodesP },
  { key: "pbw", em: "⚖️", title: "Peds by weight", desc: "Resus doses & fluids from weight", group: "Paediatric", lazy: recomputePBW },
  { key: "pecarn", em: "🧠", title: "Ped head trauma", desc: "PECARN CT decision rule", group: "Paediatric", lazy: renderPecarn },
  { key: "pdrugs", em: "🍼", title: "Peds drug doses", desc: "Common paediatric drugs (weight-based)", group: "Paediatric", lazy: renderPedsDrugs },
  { key: "peds", em: "📏", title: "Peds vital signs", desc: "HR · RR · SBP · ETT by age", group: "Paediatric", lazy: renderPeds },
  { key: "pedage", em: "📐", title: "Peds by age", desc: "IBW · height · tube size by age", group: "Paediatric", lazy: renderPedsByAge },
  { key: "pressor", em: "💉", title: "Drip calculator", desc: "Inotrope / vasopressor rate ⇄ dose", group: "General & drugs" },
  { key: "highalert", em: "⚠️", title: "High-alert drugs", desc: "KKU injectable guidelines", group: "General & drugs", lazy: renderHighAlert },
  { key: "rsi", em: "💊", title: "RSI drugs", desc: "Induction & paralytics, doses", group: "General & drugs", lazy: renderRSI },
  { key: "elyte", em: "🧂", title: "Electrolyte correction", desc: "K / Ca / Mg / Na / glucose dosing", group: "General & drugs", lazy: renderElyte },
];
const SECTION_GROUPS = ["Adult", "Paediatric", "General & drugs"];

function showCalcSection(key) {
  const sec = SECTIONS.find((s) => s.key === key);
  if (!sec) return;
  $("calc-search").classList.add("hidden");
  $("calc-results").classList.add("hidden");
  $("calc-home").classList.add("hidden");
  $("calc-secbar").classList.remove("hidden");
  $("calc-sec-title").textContent = sec.em + " " + sec.title;
  const st = $("calc-sec-status");
  st.innerHTML = "";
  st.appendChild(makeRevBadge(key));
  SECTIONS.forEach((s) => $("calc-" + s.key).classList.toggle("hidden", s.key !== key));
  if (sec.lazy) sec.lazy();
  renderCustomArea(key);
  document.querySelector(".bedside-body").scrollTop = 0;
}

function showCalcHome() {
  $("calc-secbar").classList.add("hidden");
  SECTIONS.forEach((s) => $("calc-" + s.key).classList.add("hidden"));
  $("calc-search").value = "";
  $("calc-search").classList.remove("hidden");
  $("calc-results").classList.add("hidden");
  $("calc-home").classList.remove("hidden");
}

// --- Reference search: index all datasets, jump to the owning section --------
let searchIndex = null;
function buildSearchIndex() {
  const idx = [];
  const add = (label, hay, section, sub) =>
    idx.push({ label, section, sub, hay: (label + " " + (hay || "")).toLowerCase() });
  const rowsText = (rows) => (rows || []).map((r) => r.join(" ")).join(" ");
  const secText = (secs) => (secs || []).map((s) => s.label + " " + s.lines.join(" ")).join(" ");
  PRESSORS.forEach((d) => add(d.name, d.note, "pressor", "Drip calculator"));
  HIGH_ALERT.forEach((d) => add(d.name, d.strength + " " + d.tag + " " + rowsText(d.rows), "highalert", "High-alert drug"));
  CODES_ADULT.forEach((d) => add(d.name, "adult ACLS " + secText(d.sections), "codesA", "Adult codes (ACLS)"));
  CODES_PEDS.forEach((d) => add(d.name, "peds PALS " + secText(d.sections), "codesP", "Peds codes (PALS)"));
  RSI_DRUGS.forEach((d) => add(d.name, d.tag + " " + rowsText(d.rows), "rsi", "RSI drug"));
  PEDS_DRUGS.forEach((c) => c.drugs.forEach((dr) => add(dr.n, c.cat + " " + dr.d, "pdrugs", "Peds drug — " + c.cat)));
  TBI_GROUPS.forEach((g) => add(g.name, g.need + " " + (g.items || []).join(" "), "tbi", "Adult mild TBI"));
  add("Ped head trauma (PECARN)", "PECARN paediatric head injury CT decision rule ci-TBI basilar skull fracture GCS mechanism scalp haematoma", "pecarn", "Ped head trauma (PECARN)");
  ELYTE_CORRECTION.forEach((d) => add(d.name, d.tag + " " + rowsText(d.rows) + " " + secText(d.sections), "elyte", "Electrolyte correction"));
  add("Paediatric vital signs", PEDS_VITALS.tables.map((t) => t.rows.map((r) => r.join(" ")).join(" ")).join(" "), "peds", "Peds vital signs");
  add("Weight & tube size by age", "IBW ideal body weight height ETT endotracheal tube cuffed uncuffed depth by age", "pedage", "Peds by age");
  add("Peds resus by weight", "adrenaline atropine amiodarone adenosine defibrillation cardioversion fluid bolus dextrose maintenance 4-2-1", "pbw", "Peds by weight");
  return idx;
}

function runSearch(q) {
  const query = q.trim().toLowerCase();
  const results = $("calc-results");
  if (!query) {
    results.classList.add("hidden");
    results.innerHTML = "";
    $("calc-home").classList.remove("hidden");
    return;
  }
  if (!searchIndex) searchIndex = buildSearchIndex();
  $("calc-home").classList.add("hidden");
  results.innerHTML = "";
  const matches = searchIndex.filter((e) => e.hay.includes(query)).slice(0, 40);
  if (!matches.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No matches for “" + q.trim() + "”.";
    results.appendChild(p);
  } else {
    matches.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calc-result";
      const lab = document.createElement("span");
      lab.className = "cr-label";
      lab.textContent = m.label;
      const sub = document.createElement("span");
      sub.className = "cr-sub";
      sub.textContent = m.sub;
      btn.append(lab, sub);
      btn.addEventListener("click", () => showCalcSection(m.section));
      results.appendChild(btn);
    });
  }
  results.classList.remove("hidden");
}
$("calc-search").addEventListener("input", (e) => runSearch(e.target.value));

// Build the menu tiles once, grouped (Adult / Paediatric / General & drugs).
(function buildCalcMenu() {
  const home = $("calc-home");
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Tap a review badge to cycle ⚠ Needs review → ✓ Reviewed → ✔ Validated (saved on this device).";
  home.appendChild(hint);
  SECTION_GROUPS.forEach((group) => {
    const secs = SECTIONS.filter((s) => s.group === group);
    if (!secs.length) return;
    const h = document.createElement("h4");
    h.className = "menu-group-h";
    h.textContent = group;
    home.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "calc-menu";
    secs.forEach((s) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "calc-tile";
      const em = document.createElement("span");
      em.className = "em";
      em.textContent = s.em;
      const ti = document.createElement("span");
      ti.className = "ti";
      ti.textContent = s.title;
      const de = document.createElement("span");
      de.className = "de";
      de.textContent = s.desc;
      tile.append(em, ti, de, makeRevBadge(s.key));
      tile.addEventListener("click", () => showCalcSection(s.key));
      grid.appendChild(tile);
    });
    home.appendChild(grid);
  });
})();
$("calc-menu-back").addEventListener("click", showCalcHome);
