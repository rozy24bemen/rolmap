// UI y orquestación del MVP
import { APP_ID, DEFAULT_GAME_STATE } from "./config.js";
import { initFirebase, signInAnon, getUser, readGameState, seedInitialState, writeGameState, subscribeGameState, resetGameState } from "./firebase.js";
import { sendToLLM } from "./llm.js";
import { validateProposal, applyProposal, advanceTurn } from "./game.js";

const el = {
  statusPanel: document.getElementById("status-panel"),
  statusBadges: document.getElementById("status-badges"),
  chatWindow: document.getElementById("chat-window"),
  chatInput: document.getElementById("chat-input"),
  sendBtn: document.getElementById("send-btn"),
  advanceTurnBtn: document.getElementById("advance-turn-btn"),
  proposalPanel: document.getElementById("proposal-panel"),
  resetBtn: document.getElementById("reset-state-btn"),
  copyPathBtn: document.getElementById("copy-doc-path-btn"),
};

let userId = null;
let currentState = { ...DEFAULT_GAME_STATE };
let proposalPending = null;
const chat = [];
let debugBadgeHtml = "";
let stateDocPath = "";

function renderStatus(state) {
  const cityLabel = (c) => ({ A: "Ciudad A (Capital)", B: "Ciudad B", C: "Ciudad C" }[c] || c);
  el.statusPanel.innerHTML = `
    <div class="rounded-md border border-slate-700 bg-slate-800/70 p-3"><div class="text-slate-400 text-xs">Turno</div><div class="text-xl font-semibold">${state.turn}</div></div>
    <div class="rounded-md border border-slate-700 bg-slate-800/70 p-3"><div class="text-slate-400 text-xs">Oro</div><div class="text-xl font-semibold">${state.gold}</div></div>
    <div class="rounded-md border border-slate-700 bg-slate-800/70 p-3"><div class="text-slate-400 text-xs">Tropas</div><div class="text-xl font-semibold">${state.troops}</div></div>
    <div class="rounded-md border border-slate-700 bg-slate-800/70 p-3"><div class="text-slate-400 text-xs">Ciudad Actual</div><div class="text-xl font-semibold">${cityLabel(state.current_city)}</div></div>
  `;

  const expedition = state.expedition_status
    ? `<span class="px-2 py-1 rounded bg-amber-500/20 border border-amber-600 text-amber-200">Expedición en curso: a ${state.expedition_status.targetCity}, fin T${state.expedition_status.end_turn}</span>`
    : `<span class="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-600 text-emerald-200">Sin expedición</span>`;

  const lastEvent = state._last_event
    ? `<span class="px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200">Evento: ${state._last_event}</span>`
    : "";

  el.statusBadges.innerHTML = `${expedition} ${lastEvent} ${debugBadgeHtml}`;
}

function addChat(role, text) {
  chat.push({ role, text });
  const item = document.createElement("div");
  item.className = role === "user" ? "text-right" : "text-left";
  item.innerHTML = `
    <div class="inline-block max-w-[90%] rounded-lg px-3 py-2 ${
      role === "user"
        ? "bg-indigo-600/90 border border-indigo-500"
        : "bg-slate-700/70 border border-slate-600"
    }">${text.replace(/\n/g, "<br>")}</div>
  `;
  el.chatWindow.appendChild(item);
  el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
}

function showProposal(proposal, narrative) {
  if (!proposal) {
    el.proposalPanel.classList.add("hidden");
    el.proposalPanel.innerHTML = "";
    return;
  }
  el.proposalPanel.classList.remove("hidden");
  el.proposalPanel.innerHTML = `
    <div class="mb-2 text-sm text-amber-200">${narrative}</div>
    <pre class="text-xs bg-slate-900/60 p-2 rounded border border-slate-700">${JSON.stringify(proposal, null, 2)}</pre>
    <div class="mt-2 flex gap-2">
      <button id="accept-proposal" class="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1">Aceptar</button>
      <button id="reject-proposal" class="rounded bg-slate-600 hover:bg-slate-500 px-3 py-1">Rechazar</button>
    </div>
  `;

  document.getElementById("accept-proposal").onclick = onAcceptProposal;
  document.getElementById("reject-proposal").onclick = onRejectProposal;
}

async function onAcceptProposal() {
  if (!proposalPending) return;
  const check = validateProposal(currentState, proposalPending.proposal);
  if (!check.ok) {
    addChat("assistant", `No puedo ejecutar la orden: ${check.reason}.`);
    proposalPending = null;
    showProposal(null);
    return;
  }
  const next = applyProposal(currentState, proposalPending.proposal);
  await writeGameState(userId, next);
  proposalPending = null;
  showProposal(null);
}

function onRejectProposal() {
  proposalPending = null;
  showProposal(null);
}

async function onSend() {
  const text = el.chatInput.value.trim();
  if (!text) return;
  el.chatInput.value = "";
  addChat("user", text);

  const { narrative, proposal } = await sendToLLM(currentState, text);
  addChat("assistant", narrative || "");

  if (proposal) {
    proposalPending = { proposal, narrative };
    showProposal(proposal, narrative);
  } else {
    proposalPending = null;
    showProposal(null);
  }
}

async function onAdvanceTurn() {
  const next = advanceTurn(currentState);
  await writeGameState(userId, next);
}

async function onResetState() {
  await resetGameState(userId);
  addChat("assistant", "Estado reiniciado a los valores por defecto.");
}

async function onCopyDocPath() {
  try {
    await navigator.clipboard.writeText(stateDocPath);
    addChat("assistant", `Ruta copiada al portapapeles: ${stateDocPath}`);
  } catch (e) {
    addChat("assistant", `No se pudo copiar. Ruta: ${stateDocPath}`);
  }
}

function wireEvents() {
  el.sendBtn.onclick = onSend;
  el.chatInput.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) onSend();
  };
  el.advanceTurnBtn.onclick = onAdvanceTurn;
  if (el.resetBtn) el.resetBtn.onclick = onResetState;
  if (el.copyPathBtn) el.copyPathBtn.onclick = onCopyDocPath;
}

async function bootstrap() {
  await initFirebase();
  await signInAnon();
  const u = getUser();
  userId = u?.uid;
  stateDocPath = `artifacts/rol-mvp/users/${userId}/game_state/state`;
  debugBadgeHtml = userId
    ? `<span class=\"px-2 py-1 rounded bg-sky-500/20 border border-sky-600 text-sky-200\">UID: ${userId.slice(0,8)}…</span>`
    : "";

  // Lee estado inicial o si no existe, lo crea
  const state = await readGameState(userId);
  if (!state) await seedInitialState(userId);

  // Suscripción a cambios en tiempo real
  subscribeGameState(userId, (st) => {
    currentState = st;
    renderStatus(st);
  });

  // Mensaje de bienvenida
  addChat(
    "assistant",
    "Mi Señor, estoy a su servicio. Puede ordenarme: 'Mover 300 tropas a C'."
  );

  wireEvents();
}

bootstrap().catch((err) => {
  console.error(err);
  addChat("assistant", `No se pudo iniciar el juego: ${err?.message || err}`);
});
