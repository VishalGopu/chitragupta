"use client";
import { useCallback, useEffect, useState } from "react";
import { get, post, leaveRole } from "@/lib/api";
import { say } from "@/lib/voice";
import { fmtQty } from "@/lib/units";
import { useEvents, useHoldToTalk } from "@/lib/hooks";
import type { Config, Facts, Lang, Profile } from "@/lib/types";
import ShopSettings from "./owner/ShopSettings";
import KitchenSetup from "./owner/KitchenSetup";

const QUESTIONS: Record<Lang, string[]> = {
  "en-IN": ["How much did I earn today?", "What should I prepare tomorrow?", "Which item sells the most?", "When is it busiest?"],
  "hi-IN": ["आज कितनी कमाई हुई?", "कल क्या तैयार करूं?", "सबसे ज़्यादा क्या बिकता है?"],
  "te-IN": ["ఈరోజు ఎంత సంపాదించాను?", "రేపు ఏమి సిద్ధం చేయాలి?", "ఏది ఎక్కువ అమ్ముడవుతుంది?"],
};
const LANG_OPTIONS: [Lang, string][] = [["en-IN", "English"], ["hi-IN", "हिन्दी"], ["te-IN", "తెలుగు"]];
const pct = (a: number, b: number) => (b ? (a >= b ? "▲ " : "▼ ") + Math.abs(Math.round(((a - b) / b) * 100)) + "% vs yesterday so far" : "");

interface QA { id: number; q: string; a: string; pending: boolean }
interface Briefing { text: string; tips?: string[]; audio?: string }
interface ShopInfo { code: string | null; usage: { today?: Record<string, number>; limits: Record<string, number> } }

export default function Owner() {
  const [lang, setLang] = useState<Lang>("en-IN");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [briefError, setBriefError] = useState("");
  const [facts, setFacts] = useState<Facts | null>(null);
  const [info, setInfo] = useState<ShopInfo | null>(null);
  const [history, setHistory] = useState<QA[]>([]);
  const [question, setQuestion] = useState("");

  useEffect(() => { try { const saved = localStorage.getItem("olang") as Lang | null; if (saved) setLang(saved); } catch { /* storage blocked */ } }, []);
  const chooseLang = (l: Lang) => { setLang(l); try { localStorage.setItem("olang", l); } catch { /* ignore */ } };

  const loadBrief = useCallback(async () => {
    try {
      const b = await get<Briefing & { error?: string }>("/api/briefing?lang=" + lang);
      if (b.error) { setBriefError(b.error); return; }
      setBrief(b); setBriefError("");
    } catch { setBriefError("Can't reach the server."); }
  }, [lang]);
  const loadNums = useCallback(async () => {
    try { const r = await get<{ facts?: Facts }>("/api/insights"); if (r.facts) setFacts(r.facts); } catch { /* keep last */ }
  }, []);
  useEffect(() => { void loadBrief(); }, [loadBrief]);
  useEffect(() => {
    void loadNums();
    get<ShopInfo>("/api/shop-info").then(setInfo).catch(() => {});
    get<Config>("/api/config").then((c) => setProfile(c.profile)).catch(() => {});
  }, [loadNums]);
  useEvents((e) => { if (e.type === "update" || e.type === "order") void loadNums(); });

  async function ask(p: { text?: string; audio?: string }) {
    const id = Date.now();
    setHistory((h) => [{ id, q: p.text ?? "🎤 …", a: "Thinking…", pending: true }, ...h]);
    const patch = (q: Partial<QA>) => setHistory((h) => h.map((x) => (x.id === id ? { ...x, ...q } : x)));
    try {
      const r = await post<{ heard?: string; answer: string; audio?: string; lang: Lang; error?: string }>("/api/copilot", { ...p, lang });
      patch({ q: r.heard || p.text || "", a: r.error ?? r.answer, pending: false });
      if (!r.error) say(r.audio, r.answer, r.lang);
    } catch (e) { patch({ a: "Failed: " + (e instanceof Error ? e.message : e), pending: false }); }
  }
  const mic = useHoldToTalk((audio) => ask({ audio }), (m) => setHistory((h) => [{ id: Date.now(), q: "", a: "Mic: " + m, pending: false }, ...h]));
  const submit = () => { const t = question.trim(); if (t) { setQuestion(""); void ask({ text: t }); } };

  const chips = (QUESTIONS[lang] ?? QUESTIONS["en-IN"]).map((q) => (profile?.fulfil === "pack" && q === "What should I prepare tomorrow?" ? "What is running low?" : q));
  const f = facts, max = Math.max(1, ...(f?.week.perDay.map((d) => d.revenue) ?? [1]));

  return (
    <main id="main" className="page narrow" tabIndex={-1}>
      <div className="top">
        <h1>📊 Chitragupta · Owner</h1>
        <div>
          <select value={lang} onChange={(e) => chooseLang(e.target.value as Lang)} aria-label="Language">
            {LANG_OPTIONS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>{" "}
          <button className="ghost sm" onClick={leaveRole}>↩ role</button>
        </div>
      </div>

      <h2 style={{ marginTop: 14 }}>☀️ Briefing</h2>
      <div className={`brief ${brief ? "" : "mut"}`} aria-live="polite">{briefError || brief?.text || "Loading…"}</div>
      {brief?.tips?.map((t) => <div key={t} className="tip">💡 {t}</div>)}
      <p><button onClick={async () => { try { const b = await get<Briefing>(`/api/briefing?audio=1&lang=${lang}`); say(b.audio, b.text, lang); } catch { /* ignore */ } }}>🔊 Read it to me</button></p>

      <h2>🎤 Ask Chitragupta</h2>
      <button className={`talk ${mic.recording ? "rec" : ""}`} style={{ width: "100%", padding: 18, fontSize: 20, borderRadius: 16 }} {...mic.props} aria-pressed={mic.recording}>
        {mic.recording ? "● Listening… release to send" : "🎤 Hold to ask"}
      </button>
      <div className="chips">{chips.map((q) => <button key={q} className="chipbtn" onClick={() => void ask({ text: q })}>{q}</button>)}</div>
      <div className="row">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="…or type a question" aria-label="Type a question" />
        <button onClick={submit}>Ask</button>
      </div>
      <div aria-live="polite">
        {history.map((h) => <div key={h.id} className="qa"><div className="q">{h.q}</div><div className={h.pending ? "mut" : ""}>{h.a}</div></div>)}
      </div>

      <h2>📈 Numbers</h2>
      <div className="cards">
        <div className="c"><span className="mut">Orders today</span><b className="num">{f ? f.today.orders : "–"}</b><span className="mut">{f ? pct(f.today.orders, f.yesterday.ordersByNow) : ""}</span></div>
        <div className="c"><span className="mut">Revenue today</span><b className="num">{f ? "₹" + f.today.revenue : "–"}</b><span className="mut">{f ? pct(f.today.revenue, f.yesterday.revenueByNow) : ""}</span></div>
        <div className="c"><span className="mut">Avg wait</span><b className="num">{f?.today.avgWaitMin != null ? f.today.avgWaitMin + " min" : "–"}</b></div>
        <div className="c"><span className="mut">Busiest hour</span><b className="num">{f?.week.peakHour != null ? f.week.peakHour + ":00" : "–"}</b></div>
      </div>
      <div className="c">
        <span className="mut">Last 7 days · revenue ₹</span>
        <div className="bar" role="img" aria-label={"Revenue for the last 7 days: " + (f?.week.perDay.map((d) => `${d.label} ₹${d.revenue}`).join(", ") ?? "no data")}>
          {f?.week.perDay.map((d) => <div key={d.label}><i style={{ height: Math.round((d.revenue / max) * 80) }} />{d.label}</div>)}
        </div>
      </div>
      {!!f?.stock?.length && (
        <div className="c" style={{ marginTop: 10 }}><span className="mut">Stock · days left</span>
          {f.stock.slice(0, 6).map((x) => (
            <div key={x.name} className="row2"><span>{x.name}</span>
              <b style={{ color: (x.daysLeft != null && x.daysLeft <= 2) || x.stock <= 0 ? "var(--bad)" : "inherit" }}>{fmtQty(x.stock, x.unit)}{x.daysLeft != null ? ` · ${x.daysLeft}d` : ""}</b>
            </div>
          ))}
        </div>
      )}
      <div className="c" style={{ marginTop: 10 }}><span className="mut">Best sellers this week</span>
        {f?.week.top.map((t) => <div key={t.name} className="row2"><span>{t.name}</span><b>{t.qty}</b></div>)}
        {f && !f.week.top.length && <div className="mut">No data yet</div>}
      </div>

      <h2>🏪 My shop</h2>
      {info?.code && (
        <div className="c" style={{ marginBottom: 10 }}>
          <span className="mut">Shop code — enter it on counter &amp; kitchen phones</span>
          <b className="num" style={{ letterSpacing: 5 }}>{info.code}</b>
          <span className="mut">Today: voice {info.usage.today?.stt ?? 0}/{info.usage.limits.stt} · speech {info.usage.today?.tts ?? 0}/{info.usage.limits.tts} chars · model {info.usage.today?.llm ?? 0}/{info.usage.limits.llm}</span>
        </div>
      )}
      {profile && <ShopSettings profile={profile} onSaved={() => void loadNums()} />}
      {profile && <KitchenSetup profile={profile} />}
    </main>
  );
}
