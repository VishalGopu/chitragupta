import type { Metadata } from "next";
import Counter from "@/components/Counter";
import RoleGate from "@/components/RoleGate";

export const metadata: Metadata = { title: "Counter" };
export default function Page() { return <RoleGate role="counter"><Counter /></RoleGate>; }
