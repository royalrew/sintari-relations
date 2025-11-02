/**
 * Telemetry Logger - Logs pipeline metrics for observability
 */
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export interface TelemetryData {
  run_id: string;
  timestamp: string;
  payload: {
    lang: string;
    clean_text_len: number;
  };
  consent: {
    verified: boolean;
  };
  export: {
    backend_used: string;
    pdf_exists: boolean;
  };
  diag_errors_count: number;
  level: "INFO" | "WARN" | "ERROR";
}

export async function logTelemetry(
  data: TelemetryData,
  outDir: string = "out"
): Promise<void> {
  try {
    await mkdir(outDir, { recursive: true });
    const telemetryPath = join(outDir, "telemetry.json");
    
    // Determine level
    let level: "INFO" | "WARN" | "ERROR" = "INFO";
    if (data.payload.clean_text_len === 0) {
      level = "ERROR";
    } else if (data.diag_errors_count > 0) {
      level = "ERROR";
    } else if (!data.export.pdf_exists && data.export.backend_used === "libreoffice") {
      level = "WARN";
    }
    
    data.level = level;
    
    await writeFile(
      telemetryPath,
      JSON.stringify(data, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error("[Telemetry] Failed to write telemetry:", error);
    // Non-blocking - don't fail the pipeline
  }
}

