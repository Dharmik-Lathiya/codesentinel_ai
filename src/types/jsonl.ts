import { z } from "zod";

const SUMMARY_MAX = 2000;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const MESSAGE_MAX = 1000;
const SUGGESTION_MAX = 2000;

export const SeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);

export const SummaryEntrySchema = z.object({
  type: z.literal("summary"),
  summary: z.string().min(1).max(SUMMARY_MAX),
});

export const VerdictEntrySchema = z.object({
  type: z.literal("verdict"),
  verdict: z.enum(["approved", "changes_requested", "comment"]),
});

export const StrengthEntrySchema = z.object({
  type: z.literal("strength"),
  title: z.string().min(1).max(TITLE_MAX),
  description: z.string().max(DESCRIPTION_MAX).optional(),
});

export const IssueEntrySchema = z.object({
  type: z.literal("issue"),
  severity: SeveritySchema,
  category: z.enum(["bug", "security", "performance", "smell", "style"]),
  file: z.string().min(1),
  line: z.number().int().positive().nullable().optional(),
  message: z.string().min(1).max(MESSAGE_MAX),
  suggestion: z.string().max(SUGGESTION_MAX).optional(),
});

export const ReviewEntrySchema = z.discriminatedUnion("type", [
  SummaryEntrySchema,
  VerdictEntrySchema,
  StrengthEntrySchema,
  IssueEntrySchema,
]);

export type SummaryEntry = z.infer<typeof SummaryEntrySchema>;
export type VerdictEntry = z.infer<typeof VerdictEntrySchema>;
export type StrengthEntry = z.infer<typeof StrengthEntrySchema>;
export type IssueEntry = z.infer<typeof IssueEntrySchema>;
export type ReviewEntry = z.infer<typeof ReviewEntrySchema>;
