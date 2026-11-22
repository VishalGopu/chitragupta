import type { Metadata } from "next";
import Owner from "@/components/Owner";
import RoleGate from "@/components/RoleGate";

export const metadata: Metadata = { title: "Owner" };
export default function Page() { return <RoleGate role="owner"><Owner /></RoleGate>; }
