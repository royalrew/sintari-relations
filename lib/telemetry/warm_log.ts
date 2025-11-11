export type WarmEvent = {
  ts: string;
  kind: "greeting" | "farewell" | "reply";
  mode?: string;
  risk?: string;
  tod?: string;
  usedInterjection?: boolean;
  honesty?: {
    active: boolean;
    reasons: string[];
  };
};

export function logWarm(event: WarmEvent) {
  if (process.env.NODE_ENV === "production") return;
  try {
    console.debug("[warm]", JSON.stringify(event));
  } catch (err) {
    console.debug("[warm]", event);
  }
}
