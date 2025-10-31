import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Set the correct root to avoid workspace warnings
  outputFileTracingRoot: path.join(__dirname),
  // Make pdfkit external so it uses node_modules directly (not bundled)
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
