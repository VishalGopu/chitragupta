// Payment adapter (demo). Generates a UPI QR for the order and treats an order as paid only after the server-side flag is set
// (the "simulate payment" button); the client's word is never trusted. A real UPI/payment gateway plugs in behind these two functions.
import QRCode from "qrcode";
import { menu } from "./orders.js";
// SVG, not PNG: far cheaper to produce, so QR generation never dominates the server CPU when many shops check out at once
const qrImage = async (text) => "data:image/svg+xml;base64," + Buffer.from(await QRCode.toString(text, { type: "svg", margin: 2, errorCorrectionLevel: "M" })).toString("base64");

export async function createQr(order) {
  return qrImage(`upi://pay?pa=demo@upi&pn=${encodeURIComponent(menu.shop)}&am=${order.total.toFixed(2)}&cu=INR&tn=${order.id}`);
}
/** True only when payment is confirmed server-side. */
export async function verifyPaid(order) { return order.mockPaid === true; }
export const isMock = () => true;
