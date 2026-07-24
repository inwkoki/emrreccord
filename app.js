// Realtime Chat — Firebase Realtime Database + Anonymous Auth
// Uses Firebase modular SDK loaded from the official CDN (ES modules).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  query,
  limitToLast,
  onChildAdded,
  onValue,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const usernameInput = document.getElementById("username-input");
const loginStatus = document.getElementById("login-status");
const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const meLabel = document.getElementById("me-label");
const connDot = document.getElementById("conn-dot");
const leaveBtn = document.getElementById("leave-btn");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let username = localStorage.getItem("chat_username") || "";
let uid = null;
let messagesRef = null;

// ---------------------------------------------------------------------------
// Guard against unconfigured Firebase
// ---------------------------------------------------------------------------
if (
  firebaseConfig.apiKey.startsWith("REPLACE_ME") ||
  firebaseConfig.databaseURL.startsWith("REPLACE_ME")
) {
  showLoginError(
    "Firebase is not configured yet. Fill in firebase-config.js with your project's web config."
  );
  usernameInput.disabled = true;
  loginForm.querySelector("button").disabled = true;
}

// ---------------------------------------------------------------------------
// Initialize Firebase
// ---------------------------------------------------------------------------
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
} catch (err) {
  console.error(err);
  showLoginError("Failed to initialize Firebase: " + err.message);
}

// Prefill saved username
if (username) usernameInput.value = username;

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (!name) return;
  username = name;
  localStorage.setItem("chat_username", username);

  setLoginStatus("Connecting…");
  loginForm.querySelector("button").disabled = true;

  try {
    await signInAnonymously(auth);
    // onAuthStateChanged handles the rest.
  } catch (err) {
    console.error(err);
    showLoginError("Sign-in failed: " + (err.code || err.message));
    loginForm.querySelector("button").disabled = false;
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    if (username) enterChat();
  } else {
    uid = null;
  }
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function enterChat() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  meLabel.textContent = "You: " + username;
  messageInput.focus();

  // Listen for connection state
  const connectedRef = ref(db, ".info/connected");
  onValue(connectedRef, (snap) => {
    connDot.classList.toggle("online", snap.val() === true);
  });

  // Subscribe to the last 100 messages, then live-append new ones.
  messagesRef = query(ref(db, "messages"), limitToLast(100));
  onChildAdded(messagesRef, (snap) => {
    renderMessage(snap.val());
  });
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !uid) return;

  messageInput.value = "";
  try {
    await push(ref(db, "messages"), {
      uid,
      name: username,
      text,
      ts: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    messageInput.value = text; // restore on failure
    alert("Could not send message: " + (err.code || err.message));
  }
});

leaveBtn.addEventListener("click", () => {
  location.reload();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderMessage(msg) {
  if (!msg) return;
  const wrap = document.createElement("div");
  const mine = msg.uid === uid;
  wrap.className = "msg " + (mine ? "me" : "other");

  // IRC-style single line:  [12:04] <name> text
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = "[" + formatTime(msg.ts) + "]";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = msg.name || "Anonymous";

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = msg.text; // textContent prevents HTML/script injection

  wrap.append(time, name, text);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setLoginStatus(text) {
  loginStatus.textContent = text;
  loginStatus.classList.remove("error");
}

function showLoginError(text) {
  loginStatus.textContent = text;
  loginStatus.classList.add("error");
}

// ---------------------------------------------------------------------------
// Purely-for-vibes retro visitor counter
// ---------------------------------------------------------------------------
(function visitorCounter() {
  const el = document.getElementById("visitor-count");
  if (!el) return;
  let n = parseInt(localStorage.getItem("visitor_count") || "1336", 10);
  n += 1;
  localStorage.setItem("visitor_count", String(n));
  el.textContent = String(n).padStart(6, "0");
})();
