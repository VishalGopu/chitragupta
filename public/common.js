// Mic -> 16 kHz mono WAV (sent to Gemini speech-to-text), and audio playback with browser-TTS fallback.
export async function recordWav(stopSignal) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let ctx, src, proc, rate, chunks = [];
  try {
    ctx = new AudioContext(); src = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(proc); proc.connect(ctx.destination);
    await stopSignal; // promise resolved when user releases button
    rate = ctx.sampleRate;
  } finally {
    proc?.disconnect(); src?.disconnect(); stream.getTracks().forEach((t) => t.stop());
    if (ctx) await ctx.close();
  }
  const len = chunks.reduce((s, c) => s + c.length, 0), pcm = new Float32Array(len); let o = 0;
  for (const c of chunks) { pcm.set(c, o); o += c.length; }
  const ratio = rate / 16000, n = Math.floor(len / ratio), out = new Int16Array(n);
  if (n < 3200) throw new Error("Hold the microphone button a little longer and try again.");
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, pcm[Math.floor(i * ratio)])) * 0x7fff;
  const buf = new ArrayBuffer(44 + out.length * 2), v = new DataView(buf);
  const w = (p, s) => [...s].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + out.length * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, out.length * 2, true); new Int16Array(buf, 44).set(out);
  let bin = ""; new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin);
}
export function say(b64, text, lang) {
  if (b64) return new Audio("data:audio/wav;base64," + b64).play().catch(() => {});
  if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(text); u.lang = lang || "en-IN"; speechSynthesis.speak(u); }
}
// Server base URL: "" when served by the backend itself; set once inside the APK (e.g. http://100.x.y.z:3000).
export const base = () => { try { return localStorage.getItem("api") || ""; } catch { return ""; } };
export function setServer(force) {
  const cur = base();
  if (force || (!cur && location.hostname === "localhost" && location.protocol === "https:")) {
    const v = prompt("Backend server URL (e.g. http://192.168.1.10:3000)", cur || "http://");
    if (v == null) return false;
    try {
      const u = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : "http://" + v.trim());
      if (!u.hostname || !["http:", "https:"].includes(u.protocol) || u.username || u.password || u.pathname !== "/" || u.search || u.hash) throw new Error();
      localStorage.setItem("api", u.origin);
      return true;
    } catch { alert("Enter the server address only, for example http://192.168.0.33:3000"); return false; }
  }
  return false;
}
// Multi-shop mode: each role (counter / kitchen / owner) holds its own signed token from joining with the shop code.
// the role is per TAB (sessionStorage) so one browser can hold counter + kitchen + owner tabs of the same shop; localStorage remembers the last one for app launches
const roleNow = () => { try { return sessionStorage.getItem("role") || localStorage.getItem("role") || ""; } catch { return ""; } };
export const token = () => { try { return localStorage.getItem("tok_" + roleNow()) || ""; } catch { return ""; } };
const hdr = (extra = {}) => { const t = token(); return t ? { ...extra, Authorization: "Bearer " + t } : extra; };
async function done(r) {
  if (r.status === 401) { try { localStorage.removeItem("tok_" + roleNow()); } catch {} if (!/(^|\/)(index\.html)?$/.test(location.pathname)) location.href = "index.html?pick"; }
  return r.json();
}
export const get = (u) => fetch(base() + u, { headers: hdr() }).then(done);
export const post = (u, b) => fetch(base() + u, { method: "POST", headers: hdr({ "Content-Type": "application/json" }), body: JSON.stringify(b) }).then(done);
export function events(on) { const t = token(); const es = new EventSource(base() + "/api/events" + (t ? "?t=" + encodeURIComponent(t) : "")); es.onmessage = (m) => { try { on(JSON.parse(m.data)); } catch {} }; return es; }
export async function speakText(text, lang) { try { const r = await post("/api/tts", { text, lang }); say(r.audio, text, lang); } catch { say(null, text, lang); } }
export function beep() { try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.2; o.start(); o.stop(a.currentTime + 0.25); } catch {} }
export const goRole = () => { try { localStorage.removeItem("role"); sessionStorage.removeItem("role"); } catch {} location.href = "index.html"; };
