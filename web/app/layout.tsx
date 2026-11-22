import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Chitragupta for Shops", template: "%s · Chitragupta" },
  description: "A voice-first AI business partner for small shops, in the owner's own language. Built on Gemini and Firestore.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1220" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
