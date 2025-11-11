/**
 * Utility för att ladda miljövariabler från backend/.env
 * Används i API-routes där Next.js inte automatiskt läser från backend/.env
 */
import { config } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";

let backendEnvLoaded = false;

export function loadBackendEnv() {
  if (backendEnvLoaded) {
    return; // Redan laddad
  }

  const backendEnvPath = join(process.cwd(), "backend", ".env");
  if (existsSync(backendEnvPath)) {
    config({ path: backendEnvPath });
    backendEnvLoaded = true;
    console.log("📁 Laddade miljövariabler från backend/.env");
  }
}

// Ladda automatiskt när modulen importeras
loadBackendEnv();

