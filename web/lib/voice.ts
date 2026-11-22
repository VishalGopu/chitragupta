// Microphone capture (16 kHz mono WAV for Gemini speech-to-text), audio playback with a browser-voice fallback, and a beep.
import { post } from "./api";

/** Records until `stop` resolves, then returns a base64 16 kHz mono 16-bit WAV. */
export async function recordWav(stop: Promise<void>): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: Float32Array[] = [];
  let ctx: AudioContext | undefined, src: MediaStreamAudioSourceNode | undefined, proc: ScriptProcessorNode | undefined, rate = 48000;
  try {
    ctx = new AudioContext(); src = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(proc); proc.connect(ctx.destination);
    await stop;
    rate = ctx.sampleRate;
  } finally {
    proc?.disconnect(); src?.disconnect(); stream.getTracks().forEach((t) => t.stop());
    if (ctx) await ctx.close();
  }
  return encodeWav(chunks, rate);
}

/** Downsamples float PCM chunks to 16 kHz mono and wraps them in a WAV container (base64). Exported for tests. */
export function encodeWav(chunks: Float32Array[], rate: number): string {
  const len = chunks.reduce((s, c) => s + c.length, 0), pcm = new Float32Array(len);
  let o = 0; for (const c of chunks) { pcm.set(c, o); o += c.length; }
  const ratio = rate / 16000, n = Math.floor(len / ratio), out = new Int16Array(n);
  if (n < 3200) throw new Error("Hold the microphone button a little longer and try again.");
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, pcm[Math.floor(i * ratio)])) * 0x7fff;
  const buf = new ArrayBuffer(44 + out.length * 2), v = new DataView(buf);
  const w = (p: number, s: string) => [...s].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + out.length * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, out.length * 2, true); new Int16Array(buf, 44).set(out);
  let bin = ""; new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/** Plays server audio (base64 WAV), or speaks `text` with the browser voice when there is none. */
export function say(audio: string | null | undefined, text: string, lang = "en-IN") {
  if (audio) { void new Audio("data:audio/wav;base64," + audio).play().catch(() => {}); return; }
  if (typeof speechSynthesis !== "undefined") { const u = new SpeechSynthesisUtterance(text); u.lang = lang; speechSynthesis.speak(u); }
}

export async function speakText(text: string, lang = "en-IN") {
  try { const r = await post<{ audio?: string }>("/api/tts", { text, lang }); say(r.audio, text, lang); } catch { say(null, text, lang); }
}

export function beep() {
  try {
    const a = new AudioContext(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.2; o.start(); o.stop(a.currentTime + 0.25);
  } catch { /* audio blocked until the user interacts */ }
}
