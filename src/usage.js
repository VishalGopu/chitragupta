// Per-shop metering + daily quotas (speech and model calls are the only real marginal cost). Counters live in the shop's own state.
import { current } from "./tenant.js";
const day = () => new Date().toISOString().slice(0, 10);
const roll = (t) => { const u = (t.usage ||= {}); if (u.day !== day()) { u.day = day(); u.today = {}; } u.total ||= {}; return u; };
export const limits = (t) => ({ stt: t.plan?.sttPerDay ?? (+process.env.LIMIT_STT_DAY || 3000), tts: t.plan?.ttsCharsPerDay ?? (+process.env.LIMIT_TTS_CHARS_DAY || 200000), llm: t.plan?.llmPerDay ?? (+process.env.LIMIT_LLM_DAY || 3000) });
export function track(kind, n = 1) { const t = current(); if (!t) return; const u = roll(t); u.today[kind] = (u.today[kind] || 0) + n; u.total[kind] = (u.total[kind] || 0) + n; }
export function allowed(kind) { const t = current(); if (!t) return true; const u = roll(t), lim = limits(t)[kind]; return !lim || (u.today[kind] || 0) < lim; }
export const usageView = (t) => { const u = roll(t); return { today: u.today, total: u.total, limits: limits(t) }; };
