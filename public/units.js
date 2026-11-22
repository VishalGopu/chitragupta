// Quantity formatting shared by the server and the pages. Weight/volume units shrink to g/ml under 1; count units stay plain.
const r2 = (x) => Math.round(x * 100) / 100;
export function fmtQty(q, unit, speak = false) {
  q = r2(+q || 0);
  if (unit === "kg") return q < 1 ? `${Math.round(q * 1000)} ${speak ? "grams" : "g"}` : `${q} ${speak ? "kilo" : "kg"}`;
  if (unit === "litre") return q < 1 ? `${Math.round(q * 1000)} ${speak ? "millilitres" : "ml"}` : `${q} ${speak ? (q === 1 ? "litre" : "litres") : "L"}`;
  if (unit === "packet") return `${q} ${q === 1 ? "packet" : "packets"}`;
  return String(q);
}
export const lineText = (l, speak = false) => `${fmtQty(l.qty, l.unit, speak)} ${l.name}${l.note ? ` (${l.note})` : ""}`;
export const unitPrice = (i) => `₹${i.price}${i.unit && !["plate", "piece", "cup", "glass"].includes(i.unit) ? "/" + i.unit : ""}`;
