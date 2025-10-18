"use server";

import { relationSchema } from "@/lib/schemas/relationSchema";
import { relationAgentV1 } from "@/lib/agents/relation_agent";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: "VALIDATION_ERROR" | "INTERNAL_ERROR"; issues?: Record<string, string[]> };

export async function analyzeRelation(formData: FormData): Promise<Ok<{ reflections: string[]; recommendation: string; safetyFlag: boolean }> | Err> {
  const payload = {
    person1: formData.get("person1"),
    person2: formData.get("person2"),
    description: formData.get("description"),
    consent: formData.get("consent"),
  };

  const parsed = relationSchema.safeParse(payload);
  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    return { ok: false, error: "VALIDATION_ERROR", issues: fieldErrors };
  }

  const out = relationAgentV1(parsed.data);
  return { ok: true, data: out };
}

