import test from "node:test";
import assert from "node:assert/strict";
process.env.GEMINI_API_KEY = "test-key";
const { ask, stt, tts, pcmToWav, geminiEnabled } = await import("../src/google.js");

const realFetch = globalThis.fetch;
const reply = (body, status = 200) => async (url, init) => { reply.last = { url, init, body: JSON.parse(init.body) }; return new Response(JSON.stringify(body), { status }); };
const text = (t) => ({ candidates: [{ content: { parts: [{ text: t }] } }] });
test.afterEach(() => { globalThis.fetch = realFetch; });

test("ask sends the key in a header (never the URL) and turns thinking off", async () => {
  globalThis.fetch = reply(text(" hello "));
  assert.equal(await ask("sys", "hi", { json: true }), "hello");
  const { url, init, body } = reply.last;
  assert.ok(!url.includes("test-key")); assert.equal(init.headers["x-goog-api-key"], "test-key");
  assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
});
test("errors never leak the response body", async () => {
  globalThis.fetch = reply({ error: { message: "secret detail" } }, 503);
  await assert.rejects(() => ask("s", "u"), (e) => e.message === "gemini 503");
});
test("an empty candidate is an error, not an empty answer", async () => {
  globalThis.fetch = reply({ candidates: [{ finishReason: "OTHER" }] });
  await assert.rejects(() => ask("s", "u"), /no text/);
});
test("stt parses the transcript and ignores unknown languages", async () => {
  globalThis.fetch = reply(text('{"text":" two dosa ","lang":"hi-IN"}'));
  assert.deepEqual(await stt(Buffer.alloc(10)), { text: "two dosa", lang: "hi-IN" });
  globalThis.fetch = reply(text('{"text":"x","lang":"fr-FR"}'));
  assert.equal((await stt(Buffer.alloc(10))).lang, null);
});
test("tts wraps PCM as WAV and caches by text", async () => {
  let calls = 0; const pcm = Buffer.alloc(100, 1).toString("base64");
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/l16; rate=24000", data: pcm } }] } }] })); };
  const a = Buffer.from(await tts("cache me"), "base64"); await tts("cache me");
  assert.equal(calls, 1); assert.equal(a.toString("ascii", 0, 4), "RIFF"); assert.equal(a.length, 144);
});
test("pcmToWav writes a valid header", () => {
  const w = pcmToWav(Buffer.alloc(10), 16000);
  assert.equal(w.readUInt32LE(24), 16000); assert.equal(w.readUInt32LE(40), 10); assert.equal(w.length, 54);
});
test("geminiEnabled follows the key", () => { assert.equal(geminiEnabled(), true); });
