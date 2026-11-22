"use client";
import { useEffect, useState } from "react";
import { get, post } from "@/lib/api";
import type { Config, Lang, MenuItem, Profile } from "@/lib/types";

interface ChefDraft { id?: string; name: string; lang: Lang; skills: string[]; also: string[]; helpAny: boolean }
interface Setup { mode: "station" | "order"; chefs: ChefDraft[] }
const LANGS: [Lang, string][] = [["en-IN", "English"], ["hi-IN", "हिन्दी"], ["te-IN", "తెలుగు"]];
const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/** Team setup: who works the kitchen (or packs slips), their language, and which dishes each one owns. */
export default function KitchenSetup({ profile }: { profile: Profile }) {
  const [setup, setSetup] = useState<Setup>({ mode: "station", chefs: [] });
  const [dishes, setDishes] = useState<MenuItem[]>([]);
  const [saved, setSaved] = useState("");
  const pack = profile.fulfil === "pack", words = profile.words ?? {};

  useEffect(() => {
    (async () => {
      try {
        const k = await get<Setup>("/api/kitchen/config");
        setSetup({ mode: k.mode, chefs: k.chefs.map((c) => ({ ...c, skills: c.skills ?? [], also: c.also ?? [], helpAny: c.helpAny !== false })) });
        setDishes((await get<Config>("/api/config")).menu.items);
      } catch { /* leave empty */ }
    })();
  }, []);

  const editChef = (i: number, patch: Partial<ChefDraft>) => setSetup((s) => ({ ...s, chefs: s.chefs.map((c, k) => (k === i ? { ...c, ...patch } : c)) }));
  async function save() {
    try {
      const r = await post<Setup & { error?: string }>("/api/kitchen/config", { mode: setup.mode, chefs: setup.chefs.map(({ id, name, lang, skills, also, helpAny }) => ({ id, name, lang, skills, also, helpAny })) });
      if (r.error) throw new Error(r.error);
      setSetup({ mode: r.mode, chefs: r.chefs.map((c) => ({ ...c, skills: c.skills ?? [], also: c.also ?? [], helpAny: c.helpAny !== false })) });
      setSaved("Saved ✔ " + new Date().toLocaleTimeString());
    } catch (e) { setSaved("Failed: " + (e instanceof Error ? e.message : e)); }
  }

  return (
    <section aria-label="Kitchen setup">
      <h2>{pack ? "🧺 " : "👨‍🍳 "}{words.setup ?? "Kitchen setup"}</h2>
      <p className="mut">Each person gets one task at a time on their own phone, spoken to them. Finishing a task gives them the next one.</p>
      {!pack && (
        <p><label className="mut">How work is split&nbsp;
          <select value={setup.mode} onChange={(e) => setSetup({ ...setup, mode: e.target.value as Setup["mode"] })}>
            <option value="station">By item — chefs own dishes, help others when free</option>
            <option value="order">By order — one chef cooks a whole order</option>
          </select>
        </label></p>
      )}
      {setup.chefs.map((c, i) => (
        <div key={c.id ?? i} className="crow">
          <div className="r1">
            <input value={c.name} onChange={(e) => editChef(i, { name: e.target.value })} placeholder="Name" aria-label="Name" />
            <select value={c.lang} onChange={(e) => editChef(i, { lang: e.target.value as Lang })} aria-label="Language">{LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
            <button className="ghost" aria-label={`Remove ${c.name}`} onClick={() => setSetup((s) => ({ ...s, chefs: s.chefs.filter((_, k) => k !== i) }))}>✕</button>
          </div>
          {setup.mode === "station" && !pack ? (
            <>
              <div className="mut" style={{ marginTop: 10 }}>Owns — cooks these first:</div>
              <div className="sk">{dishes.map((d) => <button key={d.id} className={c.skills.includes(d.id) ? "on" : ""} aria-pressed={c.skills.includes(d.id)}
                onClick={() => editChef(i, { skills: toggle(c.skills, d.id), also: c.also.filter((x) => x !== d.id) })}>{d.name}</button>)}</div>
              <div className="mut" style={{ marginTop: 10 }}>Also cooks when idle — second choice:</div>
              <div className="sk">
                {dishes.filter((d) => !c.skills.includes(d.id)).map((d) => <button key={d.id} className={c.also.includes(d.id) ? "on" : ""} aria-pressed={c.also.includes(d.id)}
                  onClick={() => editChef(i, { also: toggle(c.also, d.id) })}>{d.name}</button>)}
                {dishes.every((d) => c.skills.includes(d.id)) && <span className="mut">(owns everything)</span>}
              </div>
              <label className="mut" style={{ display: "block", marginTop: 10 }}>
                <input type="checkbox" checked={c.helpAny} onChange={(e) => editChef(i, { helpAny: e.target.checked })} /> …and any other dish if nothing above is waiting
              </label>
            </>
          ) : <div className="mut" style={{ marginTop: 8 }}>Takes whole orders, any item</div>}
        </div>
      ))}
      {!setup.chefs.length && <p className="mut">No chefs yet — add one.</p>}
      <p>
        <button className="ghost" onClick={() => setup.chefs.length < 12 && setSetup((s) => ({ ...s, chefs: [...s.chefs, { name: `${words.staff ?? "Chef"} ${s.chefs.length + 1}`, lang: "en-IN", skills: [], also: [], helpAny: true }] }))}>＋ Add team member</button>{" "}
        <button onClick={() => void save()}>Save kitchen</button> <span className="mut" aria-live="polite">{saved}</span>
      </p>
    </section>
  );
}
