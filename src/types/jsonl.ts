import { z } from "zod";

export const SeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);

const MAX_SUMMARY_LENGTH = 2000;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_SUGGESTION_LENGTH = 2000;

export const SummaryEntrySchema = z.object({
  type: z.literal("summary"),
  summary: z.string().min(1).max(MAX_SUMMARY_LENGTH),
});

export const VerdictEntrySchema = z.object({
  type: z.literal("verdict"),
  verdict: z.enum(["approved", "changes_requested", "comment"]),
});

export const StrengthEntrySchema = z.object({
  type: z.literal("strength"),
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
});

export const IssueEntrySchema = z.object({
  type: z.literal("issue"),
  severity: SeveritySchema,
  category: z.enum(["bug", "security", "performance", "smell", "style"]),
  file: z.string().min(1),
  line: z.number().int().positive().nullable().optional(),
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  suggestion: z.string().max(MAX_SUGGESTION_LENGTH).optional(),
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
