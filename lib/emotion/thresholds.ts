/**
 * Emotion Thresholds Loader
 * PR4: EmpathyTone v2 Calibration
 * 
 * Safely loads and applies emotion thresholds with persona offsets
 */
import thresholdsConfig from "@/config/emotion_thresholds.json";

export type Emotion = "concern" | "warmth" | "humor" | "irony" | "anxious" | "calm";

export interface PersonaProfile {
  warmth: number;
  directness: number;
  humor: number;
}

/**
 * Get threshold for emotion type with persona offsets
 * 
 * @param emotion - Emotion type
 * @param persona - Persona profile (optional)
 * @returns Threshold value (clamped)
 */
export function thr(
  emotion: Emotion,
  persona?: PersonaProfile
): number {
  const base = thresholdsConfig.base[emotion] ?? 0.6;
  const { guards, persona_offsets: p } = thresholdsConfig;
  
  if (!persona) {
    return base;
  }
  
  // Get persona offsets
  const scale = p[emotion as keyof typeof p]?.scale ?? 0;
  const bias = p[emotion as keyof typeof p]?.bias ?? 0;
  
  // Apply persona scaling
  let personaScale = 0;
  if (emotion === "warmth") {
    personaScale = persona.warmth;
  } else if (emotion === "humor") {
    personaScale = persona.humor;
  } else {
    // More direct → lower threshold for irony
    personaScale = -persona.directness;
  }
  
  // Calculate threshold with offsets
  let v = base + bias + scale * personaScale;
  
  // Apply guards
  if (guards.clamp) {
    v = Math.min(guards.max, Math.max(guards.min, v));
  }
  
  return v;
}

/**
 * Get base threshold without persona offsets
 */
export function thrBase(emotion: Emotion): number {
  return thresholdsConfig.base[emotion] ?? 0.6;
}

/**
 * Get all thresholds for a persona profile
 */
export function getAllThresholds(persona?: PersonaProfile): Record<Emotion, number> {
  return {
    concern: thr("concern", persona),
    warmth: thr("warmth", persona),
    humor: thr("humor", persona),
    irony: thr("irony", persona),
    anxious: thr("anxious", persona),
    calm: thr("calm", persona),
  };
}

/**
 * Apply short text floor if text is too short
 */
export function applyShortTextFloor(value: number, textLength: number): number {
  const { guards } = thresholdsConfig;
  
  if (textLength < 8 && guards.short_text_floor > 0) {
    return Math.max(value, guards.short_text_floor);
  }
  
  return value;
}

