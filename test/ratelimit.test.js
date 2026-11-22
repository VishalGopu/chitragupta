import test from "node:test";
import assert from "node:assert/strict";
import { rateLimiter } from "../src/ratelimit.js";

test("allows up to the limit, then blocks with a retry hint", () => {
  let t = 0; const lim = rateLimiter({ limit: 3, windowMs: 1000, now: () => t });
  assert.ok(lim("a").ok && lim("a").ok && lim("a").ok);
  const r = lim("a"); assert.equal(r.ok, false); assert.ok(r.retryAfter >= 1);
});
test("callers are counted separately and the window resets", () => {
  let t = 0; const lim = rateLimiter({ limit: 1, windowMs: 1000, now: () => t });
  assert.ok(lim("a").ok); assert.equal(lim("a").ok, false); assert.ok(lim("b").ok);
  t = 1500; assert.ok(lim("a").ok, "new window");
});
