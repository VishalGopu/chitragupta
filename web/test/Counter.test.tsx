import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Counter from "@/components/Counter";
import { mockApi, stubEventSource } from "./helpers";

const CONFIG = {
  menu: { shop: "Test Canteen", items: [
    { id: "dosa", name: "Masala Dosa", price: 60, unit: "plate", step: 1 },
    { id: "chai", name: "Chai", price: 10, unit: "cup", step: 1 },
    { id: "coffee", name: "Cold Coffee", price: 40, unit: "glass", step: 1, soldOut: true },
  ] },
  profile: { id: "canteen", payWhen: "before", words: {}, shops: [] }, mock: true, gemini: true, parser: "gemini",
};
const turnReply = (body: unknown) => {
  const b = body as { cart: { id: string; qty: number }[]; add?: { id: string; qty: number }; text?: string };
  const cart = b.add ? [...b.cart, { id: b.add.id, qty: b.add.qty }] : b.cart;
  return { reply: "Got it.", lang: "en-IN", cart, lines: [], total: 0, action: "none", heard: b.text };
};

beforeEach(() => { stubEventSource(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Counter", () => {
  it("renders the catalog, with sold-out items disabled", async () => {
    mockApi({ "GET /api/config": CONFIG, "GET /api/kitchen": { orders: [], chefs: [], mode: "station" } });
    render(<Counter />);
    expect(await screen.findByRole("heading", { name: /Test Canteen/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Masala Dosa/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Cold Coffee/ })).toBeDisabled();
  });

  it("tapping an item sends it to the server and prices the cart from the catalog", async () => {
    const calls = mockApi({ "GET /api/config": CONFIG, "GET /api/kitchen": { orders: [], chefs: [], mode: "station" }, "POST /api/turn": turnReply });
    render(<Counter />);
    await userEvent.click(await screen.findByRole("button", { name: /Masala Dosa/ }));
    await waitFor(() => expect(screen.getByLabelText("Increase Masala Dosa")).toBeInTheDocument());
    expect(calls.find((c) => c.key === "POST /api/turn")?.body).toMatchObject({ add: { id: "dosa", qty: 1 } });
    expect(screen.getByText("Total ₹60")).toBeInTheDocument();
  });

  it("increase and remove edit the cart locally", async () => {
    mockApi({ "GET /api/config": CONFIG, "GET /api/kitchen": { orders: [], chefs: [], mode: "station" }, "POST /api/turn": turnReply });
    render(<Counter />);
    await userEvent.click(await screen.findByRole("button", { name: /Chai/ }));
    await userEvent.click(await screen.findByLabelText("Increase Chai"));
    expect(await screen.findByText("Total ₹20")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Remove Chai"));
    await waitFor(() => expect(screen.getByText("Empty")).toBeInTheDocument());
  });

  it("checkout shows the UPI QR with an accessible description", async () => {
    mockApi({
      "GET /api/config": CONFIG, "GET /api/kitchen": { orders: [], chefs: [], mode: "station" }, "POST /api/turn": turnReply,
      "POST /api/checkout": { order: { id: "ORD101", number: 101, total: 10 }, qr: "data:image/svg+xml;base64,AAAA" },
      "GET /api/order/ORD101": { order: { id: "ORD101", number: 101, status: "awaiting_payment" } },
    });
    render(<Counter />);
    await userEvent.click(await screen.findByRole("button", { name: /Chai/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Pay with UPI" }));
    const img = await screen.findByAltText("UPI QR code for this order");
    expect(img).toHaveAttribute("src", "data:image/svg+xml;base64,AAAA");
    expect(within(document.body).getByRole("button", { name: /Simulate payment/ })).toBeInTheDocument();
  });
});
