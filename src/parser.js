// Order parser. Input: English-ish text (from speech-to-text) -> {items, remove, checkout, clear}.
// Gemini does the understanding; any error (or no API key) falls back to the rules parser, so the counter never stops working.
import { menu } from "./orders.js";
import { ask, geminiEnabled } from "./google.js";
import { llmGate } from "./limiter.js";
import { allowed, track } from "./usage.js";

const MENU = () => menu.items.map((i) => `- ${i.id}: ${i.name} (unit: ${i.unit || "piece"}; also called: ${i.aliases.join(", ")})`).join("\n");
const SYS = () => `You are a ${menu.parserRole || "shop order"} parser for "${menu.shop}". Map what the customer says to these items ONLY:
${MENU()}
The customer may speak English, Hindi, Telugu, or a mix. Items may appear in their own script. "q" is the quantity in the item's OWN unit: for kg items "half kilo"=0.5, "250 grams"=0.25, "2 kilo"=2; same for litre items; for packet/piece/plate items it is a count. "note" is any quality, brand, size or preference the customer states for that item (e.g. "ripe", "Tata", "small", "less sugar"), otherwise "" (write the note in English). Apply self-corrections ("no, make it four" replaces the earlier number). Set checkout=true only if the customer says they are finished or asks for the bill/payment. Use remove for "remove/cancel/reduce/decrease one X"; reducing an existing item must never add it. Set clear=true for "cancel everything".
Output ONLY one line of compact JSON: {"items":{"<id>":{"q":<number>,"note":""}},"remove":{"<id>":<number>},"checkout":false,"clear":false}
Examples:
${(menu.examples || []).join("\n")}`;

const num = (v) => Math.min(50, Math.round(Number(v) * 100) / 100);
const ids = () => new Set(menu.items.map((i) => i.id));
function pick(o) { const out = {}, ok = ids(); for (const [k, v] of Object.entries(o || {})) { const q = num(typeof v === "object" && v ? v.q : v); if (ok.has(k) && q > 0) out[k] = q; } return out; }
function notes(o) { const out = {}; for (const [k, v] of Object.entries(o || {})) if (v && typeof v === "object" && String(v.note || "").trim()) out[k] = String(v.note).trim().slice(0, 60); return out; }
const clean = (g) => ({ items: pick(g.items), notes: notes(g.items), remove: pick(g.remove), checkout: g.checkout === true, clear: g.clear === true });
const extract = (s) => clean(JSON.parse(s.match(/\{[\s\S]*\}/)[0]));

// ---- rules fallback: understands quantities with units ("half kilo rice", "250 grams dal", "2 packets maggi", "rice 2 kg")
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, ek: 1, do: 2, teen: 3, char: 4, paanch: 5, half: 0.5, aadha: 0.5, adha: 0.5, quarter: 0.25, paav: 0.25, pav: 0.25 };
const QTY = "(\\d+(?:\\.\\d+)?|" + Object.keys(NUM).join("|") + ")\\s*(kgs?|kilos?|kilograms?|gms?|grams?|ml|l|litres?|liters?|packets?|packs?|pieces?|plates?|dozen)?\\s*(?:of\\s+)?";
const ADJ = "(ripe|fresh|raw|organic|small|big|large|loose|green|cold|hot|sweet|less sugar|no sugar|extra spicy)";
const BRAND = "tata|aashirvaad|amul|fortune|saffola|nestle|britannia|parle|surf|lux|dettol";
const ADJ_BEFORE = new RegExp("\\b(" + ADJ.slice(1, -1) + "|" + BRAND + ")\\s+$"); const BEFORE = new RegExp(QTY + "(?:" + ADJ + "\\s+)?$"), AFTER = new RegExp("^\\s*(?:(?:[:x-]|by)\\s*)?" + QTY), ADJ_AFTER = new RegExp("^[^,.;]{0,12}?\\b" + ADJ + "\\b");
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function toUnit(n, u, item) {
  u = (u || "").replace(/s$/, ""); if (u === "dozen") return n * 12;
  if (["g", "gm", "gram"].includes(u) || u === "ml") return item.unit === "kg" || item.unit === "litre" ? n / 1000 : n;
  return n;
}
function rulesParse(text) {
  const t = text.toLowerCase(), items = {}, note = {};
  const pairs = menu.items.flatMap((m) => [m.name, ...m.aliases].map((a) => ({ m, a: a.toLowerCase() }))).sort((x, y) => y.a.length - x.a.length);
  const used = [], hits = [];
  for (const { m, a } of pairs) {
    if (items[m.id] != null) continue;
    const re = /^[\x00-\x7f]+$/.test(a) ? new RegExp(`(?<![a-z])${esc(a)}(?:e?s)?(?![a-z])`) : new RegExp(esc(a)); const mm = re.exec(t); if (!mm) continue;
    const s0 = mm.index, e0 = s0 + mm[0].length; if (used.some(([x, y]) => s0 < y && e0 > x)) continue; used.push([s0, e0]);
    const b = BEFORE.exec(t.slice(Math.max(0, s0 - 40), s0)), f = !b && AFTER.exec(t.slice(e0, e0 + 30));
    const g = b || f; let q = g ? (isNaN(+g[1]) ? NUM[g[1]] : +g[1]) : null; q = q == null ? 1 : toUnit(q, g[2], m);
    items[m.id] = Math.round(q * 100) / 100; const n = (b && b[3]) || ADJ_BEFORE.exec(t.slice(Math.max(0, s0 - 16), s0))?.[1] || ADJ_AFTER.exec(t.slice(e0, e0 + 24))?.[1]; if (n) note[m.id] = n; hits.push(m.id);
  }
  const removing = /\b(remove|cancel|delete|take out|without|reduce|decrease|subtract)\b/.test(t) && hits.length > 0;
  return { items: removing ? {} : items, notes: removing ? {} : note, remove: removing ? items : {}, checkout: !removing && /\b(pay|bill|that's all|that is all|that's it|done|bas|checkout|nothing else|total)\b/.test(t), clear: /\b(cancel (everything|all|order)|clear|reset)\b/.test(t) };
}

const providers = {
  async gemini(text) { return extract(await ask(SYS(), text, { json: true, maxTokens: 600, timeoutMs: 10000 })); },
  async rules(text) { return rulesParse(text); },
};
const primary = () => (process.env.PARSER === "rules" || !geminiEnabled() ? "rules" : "gemini");

export async function parse(text) {
  const name = primary(); const t0 = Date.now();
  // A single explicit decrease has an unambiguous cart meaning; handle it
  // before a model can accidentally classify the quantity as an addition.
  if (/^\s*(?:please\s+)?(?:reduce|decrease|subtract)\b/i.test(text) && !/\b(add|give|order|include)\b/i.test(text)) {
    const r = rulesParse(text);
    if (Object.keys(r.remove).length === 1) return { ...r, via: "rules(decrease)", ms: Date.now() - t0 };
  }
  try {
    if (name === "rules") return { ...(await providers.rules(text)), via: name, ms: Date.now() - t0 };
    if (!allowed("llm")) throw new Error("daily model limit reached");
    const r = await llmGate(() => providers[name](text)); track("llm"); return { ...r, via: name, ms: Date.now() - t0 };      // shared model server: bounded concurrency, metered per shop
  }
  catch (e) { console.warn(`parser ${name} failed (${e.message}); using rules`); const r = await providers.rules(text); return { ...r, via: "rules(fallback)", ms: Date.now() - t0 }; }
}

export function applyToCart(cart, p) {
  if (p.clear) return [];
  const m = new Map(cart.map((c) => [c.id, { qty: c.qty, note: c.note }])), r2 = (x) => Math.round(x * 100) / 100;
  for (const [id, q] of Object.entries(p.items)) { const c = m.get(id) || { qty: 0 }; m.set(id, { qty: r2(c.qty + q), note: (p.notes || {})[id] || c.note }); }
  for (const [id, q] of Object.entries(p.remove)) { const c = m.get(id); if (!c) continue; const n = r2(c.qty - q); n > 0 ? m.set(id, { ...c, qty: n }) : m.delete(id); }
  return [...m].map(([id, c]) => ({ id, qty: c.qty, ...(c.note ? { note: c.note } : {}) }));
}
