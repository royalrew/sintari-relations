/**
 * Memory V2 Feature Flag Management
 * Handles canary rollout and kill-switch
 */

export interface MemoryConfig {
  enabled: boolean;
  canaryPercent: number;
  piiMaskRequired: boolean;
}

export function getMemoryConfig(): MemoryConfig {
  const memoryV2 = process.env.MEMORY_V2;
  const canaryPercent = parseInt(process.env.MEMORY_V2_CANARY || '0', 10);
  
  // Hard kill-switch: MEMORY_V2=0 always disables
  if (memoryV2 === '0' || memoryV2 === 'false' || memoryV2 === 'off') {
    return {
      enabled: false,
      canaryPercent: 0,
      piiMaskRequired: true,
    };
  }
  
  // Explicit enable: MEMORY_V2=1
  if (memoryV2 === '1' || memoryV2 === 'true' || memoryV2 === 'on') {
    return {
      enabled: true,
      canaryPercent: 100,
      piiMaskRequired: true,
    };
  }
  
  // Canary mode: check if request should get memory
  if (canaryPercent > 0) {
    const random = Math.random() * 100;
    const enabled = random < canaryPercent;
    
    return {
      enabled,
      canaryPercent,
      piiMaskRequired: true,
    };
  }
  
  // Default: disabled
  return {
    enabled: false,
    canaryPercent: 0,
    piiMaskRequired: true,
  };
}

export function shouldUseMemory(threadId?: string): boolean {
  const config = getMemoryConfig();
  
  if (!config.enabled) {
    return false;
  }
  
  // Additional checks can be added here (e.g., tenant-based, A/B test)
  return true;
}

