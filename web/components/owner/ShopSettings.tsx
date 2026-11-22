"use client";
import { useEffect, useState } from "react";
import { get, post } from "@/lib/api";
import type { Config, MenuItem, Profile } from "@/lib/types";

const UNITS = ["plate", "piece", "cup", "glass", "packet", "kg", "litre"];
const stepFor = (u?: string) => (u === "kg" || u === "litre" ? 0.5 : 1);
type Draft = Omit<MenuItem, "aliases"> & { aliases: string[] | string };

/** Shop type and the editable catalog (name, unit, price, stock, spoken aliases). */
export default function ShopSettings({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [items, setItems] = useState<Draft[]>([]);
  const [shopType, setShopType] = useState(profile.id);
  const [note, setNote] = useState(""); const [saved, setSaved] = useState("");

  useEffect(() => { get<Config>("/api/config").then((c) => setItems(c.menu.items.map((i) => ({ ...i, aliases: [...(i.aliases ?? [])] })))).catch(() => {}); }, []);
  const edit = (n: number, patch: Partial<Draft>) => setItems((list) => list.map((it, i) => (i === n ? { ...it, ...patch } : it)));
  const pack = profile.fulfil === "pack";

  async function changeType(id: string) {
    setShopType(id);
    const r = await post<{ error?: string }>("/api/shop", { profile: id });
    if (r.error) { setNote(r.error); setShopType(profile.id); return; }
    location.reload();
  }
  async function save() {
    try {
      const body = items.filter((i) => i.name.trim()).map((i) => ({ ...i, aliases: typeof i.aliases === "string" ? i.aliases.split(",") : i.aliases }));
      const r = await post<{ error?: string; menu: { items: MenuItem[] } }>("/api/catalog", { items: body });
      if (r.error) throw new Error(r.error);
      setItems(r.menu.items.map((i) => ({ ...i, aliases: [...(i.aliases ?? [])] }))); setSaved("Saved ✔ " + new Date().toLocaleTimeString()); onSaved();
    } catch (e) { setSaved("Failed: " + (e instanceof Error ? e.message : e)); }
  }

  return (
    <section aria-label="Shop settings">
      <p>
        <label className="mut">Shop type&nbsp;
          <select value={shopType} onChange={(e) => void changeType(e.target.value)}>
            {profile.shops.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>{" "}
        <span className="mut">{note || `${profile.payWhen === "after" ? "customer pays after the order is ready" : "customer pays first"} · ${pack ? "slips go to a picker" : "orders go to the kitchen"}`}</span>
      </p>
      {items.map((i, n) => (
        <div key={i.id ?? n} className="it">
          <input value={i.name} onChange={(e) => edit(n, { name: e.target.value })} placeholder="Item name" aria-label="Item name" />
          <select value={i.unit} onChange={(e) => edit(n, { unit: e.target.value, step: stepFor(e.target.value) })} aria-label="Unit">{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          <input type="number" min={0} value={i.price} onChange={(e) => edit(n, { price: +e.target.value })} aria-label="Price per unit in rupees" />
          <input type="number" min={0} step="any" value={i.stock ?? ""} placeholder="stock" aria-label="Stock left (blank means not tracked)" onChange={(e) => edit(n, { stock: e.target.value === "" ? null : +e.target.value })} />
          <button className="ghost" aria-label={`Remove ${i.name || "item"}`} onClick={() => setItems((l) => l.filter((_, k) => k !== n))}>✕</button>
          <input className="al" value={Array.isArray(i.aliases) ? i.aliases.join(", ") : i.aliases} onChange={(e) => edit(n, { aliases: e.target.value })} placeholder="Other names people say (comma separated)" aria-label="Other names people say (comma separated)" />
        </div>
      ))}
      <p>
        <button className="ghost" onClick={() => setItems((l) => [...l, { id: "", name: "", unit: pack ? "packet" : "plate", step: 1, price: 0, stock: null, aliases: [] }])}>＋ Add item</button>{" "}
        <button onClick={() => void save()}>Save catalog</button> <span className="mut" aria-live="polite">{saved}</span>
      </p>
      <p className="mut">Stock: leave blank if you don&apos;t track an item. Names people say (aliases) help voice ordering — separate with commas, any language.</p>
    </section>
  );
}
