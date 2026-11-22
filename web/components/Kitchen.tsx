"use client";
import { useCallback, useEffect, useState } from "react";
import { get, post, leaveRole } from "@/lib/api";
import { beep, speakText } from "@/lib/voice";
import { fmtQty, lineText, mmss } from "@/lib/units";
import { useEvents, useHoldToTalk, useInterval, useNow } from "@/lib/hooks";
import type { Chef, Config, KitchenView, MenuItem, Order } from "@/lib/types";

const remember = {
  get: () => { try { return localStorage.getItem("kwho") ?? ""; } catch { return ""; } },
  set: (v: string) => { try { localStorage.setItem("kwho", v); } catch { /* storage blocked */ } },
};

interface Data { orders: Order[]; chefs: Chef[]; mode: "station" | "order"; fulfil: string; words: Record<string, string>; menu: MenuItem[]; payAfter: boolean }
const EMPTY: Data = { orders: [], chefs: [], mode: "station", fulfil: "kitchen", words: {}, menu: [], payAfter: false };

/** The kitchen device: pick who you are (a chef, or the manager Board), then work from that view. */
export default function Kitchen() {
  const [data, setData] = useState<Data>(EMPTY);
  const [who, setWho] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [k, cfg] = await Promise.all([get<KitchenView>("/api/kitchen"), get<Config>("/api/config")]);
      setData({ orders: k.orders, chefs: k.chefs, mode: k.mode, fulfil: k.fulfil ?? "kitchen", words: k.words ?? {}, menu: cfg.menu.items, payAfter: cfg.profile.payWhen === "after" });
      setNote("");
    } catch { setNote("Can't reach the server."); }
  }, []);

  useEffect(() => { setWho(remember.get() || null); void load(); }, [load]);
  useInterval(() => void load(), 15000);
  useEvents((e) => {
    if (e.type === "task" && e.chefId === who) { beep(); void speakText(String(e.text), String(e.lang)); }   // spoken ONLY on that chef's device
    if (e.type === "order" && who === "board") beep();
    void load();
  });

  const pick = (id: string | null) => { setWho(id); remember.set(id ?? ""); void load(); };
  // A saved chef that no longer exists falls back to the picker.
  const current = who && who !== "board" && !data.chefs.some((c) => c.id === who) ? null : who;
  const pack = data.fulfil === "pack", station = data.words.station ?? "Kitchen";

  return (
    <main id="main" className="page" tabIndex={-1}>
      <div className="top">
        <h1>{current === "board" ? `📋 ${station} board` : current ? "👨‍🍳 " + (data.chefs.find((c) => c.id === current)?.name ?? "") : "👨‍🍳 Who is using this device?"}</h1>
        <div>
          <button className="ghost sm" onClick={() => pick(null)}>⇄ who am I</button>{" "}
          <button className="ghost sm" onClick={leaveRole}>↩ role</button>
        </div>
      </div>
      <p className="mut" aria-live="polite">{note}</p>

      {!current && <Picker data={data} pack={pack} onPick={pick} />}
      {current === "board" && <Board data={data} reload={load} setNote={setNote} />}
      {current && current !== "board" && <ChefView data={data} chef={data.chefs.find((c) => c.id === current)!} reload={load} setNote={setNote} />}
    </main>
  );
}

function Picker({ data, pack, onPick }: { data: Data; pack: boolean; onPick: (id: string) => void }) {
  const staff = data.words.staff ?? "Chef";
  return (
    <div className="pick">
      {data.chefs.map((c) => (
        <button key={c.id} onClick={() => onPick(c.id)}>
          👨‍🍳 {c.name}<br />
          <span className="mut">
            {c.skills.length && !pack ? "does: " + c.skills.map((s) => data.menu.find((m) => m.id === s)?.name ?? s).join(", ") : pack ? "packs orders" : "any dish"}
            {c.online ? " · on shift" : ""}
          </span>
        </button>
      ))}
      <button onClick={() => onPick("board")}>📋 Board (manager view)<br /><span className="mut">All orders, out-of-stock, assign by voice</span></button>
      {!data.chefs.length && <p className="mut">No {staff.toLowerCase()}s set up yet. Use Owner → {data.words.setup ?? "Kitchen setup"}, or open the Board.</p>}
    </div>
  );
}

// ---------------- chef device: one task at a time
function ChefView({ data, chef, reload, setNote }: { data: Data; chef: Chef; reload: () => Promise<void>; setNote: (s: string) => void }) {
  const now = useNow();
  const [transfer, setTransfer] = useState(false);
  const pack = data.fulfil === "pack", slip = pack, task = chef.task;

  async function run(fn: () => Promise<unknown>) { try { await fn(); } catch (e) { setNote("Failed: " + (e instanceof Error ? e.message : e)); } await reload(); }

  async function complete(body: { audio?: string }) {
    await run(async () => {
      const r = await post<{ completed: boolean; orderReady?: boolean; heard?: string; order?: Order }>(`/api/chefs/${chef.id}/complete`, body);
      setNote(r.completed ? (r.orderReady ? `Order #${r.order?.number} complete — announced at the counter.` : "Done. Next task coming…") : (r.heard ? `Heard “${r.heard}” — say “done” to finish.` : "Nothing to complete."));
    });
  }
  const mic = useHoldToTalk((audio) => complete({ audio }), (m) => setNote("Mic: " + m));
  const taskText = task ? (data.mode === "order" ? `Order ${task.number}: ` : "") + task.items.map((i) => lineText({ ...i, qty: i.qty }, true)).join(", ") + (data.mode === "order" ? "" : ` for order ${task.number}`) : "";
  const others = data.chefs.filter((c) => c.online && c.id !== chef.id);

  if (!chef.online) {
    return (
      <div>
        <div className="idle mut">Tap “Start shift” to receive orders. Tasks are spoken to you here.</div>
        <button className="start" onClick={() => { beep(); void run(() => post(`/api/chefs/${chef.id}/online`, { online: true })); }}>▶ Start shift</button>
      </div>
    );
  }

  const waiting = data.orders.filter((o) => o.status === "cooking").reduce((n, o) => n + o.lines.filter((l) => (l.done ?? 0) < l.qty && !l.chefId).length, 0);
  return (
    <div>
      {task ? (
        <div className="task">
          <div className="mut">{slip ? "SLIP" : data.mode === "order" ? "WHOLE ORDER" : "YOUR TASK"} {mmss(now - task.since)}</div>
          {slip ? task.items.map((i) => (
            <div key={i.id} className={`ln ${i.done >= i.total ? "done" : ""}`} style={{ fontSize: 24, textAlign: "left" }}>
              <span>{fmtQty(i.total, i.unit)} × {i.name}{i.note && <><br /><b style={{ color: "var(--warn)", fontSize: 18 }}>📝 {i.note}</b></>}{i.unavailable && <span className="tag">not available</span>}</span>
              {i.done < i.total && <span>
                <button className="ghost" onClick={() => void run(() => post("/api/ready", { number: task.number, lineId: i.id }))}>✓ got it</button>{" "}
                <button className="ghost" onClick={() => void run(async () => { const r = await post<{ error?: string }>("/api/line/unavailable", { number: task.number, lineId: i.id }); if (r.error) setNote(r.error); })}>✗ none</button>
              </span>}
            </div>
          )) : <div className="bigtext">{task.items.map((i) => <div key={i.id}>{lineText(i)}</div>)}</div>}
          <div className="for">for order #{task.number}{task.table ? ` · table ${task.table}` : ""}</div>
          <div className="row">
            <button onClick={() => void complete({})}>{pack ? "✅ All packed" : "✅ Done"}</button>
            <button className="ghost" onClick={() => void speakText(taskText, chef.lang)}>🔊 Repeat</button>
            <button className="ghost" onClick={() => setTransfer(!transfer)} aria-expanded={transfer}>⇄ Transfer</button>
            <button className={`ghost ${mic.recording ? "rec" : ""}`} {...mic.props}>🎤 Hold: “done”</button>
          </div>
          {transfer && (
            <div>
              <div className="mut" style={{ marginTop: 14 }}>Give this to…</div>
              <div className="row">
                {others.map((c) => <button key={c.id} className="ghost" onClick={() => void run(async () => {
                  const r = await post<{ error?: string; to?: string }>(`/api/chefs/${chef.id}/transfer`, { to: c.id });
                  setNote(r.error ? "Couldn't transfer: " + r.error : "Passed to " + r.to + "."); setTransfer(false);
                })}>{c.name}{c.task ? " (busy — next)" : " (free)"}</button>)}
                {others.length > 0 && <button className="ghost" onClick={() => void run(async () => {
                  const r = await post<{ error?: string; to?: string }>(`/api/chefs/${chef.id}/transfer`, { to: "any" });
                  setNote(r.error ? "Couldn't transfer: " + r.error : "Passed to " + r.to + "."); setTransfer(false);
                })}>Anyone free</button>}
                {!others.length && <span className="mut">No other chef is on shift</span>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="idle"><div style={{ fontSize: 30, fontWeight: 800 }}>✔ All clear</div><div className="mut">Waiting for the next order… {waiting ? waiting + " item(s) queued for others" : ""}</div></div>
      )}
      {(chef.queued ?? []).length > 0 && (
        <div className="idle" style={{ padding: 14 }}>
          <div className="mut">Next for you (passed by a colleague)</div>
          {chef.queued!.map((q) => <div key={q.number}>{q.items.map((i) => lineText(i)).join(", ")} · order #{q.number}{q.from ? ` · from ${q.from}` : ""}</div>)}
        </div>
      )}
      <p style={{ textAlign: "center" }}><button className="ghost sm" onClick={() => void run(() => post(`/api/chefs/${chef.id}/online`, { online: false }))}>End shift</button></p>
    </div>
  );
}

// ---------------- board (manager): all orders, chef status, sold-out, voice by order/dish
function Board({ data, reload, setNote }: { data: Data; reload: () => Promise<void>; setNote: (s: string) => void }) {
  const now = useNow();
  const [heard, setHeard] = useState("");
  const chefName = (id?: string) => data.chefs.find((c) => c.id === id)?.name ?? "";
  const first = data.orders.find((o) => o.status === "cooking");

  async function send(body: Record<string, unknown>) {
    try {
      const r = await post<{ heard?: string; results?: { number: number; completed: boolean }[] }>("/api/ready", body);
      if (!r.results?.length) setHeard(`Nothing to mark${r.heard ? ` for “${r.heard}”` : ""}. Say “order 104 ready”, “dosa ready” or “2 dosa ready”.`);
      else {
        const done = r.results.filter((x) => x.completed).map((x) => "#" + x.number), part = r.results.filter((x) => !x.completed).map((x) => "#" + x.number);
        setHeard((r.heard ? `Heard “${r.heard}” → ` : "") + [done.length ? `ready: ${done.join(", ")}` : "", part.length ? `partly done: ${part.join(", ")}` : ""].filter(Boolean).join(" · "));
      }
    } catch (e) { setHeard("Failed: " + (e instanceof Error ? e.message : e)); }
    await reload();
  }
  const mic = useHoldToTalk(async (audio) => { setHeard("Processing…"); await send({ audio }); }, (m) => setHeard("Mic: " + m));

  async function cash(o: Order) {
    const pin = prompt(`Customer's pickup code for #${o.number}`); if (pin === null) return;
    const r = await post<{ error?: string }>(`/api/order/${o.id}/cash`, { pin }); if (r.error) setNote(r.error); await reload();
  }
  async function deliver(o: Order) {
    const pin = prompt(`Customer's 4-digit pickup code for #${o.number}`); if (pin === null) return;
    let r = await post<{ error?: string; delivered?: boolean }>("/api/deliver", { number: o.number, pin });
    if (r.error && confirm("Wrong code. Hand over anyway?")) r = await post("/api/deliver", { number: o.number, override: true });
    setHeard(r.delivered ? `#${o.number} handed over ✔` : (r.error ?? "Not delivered")); await reload();
  }

  return (
    <div>
      <div className="strip">
        {data.chefs.map((c) => (
          <div key={c.id} className="cf">
            <b>{c.name}</b> <span className={c.online ? "on" : "off"}>{c.online ? "● on shift" : "○ off"}</span><br />
            {c.task
              ? <>{c.task.items.map((i) => lineText(i)).join(", ")} → #{c.task.number} <button className="ghost sm" onClick={async () => { await post(`/api/chefs/${c.id}/free`, {}); await reload(); }}>free</button></>
              : <span className="mut">idle</span>}
            {(c.queued ?? []).length > 0 && <><br /><span className="mut">next: {c.queued!.map((q) => "#" + q.number).join(", ")}</span></>}
          </div>
        ))}
        {!data.chefs.length && <div className="mut">Nobody configured (Owner → {data.words.setup ?? "Kitchen setup"}).</div>}
      </div>

      <div className="chips">
        {data.menu.map((i) => (
          <button key={i.id} className={`chipbtn ${i.soldOut ? "off" : ""}`} aria-pressed={!!i.soldOut}
            onClick={async () => { await post("/api/soldout", { id: i.id, soldOut: !i.soldOut }); await reload(); }}>
            {i.name}{i.soldOut ? " · out" : ""}
          </button>
        ))}
      </div>

      <p>
        <button className={mic.recording ? "rec" : ""} {...mic.props}>🎤 Hold &amp; say “order 104 ready” / “dosa ready”</button>{" "}
        <span aria-live="polite" className="mut">{heard}</span>
      </p>

      <div className="grid">
        {data.orders.map((o) => {
          const since = o.startedAt ?? o.paidAt ?? now;
          return (
            <div key={o.id} className={`o ${o.status} ${o === first ? "first" : ""}`}>
              <span className={`t ${o.status === "cooking" && now - since > 600000 ? "late" : ""}`}>{mmss(now - since)}</span>
              <b className="n">#{o.number}</b>{o.table && <span className="tag">table {o.table}</span>}
              {o.lines.map((l) => {
                const done = (l.done ?? 0) >= l.qty;
                return (
                  <div key={l.id} className={`ln ${done ? "done" : ""}`}>
                    <span>{fmtQty(l.done ?? 0, l.unit)}/{fmtQty(l.qty, l.unit)} × {l.name}{l.note && <b title="note"> 📝{l.note}</b>}{l.chefId && <span className="tag">{chefName(l.chefId)}</span>}</span>
                    {o.status === "cooking" && !done && <button className="ghost" aria-label={`Mark ${l.name} done`} onClick={() => void send({ number: o.number, lineId: l.id })}>✓</button>}
                  </div>
                );
              })}
              <div className="mut">{o === first ? "← oldest" : o.status}</div>
              <p>
                {o.status === "cooking"
                  ? <button onClick={() => void send({ number: o.number })}>Order ready</button>
                  : (data.payAfter || o.payLater) && !o.paidAt
                    ? <><span className="mut">₹{o.total} · pay at counter</span> <button className="ghost" onClick={() => void cash(o)}>💵 Cash received</button></>
                    : <button className="ghost" onClick={() => void deliver(o)}>Picked up ✔</button>}
              </p>
            </div>
          );
        })}
        {!data.orders.length && <p className="mut">No active orders.</p>}
      </div>
    </div>
  );
}
