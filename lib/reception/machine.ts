export type ReceptionState =
  | "IDLE" // första turen visas
  | "LISTEN" // lyssna, spegla
  | "OFFER_PATH" // erbjud valbara vägar (chips)
  | "LIGHT_ANALYSIS_OK" // readiness medel → erbjud lätt föranalys
  | "FULL_ANALYSIS_READY" // readiness hög → erbjud full
  | "SILENT_OK"; // tyst läge bekräftat

export type Event =
  | { type: "USER_MESSAGE"; text: string }
  | { type: "CLICK_CHIP"; id: "free" | "suggest" | "skip" | "light" | "full" }
  | { type: "READINESS"; score01: number }
  | { type: "TIMEOUT" };

export type Ctx = {
  userMsgs: number;
  lastAskedAt?: number;
  readiness: number; // 0..1
};

export function step(state: ReceptionState, ctx: Ctx, ev: Event): { state: ReceptionState; ctx: Ctx } {
  switch (state) {
    case "IDLE":
      if (ev.type === "USER_MESSAGE") return { state: "LISTEN", ctx: { ...ctx, userMsgs: ctx.userMsgs + 1 } };
      return { state, ctx };

    case "LISTEN":
      if (ev.type === "USER_MESSAGE") {
        const userMsgs = ctx.userMsgs + 1;
        return { state: userMsgs >= 2 ? "OFFER_PATH" : "LISTEN", ctx: { ...ctx, userMsgs } };
      }
      if (ev.type === "READINESS") {
        const readiness = ev.score01;
        if (readiness >= 0.8) return { state: "FULL_ANALYSIS_READY", ctx: { ...ctx, readiness } };
        if (readiness >= 0.5) return { state: "LIGHT_ANALYSIS_OK", ctx: { ...ctx, readiness } };
        return { state, ctx: { ...ctx, readiness } };
      }
      if (ev.type === "CLICK_CHIP" && ev.id === "skip") return { state: "SILENT_OK", ctx };
      return { state, ctx };

    case "OFFER_PATH":
      if (ev.type === "CLICK_CHIP" && ev.id === "suggest") return { state: "OFFER_PATH", ctx };
      if (ev.type === "CLICK_CHIP" && ev.id === "free") return { state: "LISTEN", ctx };
      if (ev.type === "READINESS") {
        const readiness = ev.score01;
        if (readiness >= 0.8) return { state: "FULL_ANALYSIS_READY", ctx: { ...ctx, readiness } };
        if (readiness >= 0.5) return { state: "LIGHT_ANALYSIS_OK", ctx: { ...ctx, readiness } };
        return { state, ctx: { ...ctx, readiness } };
      }
      if (ev.type === "USER_MESSAGE") return { state: "LISTEN", ctx: { ...ctx, userMsgs: ctx.userMsgs + 1 } };
      return { state, ctx };

    case "LIGHT_ANALYSIS_OK":
      if (ev.type === "CLICK_CHIP" && ev.id === "light") return { state: "LISTEN", ctx };
      if (ev.type === "READINESS" && ev.score01 >= 0.8)
        return { state: "FULL_ANALYSIS_READY", ctx: { ...ctx, readiness: ev.score01 } };
      if (ev.type === "USER_MESSAGE") return { state: "LISTEN", ctx: { ...ctx, userMsgs: ctx.userMsgs + 1 } };
      return { state, ctx };

    case "FULL_ANALYSIS_READY":
      if (ev.type === "CLICK_CHIP" && ev.id === "full") return { state: "LISTEN", ctx };
      if (ev.type === "USER_MESSAGE") return { state: "LISTEN", ctx: { ...ctx, userMsgs: ctx.userMsgs + 1 } };
      return { state, ctx };

    case "SILENT_OK":
      if (ev.type === "USER_MESSAGE") return { state: "LISTEN", ctx: { ...ctx, userMsgs: ctx.userMsgs + 1 } };
      if (ev.type === "TIMEOUT") return { state: "SILENT_OK", ctx }; // gör inget – tystnad är OK
      return { state, ctx };
  }
}

