import { z } from "zod";

// Base types
const safetyFlagSchema = z.enum(["NORMAL", "CAUTION", "RISK", "DANGER"]);
const overallStatusSchema = z.enum(["OK", "WARNING", "CRITICAL"]);
const yesNoSchema = z.enum(["YES", "NO"]);
const repairSignalsSchema = z.enum(["YES", "NO", "MAYBE"]);

// Input schema
const inputSchema = z.object({
  person1: z.string(),
  person2: z.string(),
  description: z.string(),
  description_length: z.number(),
  detected_language: z.string().default("sv"),
  input_hash: z.string().startsWith("sha256:"),
});

// Analysis signals schema
const signalsSchema = z.object({
  pos_count: z.number(),
  neg_count: z.number(),
  risk_count: z.number(),
  risk_areas: z.array(z.string()),
  repair_signals: repairSignalsSchema,
  warmth: yesNoSchema,
  has_apology: yesNoSchema,
  has_plan: yesNoSchema,
  safety_flag: safetyFlagSchema,
  net_score: z.number(),
  toxicity_score: z.number().min(0).max(1),
  self_harm_mention: z.boolean(),
  abuse_mention: z.boolean(),
});

// Analysis results schema (removed duplicate safety_flag and net_score - only in signals)
const analysisSchema = z.object({
  reflections: z.array(z.string()).length(3),
  recommendation: z.string(),
  signals: signalsSchema,
});

// Metadata schema
const metadataSchema = z.object({
  analysis_mode: z.enum(["ai", "fallback"]),
  confidence: z.number().min(0).max(1).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  seed: z.number().nullable().optional(),
  system_version: z.string().optional(),
  analysis_pipeline: z.array(z.string()).optional(),
  ai_chain_version: z.string().optional(),
});

// Metrics schema
const metricsSchema = z.object({
  time_in_day_seconds: z.number(),
  latency_ms_total: z.number(),
  latency_ms_by_stage: z.record(z.string(), z.number()).optional(),
  tokens_in: z.number().optional(),
  tokens_out: z.number().optional(),
  cost_estimate: z.number().optional(),
});

// Consent schema
const consentSchema = z.object({
  given: z.boolean(),
  scope: z.string().optional(),
  timestamp: z.string().datetime(),
});

// Payment schema
const paymentSchema = z.object({
  provider: z.string().optional(),
  status: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  receipt_url: z.string().url().nullable().optional(),
});

// Error schema
const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  stack_in_dev: z.string().optional(),
}).nullable();

// Experiment schema
const experimentSchema = z.object({
  experiment_id: z.string().nullable().optional(),
  variant: z.string().nullable().optional(),
  feature_flags: z.array(z.string()).optional(),
});

// Callbacks schema
const callbacksSchema = z.object({
  email_sent: z.boolean().optional(),
  pdf_url: z.string().url().nullable().optional(),
  webhook_ok: z.boolean().optional(),
});

// Context schema for source tracking
const contextSchema = z.object({
  campaign: z.string().optional(),
  referrer: z.string().optional(),
}).optional();

// Review schema for human QA
const reviewSchema = z.object({
  score: z.number().min(1).max(5).nullable().optional(),
  reviewed_by: z.string().nullable().optional(),
  timestamp: z.string().datetime().nullable().optional(),
});

// PDF export schema
const pdfSchema = z.object({
  filename: z.string().nullable().optional(),
  size_kb: z.number().nullable().optional(),
  generated_at: z.string().datetime().nullable().optional(),
});

// Main analysis report schema v2
export const analysisReportV2Schema = z.object({
  run_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  order_id: z.string().nullable().optional(),
  session_id: z.string().optional(),
  user_id: z.string().optional(),
  locale: z.string().default("sv-SE"),
  timezone: z.string().default("Europe/Stockholm"),
  overall_status: overallStatusSchema,
  input: inputSchema,
  analysis: analysisSchema,
  metadata: metadataSchema,
  metrics: metricsSchema,
  consent: consentSchema,
  payment: paymentSchema.optional(),
  error: errorSchema,
  experiment: experimentSchema.optional(),
  callbacks: callbacksSchema.optional(),
  source: z.string().default("web_form"),
  context: contextSchema,
  review: reviewSchema.optional(),
  pdf: pdfSchema.optional(),
});

export type AnalysisReportV2 = z.infer<typeof analysisReportV2Schema>;
export type InputData = z.infer<typeof inputSchema>;
export type AnalysisData = z.infer<typeof analysisSchema>;
export type SignalsData = z.infer<typeof signalsSchema>;
export type MetadataData = z.infer<typeof metadataSchema>;
export type MetricsData = z.infer<typeof metricsSchema>;
export type ConsentData = z.infer<typeof consentSchema>;
export type PaymentData = z.infer<typeof paymentSchema>;
export type ErrorData = z.infer<typeof errorSchema>;
export type ExperimentData = z.infer<typeof experimentSchema>;
export type CallbacksData = z.infer<typeof callbacksSchema>;
export type ContextData = z.infer<typeof contextSchema>;
export type ReviewData = z.infer<typeof reviewSchema>;
export type PdfData = z.infer<typeof pdfSchema>;
