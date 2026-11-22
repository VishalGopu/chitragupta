import type { NextConfig } from "next";

// Static export: `next build` writes plain files to web/out, which the Node backend serves next to /api.
const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
};
export default config;
