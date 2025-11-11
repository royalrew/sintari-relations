export type Tod = "morgon" | "eftermiddag" | "kväll";

export function resolveTod(date: Date = new Date(), timeZone = "Europe/Stockholm"): Tod {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  const hour = hourPart ? Number(hourPart.value) : date.getHours();

  if (hour < 11) return "morgon";
  if (hour < 17) return "eftermiddag";
  return "kväll";
}
