import { buildGreeting } from "@/lib/copy/warm_sv";

import type { WarmCopyCtx } from "@/lib/copy/warm_sv";

export type IntroCtx = WarmCopyCtx & { turn?: number };

export function composeIntro(ctx: IntroCtx) {
  return buildGreeting(ctx);
}
