"use client";
import { useEffect, useState } from "react";

interface ShopRow { id: string; name: string; code: string; profile: string; ordersToday: number; revenueToday: number; ordersTotal: number; usage?: { today?: { stt?: number } } }

/** Platform operator view: every shop with today's numbers. Needs the server's ADMIN_KEY. */
export default function Admin() {
  const [key, setKey] = useState("");
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [message, setMessage] = useState("");

  async function load(k = key) {
    try { sessionStorage.setItem("ak", k); } catch { /* storage blocked */ }
    const r = await fetch("/api/admin/shops", { headers: { "x-admin-key": k } });
    const d = await r.json();
    if (d.error) { setMessage(d.error); setShops([]); return; }
    setShops([...d.shops].sort((a: ShopRow, b: ShopRow) => b.ordersToday - a.ordersToday));
    setMessage(`${d.shops.length} shops · ${d.loaded} loaded in memory`);
  }
  useEffect(() => {
    let saved = ""; try { saved = sessionStorage.getItem("ak") ?? ""; } catch { /* ignore */ }
    if (saved) { setKey(saved); void load(saved); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main id="main" className="page" tabIndex={-1}>
      <h1>🛰 Chitragupta · all shops</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <input type="password" placeholder="Admin key" aria-label="Admin key" value={key} onChange={(e) => setKey(e.target.value)} />
        <button type="submit">Load</button>
      </form>
      <p className="mut" aria-live="polite">{message}</p>
      <table>
        <thead><tr><th>Shop</th><th>Type</th><th>Orders today</th><th>Revenue today</th><th>Voice calls today</th><th>Total orders</th></tr></thead>
        <tbody>
          {shops.map((s) => (
            <tr key={s.id}>
              <td>{s.name}<br /><span className="mut">{s.code}</span></td><td>{s.profile}</td><td>{s.ordersToday}</td>
              <td>₹{s.revenueToday}</td><td>{s.usage?.today?.stt ?? 0}</td><td>{s.ordersTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
