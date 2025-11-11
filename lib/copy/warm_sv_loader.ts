import data from "./warm_sv.json";

export type WarmJson = typeof data;

export function getWarmCopy(): WarmJson {
  return data;
}
