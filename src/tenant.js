// Request-scoped shop ("tenant") context. Every request runs inside runIn(tenant, ...); the state modules (orders, kitchen, insights, parser, pay)
// read `menu`, `orders`, `soldOut`, `kitchenState` through proxies that resolve to the CURRENT shop, so one process can serve many shops
// without any shop's data touching another's. In single-shop mode (default) code outside a request falls back to the one "default" shop.
import { AsyncLocalStorage } from "node:async_hooks";
export const als = new AsyncLocalStorage();
export const isMulti = () => process.env.TENANCY === "multi";
let makeDefault = null; let fallback = null;
export const setDefaultFactory = (f) => { makeDefault = f; };
export function cur() {
  const t = als.getStore(); if (t) return t;
  if (isMulti()) throw new Error("no shop in request context");
  return (fallback ||= makeDefault());
}
export const current = () => als.getStore() || (isMulti() ? null : cur());
export const runIn = (t, fn) => als.run(t, fn);
// a stand-in object/array/Set whose every operation is forwarded to pick() (functions are bound to the real target)
export const proxyOf = (pick, base = {}) => new Proxy(base, {
  get: (_, k) => { const t = pick(); const v = Reflect.get(t, k, t); return typeof v === "function" ? v.bind(t) : v; },
  set: (_, k, v) => { Reflect.set(pick(), k, v); return true; },
  has: (_, k) => k in pick(), deleteProperty: (_, k) => Reflect.deleteProperty(pick(), k), ownKeys: () => Reflect.ownKeys(pick()),
  getOwnPropertyDescriptor: (_, k) => { const d = Reflect.getOwnPropertyDescriptor(pick(), k); if (d && k !== "length") d.configurable = true; return d; },
});
