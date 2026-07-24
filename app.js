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
const patientPicker = $("patient-picker");
const fBed = $("f-bed");
const fComplaint = $("f-complaint");
const fHistory = $("f-history");
const fExam = $("f-exam");
const fBedside = $("f-bedside");
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
  const active = activeSorted();
  const prev = patientPicker.value;
  patientPicker.innerHTML = '<option value="">➕ New patient…</option>';
  active.forEach(([id, e]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = (e.bed || "(no bed)") + (e.complaint ? " — " + truncate(e.complaint, 24) : "");
    patientPicker.appendChild(opt);
  });
  patientPicker.value = currentEncounterId && encounters[currentEncounterId] ? currentEncounterId : prev;
}

patientPicker.addEventListener("change", () => {
  const id = patientPicker.value;
  if (!id) {
    clearForm();
    return;
  }
  loadIntoForm(id);
});

function loadIntoForm(id) {
  const e = encounters[id];
  if (!e) return;
  currentEncounterId = id;
  fBed.value = e.bed || "";
  fComplaint.value = e.complaint || "";
  fHistory.value = e.history || "";
  fExam.value = e.exam || "";
  fBedside.value = e.bedside || "";
  sentNote.textContent = "loaded";
}

function clearForm() {
  currentEncounterId = null;
  fBed.value = "";
  fComplaint.value = "";
  fHistory.value = "";
  fExam.value = "";
  fBedside.value = "";
  sentNote.textContent = "";
  patientPicker.value = "";
  fBed.focus();
}

newBtn.addEventListener("click", clearForm);

sendBtn.addEventListener("click", async () => {
  const bed = fBed.value.trim();
  if (!bed) {
    setStatus(bedsideStatus, "Bed / identifier is required.", "error");
    fBed.focus();
    return;
  }
  if (!uid) return;

  const payload = {
    bed,
    complaint: fComplaint.value.trim(),
    history: fHistory.value.trim(),
    exam: fExam.value.trim(),
    bedside: fBedside.value.trim(),
    by: clinician,
    status: "active",
    updatedAt: serverTimestamp(),
  };

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
  if (e.exam) parts.push("\nPHYSICAL EXAM:\n" + e.exam);
  if (e.bedside) parts.push("\nBEDSIDE TESTS:\n" + e.bedside);
  parts.push("\n— Entered by " + (e.by || "unknown") + " · " + fullTime(e.updatedAt));
  return parts.join("\n");
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
