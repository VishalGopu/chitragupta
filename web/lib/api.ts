// Backend client: signed device tokens, JSON helpers and the live-update stream (SSE).
// Each role (counter / kitchen / owner) keeps its own token. The active role is per browser tab (sessionStorage) so one browser can
// hold several roles of the same shop; localStorage remembers the last role for the next visit.
import type { Role } from "./types";

const store = {
  get(area: "local" | "session", key: string): string {
    try { return (area === "local" ? localStorage : sessionStorage).getItem(key) ?? ""; } catch { return ""; }
  },
  set(area: "local" | "session", key: string, value: string) {
    try { (area === "local" ? localStorage : sessionStorage).setItem(key, value); } catch { /* storage blocked: stay signed-out */ }
  },
  del(area: "local" | "session", key: string) {
    try { (area === "local" ? localStorage : sessionStorage).removeItem(key); } catch { /* ignore */ }
  },
};

/** Browser-only helpers for the signed-in shop; safe to call during server rendering (returns empty values). */
export const session = {
  role: (): Role | "" => (store.get("session", "role") || store.get("local", "role")) as Role | "",
  setRole(role: Role) { store.set("local", "role", role); store.set("session", "role", role); },
  token: (role?: Role | ""): string => store.get("local", "tok_" + (role ?? session.role())),
  setToken(role: Role, token: string) { store.set("local", "tok_" + role, token); },
  code: (): string => store.get("local", "code"),
  setCode(code: string) { store.set("local", "code", code); },
  multi: (): boolean => store.get("local", "multi") === "1",
  setMulti(multi: boolean) { store.set("local", "multi", multi ? "1" : "0"); },
  clear() {
    ["code", "role", "tok_counter", "tok_kitchen", "tok_owner"].forEach((k) => store.del("local", k));
    store.del("session", "role");
  },
  clearRole() { store.del("local", "role"); store.del("session", "role"); },
};

const headers = (extra: Record<string, string> = {}) => {
  const t = session.token();
  return t ? { ...extra, Authorization: "Bearer " + t } : extra;
};

async function finish<T>(r: Response): Promise<T> {
  if (r.status === 401) {
    store.del("local", "tok_" + session.role());
    if (typeof location !== "undefined" && location.pathname !== "/") location.href = "/?pick";
  }
  return r.json() as Promise<T>;
}

export const get = <T>(url: string) => fetch(url, { headers: headers() }).then((r) => finish<T>(r));
export const post = <T>(url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) }).then((r) => finish<T>(r));

/** Opens the live-update stream. Returns a function that closes it. */
export function events(onEvent: (e: { type: string; [k: string]: unknown }) => void): () => void {
  const t = session.token();
  const es = new EventSource("/api/events" + (t ? "?t=" + encodeURIComponent(t) : ""));
  es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* ignore malformed event */ } };
  return () => es.close();
}

export const leaveRole = () => { session.clearRole(); location.href = "/"; };
