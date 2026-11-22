"use client";
import { useEffect, useState, type ReactNode } from "react";
import { session } from "@/lib/api";
import type { Role } from "@/lib/types";

/**
 * Makes a page work as a deep link: it declares which role it is for, so opening /owner never uses the counter's token.
 * In multi-shop mode a device with no token for the role is sent back to the landing page to join first.
 */
export default function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (session.multi() && !session.token(role)) { location.replace("/?pick"); return; }
    session.setRole(role); setReady(true);
  }, [role]);
  return ready ? <>{children}</> : <main id="main" className="page" tabIndex={-1}><p className="mut" aria-live="polite">Loading…</p></main>;
}
