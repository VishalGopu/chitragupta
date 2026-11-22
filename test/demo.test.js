import test from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../src/demo.js";

test("demo state is deterministic and has two weeks of history", () => {
  const now = new Date("2026-03-11T15:00:00").getTime();
  const a = demoState("canteen", now), b = demoState("canteen", now);
  assert.deepEqual(a, b);
  assert.ok(a.orders.length > 300);
  const days = new Set(a.orders.map((o) => new Date(o.paidAt || o.createdAt).toDateString()));
  assert.ok(days.size >= 13);
});
test("orders are internally consistent", () => {
  for (const o of demoState("canteen").orders) {
    assert.equal(o.total, o.lines.reduce((s, l) => s + l.amount, 0));
    assert.ok(o.lines.length >= 1);
    if (o.status === "delivered") assert.ok(o.deliveredAt >= o.paidAt);
  }
});
test("pay-after shops settle on delivery", () => {
  const o = demoState("kirana").orders.find((x) => x.status === "delivered");
  assert.ok(["cash", "upi"].includes(o.method)); assert.equal(o.paidAt, o.deliveredAt);
});
test("unknown shop types are rejected", () => assert.throws(() => demoState("spaceship"), /unknown shop type/));
