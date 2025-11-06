// Firebase inicialización (Web v11 ESM) y utilidades de Firestore
import { FIREBASE_CONFIG, APP_ID, DEFAULT_GAME_STATE } from "./config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let app = null;
let auth = null;
let db = null;
let currentUser = null;

export async function initFirebase() {
  if (!FIREBASE_CONFIG || FIREBASE_CONFIG.apiKey === "REEMPLAZAR") {
    console.warn("[MVP] Firebase no configurado aún. Rellena FIREBASE_CONFIG en src/config.js");
  }
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
}

export async function signInAnon() {
  if (!auth) throw new Error("Firebase Auth no inicializado");
  await signInAnonymously(auth);
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        resolve(user);
      }
    });
  });
}

export function getUser() {
  return currentUser;
}

function gameDocRef(userId) {
  // Usamos un documento único 'state' dentro de la subcolección 'game_state'
  return doc(db, "artifacts", APP_ID, "users", userId, "game_state", "state");
}

export async function readGameState(userId) {
  const ref = gameDocRef(userId);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  return null;
}

export async function writeGameState(userId, data) {
  const ref = gameDocRef(userId);
  await setDoc(ref, data, { merge: true });
}

export async function seedInitialState(userId) {
  const ref = gameDocRef(userId);
  await setDoc(ref, { ...DEFAULT_GAME_STATE }, { merge: false });
}

export async function resetGameState(userId) {
  // Sobrescribe completamente el documento con el estado por defecto
  const ref = gameDocRef(userId);
  await setDoc(ref, { ...DEFAULT_GAME_STATE }, { merge: false });
}

export function subscribeGameState(userId, cb) {
  const ref = gameDocRef(userId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) cb(snap.data());
  });
}
