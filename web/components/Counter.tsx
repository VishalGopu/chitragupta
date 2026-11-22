"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { get, post, leaveRole } from "@/lib/api";
import { say, speakText } from "@/lib/voice";
import { fmtQty, unitPrice } from "@/lib/units";
import { useEvents, useHoldToTalk } from "@/lib/hooks";
import type { CartItem, Config, Lang, Line, Order, TurnResponse, KitchenView } from "@/lib/types";

/** What the right-hand panel shows under the cart. */
type Panel =
  | { kind: "none" }
  | { kind: "pay"; qr: string }                                   // UPI QR, waiting for payment
  | { kind: "slip"; number: number; pin?: string; station: string }  // pay-after shop: slip is with the team
  | { kind: "code"; number: number; pin?: string }                // paid: show the pickup code
  | { kind: "bill"; qr: string; order: Order };                   // finished order being billed at the counter

const EMPTY_CFG: Config = { menu: { shop: "Chitragupta", items: [] }, mock: true, gemini: false, parser: "", profile: { id: "", shops: [], payWhen: "before", words: {} } };
const r2 = (x: number) => Math.round(x * 100) / 100;

export default function Counter() {
  const [cfg, setCfg] = useState<Config>(EMPTY_CFG);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lang, setLang] = useState<Lang>("en-IN");
  const [face, setFace] = useState("🤖");
  const [heard, setHeard] = useState(""); const [reply, setReply] = useState("");
  const [status, setStatus] = useState("");
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [ready, setReady] = useState<Order[]>([]);
  const [text, setText] = useState(""); const [table, setTable] = useState("");
  const [billTotal, setBillTotal] = useState("");

  const orderId = useRef<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const readyRef = useRef<Order[]>([]); readyRef.current = ready;
  const langRef = useRef(lang); langRef.current = lang;

  const after = cfg.profile.payWhen === "after", words = cfg.profile.words ?? {}, staff = (words.staff ?? "kitchen").toLowerCase(), station = (words.station ?? "kitchen").toLowerCase();
  const items = useMemo(() => Object.fromEntries(cfg.menu.items.map((i) => [i.id, i])), [cfg]);
  const lines: Line[] = useMemo(() => cart.filter((c) => items[c.id]).map((c) => ({
    id: c.id, name: items[c.id].name, qty: c.qty, price: items[c.id].price, unit: items[c.id].unit, note: c.note, amount: Math.round(c.qty * items[c.id].price),
  })), [cart, items]);
  const total = lines.reduce((s, l) => s + (l.amount ?? 0), 0);

  const stopPoll = () => { if (poll.current) clearInterval(poll.current); poll.current = null; };
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { stopPoll(); timers.current.forEach(clearTimeout); }, []);

  const loadReady = useCallback(async () => {
    try { const k = await get<KitchenView>("/api/kitchen"); setReady(k.orders.filter((o) => o.status === "ready")); } catch { /* keep the last list */ }
  }, []);
  const loadCfg = useCallback(async () => {
    try { setCfg(await get<Config>("/api/config")); void loadReady(); }
    catch { setReply("Can't reach the server. Check your connection and reload."); }
  }, [loadReady]);
  useEffect(() => { void loadCfg(); }, [loadCfg]);
  useEvents((e) => {
    if (e.type === "menu") void loadCfg();
    if (e.type === "ready") void speakText(String(e.text), String(e.lang));   // this speaker calls out finished orders
    if (e.type !== "menu") void loadReady();
  });
  useEffect(() => { document.title = cfg.menu.shop + " · Counter"; }, [cfg.menu.shop]);

  function reset() {
    setCart([]); orderId.current = null; stopPoll(); setPanel({ kind: "none" }); setStatus(""); setBillTotal("");
  }

  async function cancelPending() {                       // customer changes their mind after the QR is shown
    const id = orderId.current;
    if (!id || readyRef.current.some((o) => o.id === id)) return;   // a finished order being billed is not cancellable
    stopPoll();
    const r = await post<{ error?: string }>(`/api/order/${id}/cancel`, {});
    if (r.error) { setStatus("Payment already received for " + id); startPoll(id); return; }   // too late: it was paid
    orderId.current = null; setPanel({ kind: "none" }); setStatus("Order unlocked — edit and pay again.");
  }

  async function turn(payload: { text?: string; audio?: string; add?: { id: string; qty: number } }) {
    if (orderId.current) await cancelPending();
    if (orderId.current) return;
    setFace("🤔");
    const r = await post<TurnResponse>("/api/turn", { ...payload, cart, lang });
    setFace("🤖");
    if (r.error) { setReply(r.error); setHeard(""); return; }
    setHeard(r.heard ?? ""); setReply(r.reply);
    if (r.timings) setStatus(`stt ${r.timings.stt ?? "-"}ms · parse ${r.timings.parse ?? "-"}ms (${r.timings.via}) · tts ${r.timings.tts ?? "-"}ms`);
    setCart(r.cart ?? cart); setLang(r.lang ?? lang);
    if (!payload.add) say(r.audio, r.reply, r.lang ?? lang);
    if (r.action === "checkout") void checkout(r.cart ?? cart, r.lang ?? lang);
    if (r.action === "clear") reset();
  }

  async function checkout(c: CartItem[] = cart, l: Lang = lang) {
    if (orderId.current || !c.length) return;
    const r = await post<{ error?: string; order: Order; qr?: string; payLater?: boolean; pin?: string }>("/api/checkout", { cart: c, lang: l, table });
    if (r.error) { setReply(r.error); return; }
    orderId.current = r.order.id;
    if (r.payLater) {                                    // pay-after shop: the slip is with the team; bill when it is packed
      setPanel({ kind: "slip", number: r.order.number, pin: r.pin, station: words.station ?? "Kitchen" });
      setStatus(`Sent to ${staff} ✔ · total ₹${r.order.total}`);
      setCart([]); orderId.current = null; void loadReady();
      later(() => { if (!orderId.current) { setPanel({ kind: "none" }); setStatus(""); } }, 12000);
      return;
    }
    setPanel({ kind: "pay", qr: r.qr ?? "" }); setStatus("Waiting for payment… " + r.order.id);
    startPoll(r.order.id);
  }

  function startPoll(id: string) {
    stopPoll();
    poll.current = setInterval(async () => {
      const s = await get<{ order?: Order; pin?: string | null; announce?: { text: string; audio?: string } }>(`/api/order/${id}`);
      const st = s.order?.status;
      if (st === "cancelled") { stopPoll(); return; }
      if (s.order && st && st !== "awaiting_payment") {
        stopPoll();
        setPanel({ kind: "code", number: s.order.number, pin: s.pin ?? undefined });
        setStatus(`Paid ✔ Sent to ${station}. Wait for your number.`);
        if (s.announce) say(s.announce.audio, s.announce.text, langRef.current);
        later(reset, 25000);
      }
    }, 2000);
  }

  async function editCart(id: string, act: "inc" | "dec" | "del" | "note") {
    if (orderId.current) await cancelPending();
    if (orderId.current) return;                         // cannot edit once payment was received
    const c = cart.find((x) => x.id === id); if (!c) return;
    const step = items[id]?.step || 1;
    if (act === "note") {
      const n = prompt(`Note for ${items[id].name} (quality, brand, size…)`, c.note ?? ""); if (n === null) return;
      setCart(cart.map((x) => (x.id === id ? { ...x, note: n.trim().slice(0, 60) || undefined } : x))); return;
    }
    const qty = act === "inc" ? r2(c.qty + step) : act === "dec" ? r2(c.qty - step) : 0;
    setCart(cart.map((x) => (x.id === id ? { ...x, qty } : x)).filter((x) => x.qty > 0.001));
  }

  async function billOrder(o: Order) {
    if (orderId.current) return;
    const pin = prompt(`Customer's pickup code for #${o.number} (Cancel to stop)`); if (pin === null) return;
    const r = await post<{ error?: string; order: Order; qr: string }>(`/api/order/${o.id}/bill`, { pin });
    if (r.error) { setStatus(r.error); return; }
    orderId.current = o.id; setBillTotal(`Bill ₹${r.order.total} · #${r.order.number}`);
    setPanel({ kind: "bill", qr: r.qr, order: r.order }); setStatus("Waiting for payment… " + o.id);
    stopPoll();
    poll.current = setInterval(async () => {
      const s = await get<{ order?: Order; announce?: { text: string; audio?: string } }>(`/api/order/${o.id}`);
      if (s.order?.status === "delivered") { if (s.announce) say(s.announce.audio, s.announce.text, langRef.current); finishBill(r.order.number); }
    }, 2000);
  }
  function finishBill(number: number) {
    stopPoll(); orderId.current = null; setPanel({ kind: "none" }); setBillTotal(""); setStatus(`Paid ✔ #${number} handed over.`); void loadReady();
  }
  async function cash(o: Order) {
    const pin = prompt(`Confirm the customer's pickup code for #${o.number}`); if (pin === null) return;
    const c = await post<{ error?: string }>(`/api/order/${o.id}/cash`, { pin });
    if (c.error) { setStatus(c.error); return; }
    finishBill(o.number);
  }
  const backFromBill = () => { stopPoll(); orderId.current = null; setPanel({ kind: "none" }); setBillTotal(""); setStatus(""); };

  const mic = useHoldToTalk((audio) => turn({ audio }), (m) => setReply("Mic: " + m));
  const send = () => { const t = text.trim(); if (t) { setText(""); void turn({ text: t }); } };

  const owe = ready.filter((o) => after || o.payLater), plain = ready.filter((o) => !(after || o.payLater));

  return (
    <main id="main" className="page counter" tabIndex={-1}>
      <section className="card" aria-label="Take an order">
        <h1>{cfg.menu.shop} · Chitragupta</h1>
        <div className="mut">Speak in any Indian language · hold the button and talk</div>
        <div style={{ textAlign: "right" }}><button className="ghost sm" onClick={leaveRole}>↩ role</button></div>
        <div className="face" aria-hidden="true">{face}</div>
        <div className="say" aria-live="polite">{heard && <><span className="mut">“{heard}”</span><br /></>}{reply}</div>
        <button className={`talk ${mic.recording ? "rec" : ""}`} {...mic.props} aria-pressed={mic.recording}>
          {mic.recording ? "● Listening… release to send" : "🎤 Hold to speak"}
        </button>
        <div className="row">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} aria-label="Type an order"
            placeholder={after && cfg.profile.fulfil === "pack" ? "…or type (e.g. 1 kg rice, half kg sugar)" : "…or type (e.g. two dosa and a chai)"} />
          <button className="ghost" onClick={send}>Send</button>
        </div>
        <p className="mut">Tap to add:</p>
        <div className="menu">
          {cfg.menu.items.map((i) => i.soldOut
            ? <button key={i.id} disabled style={{ opacity: 0.4 }}>{i.name}<br /><span className="mut">Sold out</span></button>
            : <button key={i.id} onClick={() => void turn({ add: { id: i.id, qty: i.step || 1 } })}>
                {i.name}<br /><span className="mut">{unitPrice(i)}{i.stock != null && i.stock <= 3 * (i.step || 1) ? ` · only ${fmtQty(i.stock, i.unit)} left` : ""}</span>
              </button>)}
        </div>
      </section>

      <section className="card" aria-label="Your order">
        <h2 style={{ marginTop: 0 }}>Your order</h2>
        <table className="cart"><tbody>
          {lines.length === 0 && <tr><td className="mut">Empty</td></tr>}
          {lines.map((l) => (
            <tr key={l.id}>
              <td>{l.name}<br /><button className="ghost sm" onClick={() => void editCart(l.id, "note")}>{l.note ? "📝 " + l.note : "＋ note (quality / brand)"}</button></td>
              <td className="q">
                <button className="ghost" aria-label={`Decrease ${l.name}`} onClick={() => void editCart(l.id, "dec")}>−</button> {fmtQty(l.qty, l.unit)} <button className="ghost" aria-label={`Increase ${l.name}`} onClick={() => void editCart(l.id, "inc")}>+</button>
              </td>
              <td>₹{l.amount}</td>
              <td><button className="ghost" aria-label={`Remove ${l.name}`} onClick={() => void editCart(l.id, "del")}>✕</button></td>
            </tr>
          ))}
        </tbody></table>
        <h2 style={{ textAlign: "right" }} aria-live="polite">{billTotal || (total ? "Total ₹" + total : "")}</h2>
        {cfg.profile.table && <div className="row"><input value={table} onChange={(e) => setTable(e.target.value)} placeholder="Table number" inputMode="numeric" aria-label="Table number" /></div>}
        <div className="row">
          <button onClick={() => cart.length && void checkout()}>{after ? "Send to " + staff : "Pay with UPI"}</button>
          <button className="ghost" onClick={reset}>Clear</button>
        </div>

        <div className="qr">
          {panel.kind === "pay" && <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={panel.qr} alt="UPI QR code for this order" />
            <div className="mut" style={{ textAlign: "center" }}>Scan with any UPI app</div>
            <div className="row">
              <button className="ghost" onClick={() => void cancelPending()}>✏ Edit order</button>
              {cfg.mock && <button className="ghost" onClick={() => void post(`/api/order/${orderId.current}/mock-pay`, {})}>Simulate payment (demo)</button>}
            </div>
          </>}
          {panel.kind === "slip" && <>
            <div className="big">#{panel.number}</div>
            {panel.pin && <><div className="mut" style={{ textAlign: "center" }}>Pickup code</div><div className="big" style={{ fontSize: 44, letterSpacing: 8 }}>{panel.pin}</div></>}
            <div className="mut" style={{ textAlign: "center" }}>{panel.station}: your slip is being handled. Keep your number and code for pickup.</div>
          </>}
          {panel.kind === "code" && <>
            <div className="big">#{panel.number}</div>
            {panel.pin && <><div className="mut" style={{ textAlign: "center" }}>Pickup code</div><div className="big" style={{ fontSize: 44, letterSpacing: 8 }}>{panel.pin}</div></>}
          </>}
          {panel.kind === "bill" && <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={panel.qr} alt="UPI QR code for the final bill" />
            <div className="mut" style={{ textAlign: "center" }}>Final bill ₹{panel.order.total} — scan to pay</div>
            <div className="row">
              <button className="ghost" onClick={() => void cash(panel.order)}>💵 Cash received</button>
              {cfg.mock && <button className="ghost" onClick={() => void post(`/api/order/${panel.order.id}/mock-pay`, {})}>Simulate payment (demo)</button>}
              <button className="ghost" onClick={backFromBill}>Back</button>
            </div>
          </>}
        </div>
        <div className="mut" aria-live="polite">{status}</div>

        <div className="mut" style={{ marginTop: 14, fontSize: 20 }} aria-live="polite">
          {owe.length > 0 && <>Ready — collect payment:<div>{owe.map((o) => <button key={o.id} className="ghost" style={{ margin: "4px 6px 0 0" }} onClick={() => void billOrder(o)}>#{o.number} · ₹{o.total}</button>)}</div></>}
          {plain.length > 0 && <>Ready for pickup: <b style={{ color: "var(--acc)" }}>{plain.map((o) => "#" + o.number).join("  ")}</b></>}
        </div>
      </section>
    </main>
  );
}
