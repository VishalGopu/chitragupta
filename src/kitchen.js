// Kitchen scheduler. Chefs are configured (count, language, dishes). Each online chef holds ONE task at a time.
//  mode "station": a task = one dish line of one order. Oldest orders first. Per chef, in this order of preference:
//                    1. dishes they OWN  2. dishes they ALSO help with when idle  3. any dish (if "help with anything" is on)
//  mode "order":   a task = a whole order (oldest first, any idle chef).
// Finishing a task frees the chef and the scheduler immediately hands them the next one.
// A chef can TRANSFER the current task: to a specific online chef (it waits for them if they are busy) or to "anyone else".
import { orders, kitchenState as K, persist, finish, menu } from "./orders.js";
const need = (l) => Math.round((l.qty - (l.done || 0)) * 100) / 100;
const lineView = (l) => ({ id: l.id, name: l.name, qty: need(l), total: l.qty, done: l.done || 0, unit: l.unit, note: l.note, unavailable: !!l.unavailable });
const LANGS = new Set(["en-IN", "hi-IN", "te-IN"]);
const dishes = () => new Set(menu.items.map((i) => i.id));
const cooking = () => orders.filter((o) => o.status === "cooking").sort((a, b) => (a.startedAt || a.paidAt) - (b.startedAt || b.paidAt));
const find = (id) => K.chefs.find((c) => c.id === id);

export function chefsView() {
  return K.chefs.map((c) => {
    const o = c.task && orders.find((x) => x.number === c.task.number);
    const items = o ? o.lines.filter((l) => c.task.lineIds.includes(l.id)).map(lineView) : [];
    const queued = [];                                   // transferred to this chef, waiting until they are free
    for (const x of orders) { const ls = x.status === "cooking" ? x.lines.filter((l) => l.pinTo === c.id && need(l) > 0 && !l.chefId) : []; if (ls.length) queued.push({ number: x.number, from: ls[0].pinFrom || "", items: ls.map(lineView) }); }
    return { id: c.id, name: c.name, lang: c.lang, skills: c.skills, also: c.also, helpAny: c.helpAny, online: c.online, task: c.task ? { number: c.task.number, since: c.task.since, table: o?.table, items } : null, queued };
  });
}
export const kitchenView = () => ({ mode: K.mode, chefs: chefsView(), fulfil: menu.fulfil, words: menu.words });

function release(c) {
  if (c.task) { const o = orders.find((x) => x.number === c.task.number); o?.lines.forEach((l) => { if (l.chefId === c.id) l.chefId = null; }); c.task = null; }
}
// drop finished tasks, stale assignments, and transfers aimed at a chef who is gone/offline
export function sync() {
  for (const c of K.chefs) if (c.task) {
    const o = orders.find((x) => x.number === c.task.number); const ls = o ? o.lines.filter((l) => c.task.lineIds.includes(l.id)) : [];
    if (!o || o.status !== "cooking" || ls.every((l) => need(l) <= 0)) { ls.forEach((l) => { if (l.chefId === c.id) l.chefId = null; }); c.task = null; }
  }
  for (const o of orders) for (const l of o.lines) {
    if (l.chefId && !K.chefs.some((c) => c.id === l.chefId && c.task?.number === o.number)) l.chefId = null;
    if (l.pinTo && !K.chefs.some((c) => c.id === l.pinTo && c.online)) { delete l.pinTo; delete l.pinFrom; }
  }
}

// Hand out tasks to idle online chefs. Returns the new assignments so the server can speak them to the right devices.
export function schedule() {
  sync(); const out = [];
  const idle = () => K.chefs.filter((c) => c.online && !c.task);
  const assign = (c, o, ls) => {
    const from = ls.find((l) => l.pinFrom)?.pinFrom || "";
    ls.forEach((l) => { l.chefId = c.id; delete l.pinTo; delete l.pinFrom; delete l.avoid; }); c.task = { number: o.number, lineIds: ls.map((l) => l.id), since: Date.now() };
    out.push({ chefId: c.id, name: c.name, lang: c.lang, number: o.number, whole: K.mode === "order", from, items: ls.map(lineView) });
  };
  // a chef is allowed unless the task was just transferred away from them — and that only holds while someone else is online
  const allowed = (c, ls) => !ls.some((l) => (l.avoid || []).includes(c.id)) || !K.chefs.some((x) => x.online && x.id !== c.id && !ls.some((l) => (l.avoid || []).includes(x.id)));
  const pinnedTo = (ls) => ls.find((l) => l.pinTo)?.pinTo;
  if (K.mode === "order") {
    for (const o of cooking()) {
      const ls = o.lines.filter((l) => need(l) > 0); if (!ls.length || ls.some((l) => l.chefId)) continue;
      const pin = pinnedTo(ls); const c = pin ? idle().find((x) => x.id === pin) : idle().find((x) => allowed(x, ls));
      if (c) assign(c, o, ls);
    }
  } else {
    const tasks = []; for (const o of cooking()) for (const l of o.lines) if (need(l) > 0 && !l.chefId) tasks.push({ o, l });
    let left = [];
    for (const t of tasks) {                                                                       // 0. transferred to a specific chef
      if (!t.l.pinTo) { left.push(t); continue; }
      const c = idle().find((x) => x.id === t.l.pinTo); if (c) assign(c, t.o, [t.l]);
    }
    const free = left; left = [];
    const pick = (t, match) => idle().find((c) => allowed(c, [t.l]) && match(c));
    for (const t of free) { const c = pick(t, (c) => c.skills.includes(t.l.id)); c ? assign(c, t.o, [t.l]) : left.push(t); }          // 1. owns the dish
    const l2 = left; left = []; for (const t of l2) { const c = pick(t, (c) => c.also.includes(t.l.id)); c ? assign(c, t.o, [t.l]) : left.push(t); }   // 2. also helps with it
    for (const t of left) { const c = pick(t, (c) => c.helpAny); if (c) assign(c, t.o, [t.l]); }                                       // 3. anyone allowed to help
  }
  if (out.length) persist(); return out;
}

export function completeTask(chefId) {
  const c = find(chefId); if (!c?.task) return null;
  const o = orders.find((x) => x.number === c.task.number); if (!o) { c.task = null; return null; }
  o.lines.filter((l) => c.task.lineIds.includes(l.id)).forEach((l) => { l.done = l.qty; l.chefId = null; });
  c.task = null; const completed = finish(o); persist(); return { order: o, completed };
}

// Hand the current task to another chef ("to" = chef id) or back to the pool for anyone else ("any").
export function transferTask(fromId, to) {
  const c = find(fromId); if (!c?.task) return { error: "no active task" };
  let target = null;
  if (to !== "any") { target = find(to); if (!target || !target.online || target.id === fromId) return { error: "that chef is not on shift" }; }
  else if (!K.chefs.some((x) => x.online && x.id !== fromId)) return { error: "no other chef is on shift" };
  const o = orders.find((x) => x.number === c.task.number);
  const lines = o ? o.lines.filter((l) => c.task.lineIds.includes(l.id)) : [];
  lines.forEach((l) => { l.chefId = null; if (target) { l.pinTo = target.id; l.pinFrom = c.name; } else { l.avoid = [...new Set([...(l.avoid || []), fromId])]; l.pinFrom = c.name; } });
  const items = lines.map(lineView), number = c.task.number; c.task = null; persist();
  return { ok: true, target: target?.id || null, targetName: target?.name || null, number, items };
}

export function setOnline(chefId, on) { const c = find(chefId); if (!c) return false; c.online = !!on; if (!on) release(c); persist(); return true; }
export function freeChef(chefId) { const c = find(chefId); if (!c) return false; release(c); persist(); return true; }   // manager "reassign"

export function setKitchen({ mode, chefs }) {
  if (menu.fulfil === "pack") mode = "order";   // pickers always take whole slips
  if ((mode === "station" || mode === "order") && mode !== K.mode) { K.chefs.forEach(release); K.mode = mode; }
  if (Array.isArray(chefs)) {
    const next = []; const used = new Set();
    chefs.slice(0, 12).forEach((c, i) => {
      let id = c.id && !used.has(c.id) ? c.id : null; if (!id) { let n = 1; while (used.has("c" + n) || K.chefs.some((x) => x.id === "c" + n && x.id !== c.id)) n++; id = "c" + n; }
      used.add(id); const old = find(id); const dset = dishes(), skills = [...new Set((c.skills || []).filter((d) => dset.has(d)))];
      next.push({ id, name: String(c.name || `Chef ${i + 1}`).slice(0, 30), lang: LANGS.has(c.lang) ? c.lang : "en-IN", skills,
        also: [...new Set((c.also || []).filter((d) => dset.has(d) && !skills.includes(d)))], helpAny: c.helpAny !== false, online: old?.online || false, task: old?.task || null });
    });
    K.chefs.filter((c) => !used.has(c.id)).forEach(release);
    K.chefs = next;
  }
  persist(); return kitchenView();
}
