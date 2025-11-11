type FlagOptions = {
  default?: boolean;
};

function toBool(value: string | undefined, { default: fallback = true }: FlagOptions = {}): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  return fallback;
}

export const RELEASE_FLAGS = {
  showReceptionDemo: toBool(process.env.NEXT_PUBLIC_SHOW_RECEPTION_DEMO, { default: true }),
  showQualityGates: toBool(process.env.NEXT_PUBLIC_SHOW_QUALITY_GATES, { default: true }),
  showLaunchGuardrails: toBool(process.env.NEXT_PUBLIC_SHOW_LAUNCH_GUARDRAILS, { default: true }),
  showPricingCta: toBool(process.env.NEXT_PUBLIC_SHOW_PRICING_CTA, { default: true }),
};

export type ReleaseFlags = typeof RELEASE_FLAGS;


