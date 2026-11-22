"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { get, post, session } from "@/lib/api";
import type { Config, Role } from "@/lib/types";

interface Mode { multi: boolean; types: { id: string; label: string }[]; error?: string }
interface Made { shop: { code: string; name: string }; token: string }
interface Demo { shop: { code: string }; tokens: Record<Role, string>; error?: string }

const ROLE_LINKS: { role: Role; href: string }[] = [
  { role: "counter", href: "/counter" }, { role: "kitchen", href: "/kitchen" }, { role: "owner", href: "/owner" },
];

/** Entry page: join a shop with its code, create one, try the demo, or (single-shop installs) pick a device role. */
export default function Landing() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [code, setCode] = useState("");           // the shop code this device is paired with
  const [codeInput, setCodeInput] = useState("");
  const [name, setName] = useState(""); const [type, setType] = useState(""); const [pin, setPin] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState(""); const [sub, setSub] = useState("Which device is this?");
  const [connection, setConnection] = useState("Checking connection…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCode(session.code());
    // Returning visitors skip straight to their last role.
    const last = session.role();
    if (last && !new URLSearchParams(location.search).has("pick") && (!session.multi() || session.token(last))) { location.replace("/" + last); return; }
    (async () => {
      try {
        const m = await get<Mode>("/api/mode"); if (m.error) throw new Error(m.error);
        setMode(m); setConnection("Connected to " + location.origin); session.setMulti(m.multi);
        if (m.multi) setType(m.types[0]?.id ?? ""); else setCfg(await get<Config>("/api/config"));
      } catch (e) { setConnection("Can't reach " + location.origin + ": " + (e instanceof Error ? e.message : e)); }
    })();
  }, []);

  const multi = !!mode?.multi, paired = !!code;

  const pair = () => { const c = codeInput.trim().toUpperCase(); if (!c) return setError("Enter the shop code"); setError(""); session.setCode(c); setCode(c); };
  const create = async () => {
    setError("");
    const r = await post<Made & { error?: string }>("/api/shops", { name, profile: type, pin });
    if (r.error) return setError(r.error);
    session.setCode(r.shop.code); session.setToken("owner", r.token); setMade(r.shop.code);
  };
  const demo = async () => {
    setError(""); setBusy(true);
    const r = await post<Demo>("/api/demo", {}); setBusy(false);
    if (r.error) return setError(r.error);
    session.setCode(r.shop.code); for (const [role, t] of Object.entries(r.tokens)) session.setToken(role as Role, t); setCode(r.shop.code);
  };
  const leave = () => { session.clear(); setCode(""); setMade(null); };

  /** Multi-shop: sign this device in for the chosen role before opening it. */
  const open = useCallback(async (e: React.MouseEvent, role: Role, href: string) => {
    session.setRole(role);
    if (!multi || session.token(role)) return;
    e.preventDefault();
    try {
      const pinValue = role === "owner" ? prompt("Owner PIN") : undefined;
      if (role === "owner" && pinValue === null) return;
      const r = await post<{ token: string; error?: string }>("/api/join", { code: session.code(), role, pin: pinValue });
      if (r.error) throw new Error(r.error);
      session.setToken(role, r.token); location.href = href;
    } catch (x) {
      const msg = x instanceof Error ? x.message : String(x); setSub(msg);
      if (/unknown shop/.test(msg)) { session.clear(); setCode(""); setError(msg); }
    }
  }, [multi]);

  const words = cfg?.profile.words ?? {}, pack = cfg?.profile.fulfil === "pack";
  const copy = (role: Role) => {
    if (multi || !cfg) return { title: { counter: "🎤 Counter", kitchen: "👨‍🍳 Kitchen", owner: "📊 Owner" }[role], desc: { counter: "Customers speak, pay with UPI", kitchen: "Live orders, mark ready, sold-out", owner: "Daily summary and insights" }[role] };
    if (role === "kitchen") return { title: `${pack ? "🧺" : "👨‍🍳"} ${words.station ?? "Kitchen"}`, desc: pack ? "Slips to pick, tick items, mark not available" : "Live orders, mark ready, sold-out" };
    if (role === "counter") return { title: "🎤 Counter", desc: pack ? "Take the order by voice, then bill and collect" : "Customers speak, pay with UPI" };
    return { title: "📊 Owner", desc: "Daily summary and insights" };
  };

  return (
    <main id="main" className="page narrow" tabIndex={-1}>
      <h1>🤖 {cfg && !multi ? cfg.menu.shop : "Chitragupta for Shops"}</h1>
      <p className="mut">A voice-first AI business partner for small shops, in the owner&apos;s own language.</p>

      {multi && !paired && !made && (
        <>
          <section className="card" style={{ margin: "12px 0" }} aria-labelledby="join-h">
            <b id="join-h">Join your shop</b><div className="mut">Enter the shop code from the owner&apos;s phone</div>
            <div className="row">
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="SHOP CODE" maxLength={8} autoCapitalize="characters"
                aria-label="Shop code" style={{ textTransform: "uppercase", letterSpacing: 4, textAlign: "center" }} />
              <button onClick={pair}>Join</button>
            </div>
          </section>
          <section className="card" style={{ margin: "12px 0" }} aria-labelledby="demo-h">
            <b id="demo-h">Just looking?</b><div className="mut">One tap opens a demo shop with two weeks of sample orders</div>
            <div className="row"><button onClick={demo} disabled={busy}>{busy ? "Setting up…" : "Try the demo shop"}</button></div>
          </section>
          <section className="card" style={{ margin: "12px 0" }} aria-labelledby="new-h">
            <b id="new-h">New shop?</b><div className="mut">Create it in a minute</div>
            <div className="row" style={{ flexDirection: "column" }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shop name" aria-label="Shop name" />
              <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Shop type">
                {mode?.types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Owner PIN (4–6 digits)" aria-label="Owner PIN (4–6 digits)" inputMode="numeric" maxLength={6} type="password" />
              <button className="ghost" onClick={create}>Create shop</button>
            </div>
          </section>
          <div className="err" role="alert">{error}</div>
        </>
      )}

      {made && (
        <section className="card" aria-live="polite">
          <b>Your shop is ready 🎉</b><div className="mut">Give this code to your counter and kitchen phones</div>
          <div className="code">{made}</div>
          <button onClick={() => { setMade(null); setCode(session.code()); }}>Continue</button>
        </section>
      )}

      {!made && (!multi || paired) && (
        <div>
          <p className="mut" aria-live="polite">{sub}</p>
          {ROLE_LINKS.map(({ role, href }) => {
            const c = copy(role);
            return <Link key={role} className="tile" href={href} onClick={(e) => open(e, role, href)}><b>{c.title}</b><br /><span className="mut">{c.desc}</span></Link>;
          })}
          {multi && paired && <p className="mut"><a href="#" onClick={(e) => { e.preventDefault(); leave(); }} style={{ color: "var(--mut)" }}>Leave this shop</a></p>}
        </div>
      )}

      <section className="card" style={{ margin: "12px 0" }}><b>Server</b><div className="mut">{connection}</div></section>
    </main>
  );
}
