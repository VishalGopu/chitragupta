import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Landing from "@/components/Landing";
import { mockApi, stubEventSource } from "./helpers";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); stubEventSource(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const MODE = { multi: true, types: [{ id: "canteen", label: "Canteen" }, { id: "kirana", label: "Kirana" }] };

describe("Landing (multi-shop)", () => {
  it("offers join, demo and create when the device is not paired", async () => {
    mockApi({ "GET /api/mode": MODE });
    render(<Landing />);
    expect(await screen.findByText("Join your shop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try the demo shop" })).toBeInTheDocument();
    expect(screen.getByLabelText("Shop type")).toHaveDisplayValue("Canteen");
  });

  it("rejects an empty shop code", async () => {
    mockApi({ "GET /api/mode": MODE });
    render(<Landing />);
    await userEvent.click(await screen.findByRole("button", { name: "Join" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the shop code");
  });

  it("the demo button stores a token for every role and shows the role tiles", async () => {
    const calls = mockApi({
      "GET /api/mode": MODE,
      "POST /api/demo": { shop: { code: "ABC123" }, tokens: { counter: "tc", kitchen: "tk", owner: "to" } },
    });
    render(<Landing />);
    await userEvent.click(await screen.findByRole("button", { name: "Try the demo shop" }));
    await waitFor(() => expect(screen.getByRole("link", { name: /Counter/ })).toBeInTheDocument());
    expect(calls.some((c) => c.key === "POST /api/demo")).toBe(true);
    expect(localStorage.getItem("code")).toBe("ABC123");
    expect(localStorage.getItem("tok_owner")).toBe("to");
    expect(localStorage.getItem("tok_kitchen")).toBe("tk");
  });

  it("shows server errors from signup", async () => {
    mockApi({ "GET /api/mode": MODE, "POST /api/shops": { error: "shop name must be 2-40 characters" } });
    render(<Landing />);
    await userEvent.click(await screen.findByRole("button", { name: "Create shop" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("shop name must be 2-40 characters");
  });
});
