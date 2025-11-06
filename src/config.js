// Configuración del MVP y reglas del juego

export const APP_ID = "rol-mvp";

// IMPORTANTE: Rellena con tu configuración de Firebase Web (proyecto propio)
// Puedes obtenerla desde la consola de Firebase > Configuración del proyecto > Tus apps (Web)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC5y1oSQ7FGOh02SnNdCSTGttRERbLD-xw",
  authDomain: "rolgame-589d7.firebaseapp.com",
  projectId: "rolgame-589d7",
  storageBucket: "rolgame-589d7.appspot.com",
  messagingSenderId: "891845244549",
  appId: "1:891845244549:web:b100c3fca3d905e3f69bec",
  measurementId: "G-2VZHL1ZMV8",
};

// Proveedor del LLM para el MVP: "mock" por defecto (sin dependencias externas)
// Para usar un proveedor real, configura provider: "openai-proxy" y un endpoint propio que proteja la API key del lado servidor.
export const LLM_PROVIDER = {
  provider: "mock", // "mock" | "openai-proxy"
  apiUrl: "", // e.g., "/api/llm" en tu propio backend/proxy
  apiKey: "", // NO PONGAS claves reales en el front. Usa un proxy.
  model: "gpt-4o-mini", // usado por el proxy si aplica
};

// Reglas del juego (Datos duros del MVP)
// Costo: mover 100 tropas por 100km cuesta 100 de Oro.
// Duración: 100km tardan 1 año (redondeo hacia arriba).
export const GAME_RULES = {
  costPer100TroopsPer100Km: 100,
  yearsPer100Km: 1,
  distancesKm: {
    A_B: 100,
    A_C: 300,
    B_C: 200,
  },
  validCities: ["A", "B", "C"],
};

export const DEFAULT_GAME_STATE = {
  turn: 1,
  gold: 2000,
  troops: 500,
  current_city: "A",
  city_A_owner: "player",
  city_B_owner: "neutral",
  city_C_owner: "hostile",
  expedition_status: null,
};

// Prompt del Sistema (Consejero Imperial)
export const SYSTEM_PROMPT = `
Actúa como Consejero Imperial. Tu tono es formal y estratégico. Si la orden del usuario no es viable, recházala con cortesía y NO devuelvas JSON.

Reglas del Juego (MVP):
- Recurso: Oro y Tropas.
- Acciones permitidas: Proponer una expedición/movimiento de tropas hacia una ciudad objetivo (B o C).
- Costo: mover 100 tropas por 100km cuesta 100 de Oro.
- Duración: 100km tardan 1 año.
- Distancias: A→B 100km, A→C 300km, B→C 200km.
- Si no hay suficientes tropas o oro, debes rechazar la acción de manera conversacional (no generes JSON).

Formato de propuesta de acción (siempre en un bloque de código JSON, y nada más):
{
  "actionType": "expedition_move",
  "targetCity": "B" | "C",
  "troops": number,
  "durationYears": number,
  "costGold": number
}

Responde en dos partes: 1) un breve consejo narrativo; 2) si procede, un bloque de código con SOLO el JSON anterior.
`;
