import type { NextConfig } from "next";
import path from "path";
import { config } from "dotenv";
import { existsSync } from "fs";

// Ladda .env från backend-mappen om den finns
const backendEnvPath = path.join(__dirname, "backend", ".env");
if (existsSync(backendEnvPath)) {
  config({ path: backendEnvPath });
  console.log("📁 Laddade miljövariabler från backend/.env");
}

const nextConfig: NextConfig = {
  // Set the correct root to avoid workspace warnings
  outputFileTracingRoot: path.join(__dirname),
  // Make pdfkit external so it uses node_modules directly (not bundled)
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
