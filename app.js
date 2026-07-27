// ED QuickCapture — Firebase Realtime Database + Anonymous Auth
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
let customChips = {
  ud: [], mgmt: [], abx: [], vaso: [], fluidtypes: [], neb: [],
  ex0: [], ex1: [], ex2: [], ex3: [], ex4: [], ex5: [], ex6: [], // exam-builder per-system options
};
let chipsSubscribed = false;
let customNormalPe = ""; // per-user editable "Normal" physical-exam text

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
  row.append(label, input, dl);
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
    chip.append(t, x);
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
const myTemplatesBar = document.getElementById("my-templates-bar");

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
  applyTemplateObj(t);
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
  const shareCb = document.getElementById("tpl-share");
  shareCb.checked = false;
  shareCb.disabled = false;
  document.getElementById("tpl-save-confirm").textContent = "Save template";
  document.getElementById("save-template-editor").classList.add("hidden");
  document.getElementById("macro-hint").classList.add("hidden");
}

document.getElementById("save-template").addEventListener("click", () => {
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
  myTemplatesBar.classList.toggle("editing");
});
function saveTemplate() {
  const name = document.getElementById("tpl-name").value.trim();
  if (!name) return;
  const fields = {};
  TEMPLATE_FIELDS.forEach((f) => {
    const v = (FIELD_MAP[f].value || "").trim();
    if (v) fields[f] = v;
  });
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
const DEFAULT_FLUIDS = ["NSS", "Acetar", "RLS", "DNSS", "D5W"];
const DEFAULT_NEB = ["Salbutamol (Ventolin)", "Ipratropium (Atrovent)", "Berodual"];

// Select-backed med lists: the user's custom (favourite) items come first,
// then the built-in defaults.
const MED_SELECTS = {
  vaso: { el: document.getElementById("vaso-drug"), defaults: DEFAULT_VASO },
  fluidtypes: { el: document.getElementById("load-fluid"), defaults: DEFAULT_FLUIDS },
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

// Antibiotic is a searchable input backed by a datalist.
function renderAbxList() {
  const dl = document.getElementById("abx-datalist");
  dl.innerHTML = "";
  (customChips.abx || []).concat(DEFAULT_ABX).forEach((name) => {
    const o = document.createElement("option");
    o.value = name;
    dl.appendChild(o);
  });
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
["vaso", "fluidtypes"].forEach(renderMedSelect);
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

// Vasopressor → append to management
document.getElementById("vaso-add").addEventListener("click", () => {
  const drug = document.getElementById("vaso-drug").value;
  const rate = document.getElementById("vaso-rate").value.trim();
  appendText(fManagement, "- Vasopressor: " + drug + (rate ? " " + rate : "") + " (started " + nowTime() + ")");
  document.getElementById("vaso-rate").value = "";
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
    chip.append(t, up, down, x);
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
    ["ud", "mgmt", "abx", "vaso", "fluidtypes", "neb",
     "ex0", "ex1", "ex2", "ex3", "ex4", "ex5", "ex6"].forEach((g) => {
      customChips[g] = v[g] ? Object.values(v[g]) : [];
      renderCustomChips(g);
    });
    [0, 1, 2, 3, 4, 5, 6].forEach(renderExamDatalist);
  });
  onValue(ref(db, "users/" + uid + "/normalPe"), (snap) => {
    customNormalPe = snap.val() || "";
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
