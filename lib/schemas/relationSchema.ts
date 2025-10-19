import { z } from "zod";

export const relationSchema = z.object({
  person1: z.string().min(2, "Minst 2 tecken"),
  person2: z.string().min(2, "Minst 2 tecken"),
  description: z.string().min(10, "Minst 10 tecken för en bra analys"),
  consent: z
    .union([z.string(), z.null()])
    .refine((val) => val === "on", {
      message: "Du måste ge samtycke för att fortsätta",
    }),
});

export type RelationInput = z.infer<typeof relationSchema>;

