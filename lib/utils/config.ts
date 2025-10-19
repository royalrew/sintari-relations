import systemConfig from "../config/system.json" assert { type: "json" };

export interface SystemConfig {
  system_version: string;
  ai_chain_version: string;
  schema_version: string;
  description: string;
}

/**
 * Loads system configuration
 */
export function getSystemConfig(): SystemConfig {
  return systemConfig as SystemConfig;
}

/**
 * Gets current system version
 */
export function getSystemVersion(): string {
  return getSystemConfig().system_version;
}

/**
 * Gets current AI chain version
 */
export function getAIChainVersion(): string {
  return getSystemConfig().ai_chain_version;
}
