const raw = process.env.NEXT_PUBLIC_SHOW_INTERJECTION?.toLowerCase();
export const SHOW_INTERJECTION = raw === undefined ? true : raw === "true" || raw === "1";
