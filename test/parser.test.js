import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "chitragupta-test-"));
delete process.env.GEMINI_API_KEY;
const { parse, applyToCart } = await import("../src/parser.js");

test("rules parser reads quantities and checkout words", async () => {
  const r = await parse("two dosa and a chai, that's all");
  assert.equal(r.via, "rules"); assert.equal(r.items.masala_dosa, 2); assert.equal(r.items.chai, 1); assert.equal(r.checkout, true);
});
test("rules parser handles decreases without adding", async () => {
  const r = await parse("reduce one chai");
  assert.deepEqual(r.items, {}); assert.equal(r.remove.chai, 1);
});
test("with a key but a failing model, parsing falls back to rules", async () => {
  process.env.GEMINI_API_KEY = "k"; const real = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  try { const r = await parse("one samosa"); assert.equal(r.via, "rules(fallback)"); assert.equal(r.items.samosa, 1); }
  finally { globalThis.fetch = real; delete process.env.GEMINI_API_KEY; }
});
test("model output is validated: unknown items and bad quantities are dropped", async () => {
  process.env.GEMINI_API_KEY = "k"; const real = globalThis.fetch;
  const out = '{"items":{"chai":{"q":2,"note":"less sugar"},"pizza":{"q":3},"samosa":{"q":-1}},"remove":{},"checkout":false,"clear":false}';
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: out }] } }] }));
  try { const r = await parse("some order"); assert.equal(r.via, "gemini"); assert.deepEqual(r.items, { chai: 2 }); assert.equal(r.notes.chai, "less sugar"); }
  finally { globalThis.fetch = real; delete process.env.GEMINI_API_KEY; }
});
test("applyToCart adds, removes and clears", () => {
  let cart = applyToCart([], { items: { chai: 2 }, notes: {}, remove: {}, clear: false });
  cart = applyToCart(cart, { items: {}, notes: {}, remove: { chai: 1 }, clear: false });
  assert.deepEqual(cart, [{ id: "chai", qty: 1 }]);
  assert.deepEqual(applyToCart(cart, { clear: true }), []);
});
