// Quantity formatting shared with the backend (public text). Weight/volume units shrink to g/ml under 1; count units stay plain.
import type { Line, MenuItem } from "./types";

const r2 = (x: number) => Math.round(x * 100) / 100;

export function fmtQty(q: number, unit?: string, speak = false): string {
  q = r2(+q || 0);
  if (unit === "kg") return q < 1 ? `${Math.round(q * 1000)} ${speak ? "grams" : "g"}` : `${q} ${speak ? "kilo" : "kg"}`;
  if (unit === "litre") return q < 1 ? `${Math.round(q * 1000)} ${speak ? "millilitres" : "ml"}` : `${q} ${speak ? (q === 1 ? "litre" : "litres") : "L"}`;
  if (unit === "packet") return `${q} ${q === 1 ? "packet" : "packets"}`;
  return String(q);
}
export const lineText = (l: Pick<Line, "qty" | "unit" | "name" | "note">, speak = false) =>
  `${fmtQty(l.qty, l.unit, speak)} ${l.name}${l.note ? ` (${l.note})` : ""}`;
export const unitPrice = (i: Pick<MenuItem, "price" | "unit">) =>
  `₹${i.price}${i.unit && !["plate", "piece", "cup", "glass"].includes(i.unit) ? "/" + i.unit : ""}`;
export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
