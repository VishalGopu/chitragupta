import { vi } from "vitest";

/** Replaces fetch with a router: each key is "METHOD /path" (query ignored) and maps to a JSON body or a function of the request body. */
export function mockApi(routes: Record<string, unknown | ((body: unknown) => unknown)>) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).split("?")[0]}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body });
    const r = routes[key];
    if (r === undefined) return new Response(JSON.stringify({ error: "no mock for " + key }), { status: 404 });
    return new Response(JSON.stringify(typeof r === "function" ? (r as (b: unknown) => unknown)(body) : r));
  }));
  return calls;
}

/** jsdom has no EventSource; this one never fires. */
export function stubEventSource() {
  vi.stubGlobal("EventSource", class { onmessage = null; close() {} });
}
