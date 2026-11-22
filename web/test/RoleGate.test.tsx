import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import RoleGate from "@/components/RoleGate";

const replace = vi.fn();
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); replace.mockReset();
  vi.stubGlobal("location", { ...window.location, replace, pathname: "/owner" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("RoleGate", () => {
  it("single-shop installs need no token: renders and records the role", async () => {
    render(<RoleGate role="owner"><p>owner page</p></RoleGate>);
    expect(await screen.findByText("owner page")).toBeInTheDocument();
    expect(sessionStorage.getItem("role")).toBe("owner");
  });
  it("multi-shop with the role's token renders, and overrides a different remembered role", async () => {
    localStorage.setItem("multi", "1"); localStorage.setItem("tok_owner", "t"); sessionStorage.setItem("role", "counter");
    render(<RoleGate role="owner"><p>owner page</p></RoleGate>);
    expect(await screen.findByText("owner page")).toBeInTheDocument();
    expect(sessionStorage.getItem("role")).toBe("owner");
  });
  it("multi-shop without a token sends the device back to join", async () => {
    localStorage.setItem("multi", "1"); localStorage.setItem("tok_counter", "t");
    render(<RoleGate role="owner"><p>owner page</p></RoleGate>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/?pick"));
    expect(screen.queryByText("owner page")).not.toBeInTheDocument();
  });
});
