import { pickFarewell } from "@/lib/copy/warm_sv";

import type { WarmCopyCtx } from "@/lib/copy/warm_sv";

export type OutroCtx = WarmCopyCtx;

export function composeOutro(ctx: OutroCtx) {
  return pickFarewell(ctx);
}
