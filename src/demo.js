// Demo data: two weeks of plausible orders for a shop, so the owner's briefing, insights and copilot have something real to talk about.
// Deterministic (seeded), so a demo looks the same every time.
import { profiles } from "./orders.js";

const DAY = 86_400_000, HOUR = 3_600_000, MIN = 60_000;
const HOUR_WEIGHTS = [[8, 4], [9, 9], [10, 6], [11, 10], [12, 18], [13, 22], [14, 12], [15, 7], [16, 16], [17, 12], [18, 5]];   // lunch and tea-time rush
const BUSY_HOURS = [12, 13, 16];
const LANGS = ["en-IN", "hi-IN", "te-IN"];

/** Builds a shop state document ({orders, soldOut, kitchen, shop}) with 14 days of history ending at `now`. */
export function demoState(shopType = "canteen", now = Date.now()) {
  const prof = profiles[shopType]; if (!prof) throw new Error("unknown shop type");
  const menu = prof.items, payAfter = prof.payWhen === "after";
  let seed = 42; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (weighted) => { let r = rnd() * weighted.reduce((a, b) => a + b[1], 0); for (const [v, w] of weighted) if ((r -= w) <= 0) return v; return weighted[0][0]; };
  const popularity = menu.map((m) => [m.id, m.pop || 10]);
  const qtyFor = (m) => (m.step < 1 ? [0.5, 0.5, 1, 1, 1.5, 2][Math.floor(rnd() * 6)] : 1 + (rnd() < 0.3 ? 1 : 0));

  const midnight = new Date(now).setHours(0, 0, 0, 0), orders = []; let n = 100;
  for (let d = 13; d >= 0; d--) {
    const day = midnight - d * DAY, dow = new Date(day).getDay(), limit = d === 0 ? now : day + DAY;
    const count = dow === 0 ? 22 : dow === 6 ? 32 : 55 + Math.floor(rnd() * 15), today = [];
    for (let i = 0; i < count; i++) {
      const hour = pick(HOUR_WEIGHTS), paidAt = day + hour * HOUR + Math.floor(rnd() * HOUR); if (paidAt > limit) continue;
      const lines = [];
      for (let j = 0, k = 1 + Math.floor(rnd() * 3); j < k; j++) {
        const id = pick(popularity), m = menu.find((x) => x.id === id);
        if (!lines.some((l) => l.id === m.id)) { const qty = qtyFor(m); lines.push({ id: m.id, name: m.name, qty, unit: m.unit, price: m.price, amount: Math.round(qty * m.price) }); }
      }
      const wait = (BUSY_HOURS.includes(hour) ? 6 + rnd() * 6 : 2.5 + rnd() * 3) * MIN, readyAt = paidAt + wait, deliveredAt = readyAt + (1 + rnd() * 2) * MIN;
      today.push({ lines, paidAt, readyAt: Math.min(readyAt, limit), deliveredAt: Math.min(deliveredAt, limit), done: readyAt < limit });
    }
    today.sort((a, b) => a.paidAt - b.paidAt).forEach((o) => orders.push({
      id: `ORD${++n}`, number: n, shop: shopType, lang: LANGS[Math.floor(rnd() * 3)],
      lines: o.lines.map((l) => ({ ...l, done: o.done ? l.qty : 0 })), total: o.lines.reduce((s, l) => s + l.amount, 0),
      status: o.done ? "delivered" : "cooking", createdAt: o.paidAt - 40_000, startedAt: o.paidAt,
      paidAt: o.done || !payAfter ? (payAfter ? o.deliveredAt : o.paidAt) : null, method: payAfter ? (rnd() < 0.6 ? "cash" : "upi") : undefined,
      readyAt: o.done ? o.readyAt : null, deliveredAt: o.done ? o.deliveredAt : null,
    }));
  }
  return { orders, soldOut: shopType === "canteen" ? ["cold_coffee"] : [], kitchen: { mode: prof.fulfil === "pack" ? "order" : "station", chefs: [] }, shop: shopType };
}
