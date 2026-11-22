import type { Metadata } from "next";
import Kitchen from "@/components/Kitchen";
import RoleGate from "@/components/RoleGate";

export const metadata: Metadata = { title: "Kitchen" };
export default function Page() { return <RoleGate role="kitchen"><Kitchen /></RoleGate>; }
