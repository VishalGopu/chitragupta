// Gemini API client (Google AI): text generation, speech-to-text and text-to-speech.
// Plain fetch against the REST API, so the app needs no SDK. Every call has a timeout; callers fall back gracefully.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const key = () => process.env.GEMINI_API_KEY;
export const geminiEnabled = () => !!key();
export const textModel = () => process.env.GEMINI_MODEL || "gemini-3.5-flash";
const ttsModel = () => process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
const voice = () => process.env.GEMINI_VOICE || "Kore";
export const LANGS = ["en-IN", "hi-IN", "te-IN"];
// Thinking is off: these are short extraction/answer tasks, and thinking adds seconds of latency and can eat the output budget.
const NO_THINK = { thinkingConfig: { thinkingBudget: 0 } };

async function generate(model, body, timeoutMs) {
  const r = await fetch(`${BASE}${model}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);   // never include the response body: it can echo request details
  return r.json();
}
const firstPart = (j) => j.candidates?.[0]?.content?.parts?.find((p) => p.text != null || p.inlineData) || {};

/** One text answer. `json: true` asks for a JSON-only reply. */
export async function ask(system, user, { maxTokens = 400, json = false, timeoutMs = 15000 } = {}) {
  const j = await generate(textModel(), {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { ...NO_THINK, temperature: 0.2, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
  }, timeoutMs);
  const t = firstPart(j).text;
  if (!t) throw new Error("gemini returned no text");
  return t.trim();
}

/** Speech to English text plus the spoken language. `wav` is a 16 kHz mono PCM WAV buffer. */
export async function stt(wav) {
  const j = await generate(textModel(), {
    contents: [{ role: "user", parts: [
      { inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } },
      { text: `Transcribe this speech, translating it to English if it is not English. Reply ONLY with JSON: {"text": string, "lang": "en-IN" | "hi-IN" | "te-IN"} where lang is the language the speaker used. If there is no speech, text is "".` },
    ] }],
    generationConfig: { ...NO_THINK, temperature: 0, responseMimeType: "application/json", maxOutputTokens: 300 },
  }, 20000);
  const out = JSON.parse(firstPart(j).text || "{}");
  return { text: String(out.text || "").trim(), lang: LANGS.includes(out.lang) ? out.lang : null };
}

const cache = new Map();
/** Wraps raw 16-bit mono PCM in a WAV container so browsers can play it. */
export function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF"); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Text to speech. Resolves a base64 WAV, cached by text. Gemini picks the language from the text itself. */
export async function tts(text) {
  const k = text.slice(0, 600); if (cache.has(k)) return cache.get(k);
  const j = await generate(ttsModel(), {
    contents: [{ parts: [{ text: k }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice() } } } },
  }, 25000);
  const d = firstPart(j).inlineData;
  if (!d) throw new Error("gemini returned no audio");
  const rate = Number(/rate=(\d+)/.exec(d.mimeType || "")?.[1]) || 24000;
  const wav = pcmToWav(Buffer.from(d.data, "base64"), rate).toString("base64");
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  cache.set(k, wav); return wav;
}
