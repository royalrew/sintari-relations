import { z } from "next/dist/compiled/zod";

export const pdfPayloadSchema = z.object({
  person1: z.string().min(2),
  person2: z.string().min(2),
  description: z.string().min(10),
  reflections: z.array(z.string()).length(3),
  recommendation: z.string().min(3),
  safetyFlag: z.boolean().optional(),
  createdAt: z.string().optional(), // ISO-sträng om du vill sätta själv
});

export type PdfPayload = z.infer<typeof pdfPayloadSchema>;

