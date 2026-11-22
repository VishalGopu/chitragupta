// Persistence behind a small interface. STORE=firestore keeps each shop's state and the shop registry in Google Firestore;
// the default is local JSON files (used by tests and offline demos).
// Reads are synchronous from an in-memory cache that is filled up front (initStore / preload); writes go through to the backend.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { isMulti } from "./tenant.js";

export const dataDir = () => process.env.DATA_DIR || fileURLToPath(new URL("../data/", import.meta.url));
export const useFirestore = () => process.env.STORE === "firestore";
const MAX_ORDERS = 1000;                       // a Firestore document holds 1 MiB; keep the newest orders in the shop's state document

let db = null;
async function firestore() {
  if (!db) { const { Firestore } = await import("@google-cloud/firestore"); db = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT, ignoreUndefinedProperties: true }); }
  return db;
}
const states = new Map(), pending = new Set();
const track = (p) => { pending.add(p); p.finally(() => pending.delete(p)); return p; };
const warn = (what) => (e) => console.error(`firestore ${what} failed: ${e.message}`);

// ---- per-shop state
const fileFor = (id) => (isMulti() ? join(dataDir(), "tenants", id + ".json") : join(dataDir(), "state.json"));
/** Loads one shop's state into the cache (Firestore mode). Call before loadTenant. */
export async function preload(id) {
  if (!useFirestore() || states.has(id)) return;
  const snap = await (await firestore()).collection("states").doc(id).get();
  states.set(id, snap.exists ? snap.data() : null);
}
export function loadState(id) {
  if (useFirestore()) return states.get(id) ?? null;
  try { return JSON.parse(readFileSync(fileFor(id), "utf8")); } catch { return null; }
}
export function saveState(id, obj) {
  if (useFirestore()) {
    const doc = { ...obj, orders: (obj.orders || []).slice(-MAX_ORDERS) }; states.set(id, doc);
    track(firestore().then((d) => d.collection("states").doc(id).set(doc))).catch(warn("save state")); return;
  }
  const f = fileFor(id); mkdirSync(dirname(f), { recursive: true }); const tmp = f + ".tmp"; writeFileSync(tmp, JSON.stringify(obj)); renameSync(tmp, f);
}

// ---- shop registry (name, type, hashed owner PIN, shop code) and the token-signing secret
const regFile = () => join(dataDir(), "tenants.json");
const registryFromFile = () => { try { return JSON.parse(readFileSync(regFile(), "utf8")); } catch { return { shops: {} }; } };
export async function loadRegistry() {
  if (useFirestore()) {
    const snap = await (await firestore()).collection("shops").get();
    return { shops: Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])) };
  }
  return registryFromFile();
}
/** File mode only: synchronous read, so the registry works without initRegistry (tests, scripts). */
export const loadRegistrySync = () => (useFirestore() ? { shops: {} } : registryFromFile());
export function saveShop(reg, shop) {
  if (useFirestore()) { track(firestore().then((d) => d.collection("shops").doc(shop.id).set(shop))).catch(warn("save shop")); return; }
  mkdirSync(dataDir(), { recursive: true }); const tmp = regFile() + ".tmp"; writeFileSync(tmp, JSON.stringify(reg)); renameSync(tmp, regFile());
}
const secretFromFile = () => { try { return readFileSync(join(dataDir(), "secret.key"), "utf8").trim(); } catch { return null; } };
export async function loadSecret() {
  if (process.env.TOKEN_SECRET) return process.env.TOKEN_SECRET;
  if (useFirestore()) { const s = await (await firestore()).collection("meta").doc("secret").get(); return s.exists ? s.data().value : null; }
  return secretFromFile();
}
export const loadSecretSync = () => process.env.TOKEN_SECRET || (useFirestore() ? null : secretFromFile());
export async function saveSecret(value) {
  if (useFirestore()) return void (await (await firestore()).collection("meta").doc("secret").set({ value }));
  mkdirSync(dataDir(), { recursive: true }); writeFileSync(join(dataDir(), "secret.key"), value, { mode: 0o600 });
}
/** Waits for in-flight writes (used on shutdown). */
export const settled = () => Promise.allSettled([...pending]);
