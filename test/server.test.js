// End-to-end: boots the real server (multi-shop, file store, no Gemini key) and drives it over HTTP.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";

let proc, base;
const freePort = () => new Promise((ok) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const call = async (path, { method = "GET", body, token } = {}) => {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body && JSON.stringify(body) });
  return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
};

before(async () => {
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  const env = { PATH: process.env.PATH, PORT: String(port), TENANCY: "multi", DATA_DIR: mkdtempSync(join(tmpdir(), "chitragupta-e2e-")), RATE_LIMIT_PER_MIN: "200", MODEL_LIMIT_PER_MIN: "5" };
  proc = spawn(process.execPath, ["src/server.js"], { env, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("server did not start");
});
after(() => proc?.kill());

test("serves pages with security headers", async () => {
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(r.headers.get("access-control-allow-origin"), null, "same-origin by default");
});
test("path traversal is refused", async () => {
  const r = await fetch(base + "/..%2f..%2fetc/passwd"); assert.ok([400, 404].includes(r.status));
});
test("API needs a token", async () => {
  assert.equal((await call("/api/config")).status, 401);
  assert.equal((await call("/api/config", { token: "forged.token" })).status, 401);
});

let owner, shop;
test("signup, join and role checks", async () => {
  const bad = await call("/api/shops", { method: "POST", body: { name: "x", profile: "canteen", pin: "1234" } });
  assert.equal(bad.status, 400, "name too short");
  const made = await call("/api/shops", { method: "POST", body: { name: "Test Canteen", profile: "canteen", pin: "4321" } });
  assert.equal(made.status, 200); owner = made.json.token; shop = made.json.shop;
  assert.equal((await call("/api/join", { method: "POST", body: { code: shop.code, role: "owner", pin: "0000" } })).status, 403, "wrong PIN");
  const k = await call("/api/join", { method: "POST", body: { code: shop.code, role: "kitchen" } });
  assert.equal(k.status, 200);
  assert.equal((await call("/api/insights", { token: k.json.token })).status, 403, "kitchen cannot read owner data");
  assert.equal((await call("/api/insights", { token: owner })).status, 200);
});
test("a typed order becomes a priced cart and an order", async () => {
  const t = await call("/api/turn", { method: "POST", token: owner, body: { text: "two dosa and a chai", cart: [] } });
  assert.equal(t.status, 200); assert.equal(t.json.total, 130, "price comes from the catalog");
  const o = await call("/api/checkout", { method: "POST", token: owner, body: { cart: t.json.cart } });
  assert.equal(o.status, 200); assert.equal(o.json.order.status, "awaiting_payment"); assert.match(o.json.qr, /^data:image\/svg/);
  const before = await call(`/api/order/${o.json.order.id}`, { token: owner }); assert.equal(before.json.order.status, "awaiting_payment");
  await call(`/api/order/${o.json.order.id}/mock-pay`, { method: "POST", token: owner, body: {} });
  const paid = await call(`/api/order/${o.json.order.id}`, { token: owner }); assert.notEqual(paid.json.order.status, "awaiting_payment");
});
test("model-backed endpoints are rate limited", async () => {
  let last; for (let i = 0; i < 8; i++) last = await call("/api/turn", { method: "POST", token: owner, body: { text: "chai", cart: [] } });
  assert.equal(last.status, 429); assert.ok(last.headers.get("retry-after"));
});

test("one-tap demo shop returns tokens for every role and has history to analyse", async () => {
  const d = await call("/api/demo", { method: "POST", body: {} });
  assert.equal(d.status, 200); assert.deepEqual(Object.keys(d.json.tokens).sort(), ["counter", "kitchen", "owner"]);
  const f = await call("/api/insights", { token: d.json.tokens.owner });
  assert.equal(f.status, 200); assert.ok(f.json.facts.week.orders > 100, "two weeks of orders are loaded");
  const brief = await call("/api/briefing", { token: d.json.tokens.owner });
  assert.equal(brief.status, 200); assert.ok(brief.json.text.length > 20);
});
