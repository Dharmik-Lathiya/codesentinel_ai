import { z } from "zod";
export declare const SeveritySchema: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
export declare const MAX_SUMMARY_LENGTH = 2000;
export declare const MAX_TITLE_LENGTH = 200;
export declare const MAX_DESCRIPTION_LENGTH = 1000;
export declare const MAX_MESSAGE_LENGTH = 1000;
export declare const MAX_SUGGESTION_LENGTH = 2000;
export declare const SummaryEntrySchema: z.ZodObject<{
    type: z.ZodLiteral<"summary">;
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "summary";
    summary: string;
}, {
    type: "summary";
    summary: string;
}>;
export declare const VerdictEntrySchema: z.ZodObject<{
    type: z.ZodLiteral<"verdict">;
    verdict: z.ZodEnum<["approved", "changes_requested", "comment"]>;
}, "strip", z.ZodTypeAny, {
    type: "verdict";
    verdict: "comment" | "approved" | "changes_requested";
}, {
    type: "verdict";
    verdict: "comment" | "approved" | "changes_requested";
}>;
export declare const StrengthEntrySchema: z.ZodObject<{
    type: z.ZodLiteral<"strength">;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "strength";
    title: string;
    description?: string | undefined;
}, {
    type: "strength";
    title: string;
    description?: string | undefined;
}>;
export declare const IssueEntrySchema: z.ZodObject<{
    type: z.ZodLiteral<"issue">;
    severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
    category: z.ZodEnum<["bug", "security", "performance", "smell", "style", "reliability", "architecture", "testing", "praise"]>;
    file: z.ZodString;
    line: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    message: z.ZodString;
    suggestion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    type: "issue";
    severity: "info" | "low" | "medium" | "high" | "critical";
    category: "bug" | "security" | "performance" | "smell" | "style" | "praise" | "reliability" | "architecture" | "testing";
    file: string;
    suggestion?: string | undefined;
    line?: number | null | undefined;
}, {
    message: string;
    type: "issue";
    severity: "info" | "low" | "medium" | "high" | "critical";
    category: "bug" | "security" | "performance" | "smell" | "style" | "praise" | "reliability" | "architecture" | "testing";
    file: string;
    suggestion?: string | undefined;
    line?: number | null | undefined;
}>;
export declare const ReviewEntrySchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"summary">;
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "summary";
    summary: string;
}, {
    type: "summary";
    summary: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"verdict">;
    verdict: z.ZodEnum<["approved", "changes_requested", "comment"]>;
}, "strip", z.ZodTypeAny, {
    type: "verdict";
    verdict: "comment" | "approved" | "changes_requested";
}, {
    type: "verdict";
    verdict: "comment" | "approved" | "changes_requested";
}>, z.ZodObject<{
    type: z.ZodLiteral<"strength">;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "strength";
    title: string;
    description?: string | undefined;
}, {
    type: "strength";
    title: string;
    description?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"issue">;
    severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
    category: z.ZodEnum<["bug", "security", "performance", "smell", "style", "reliability", "architecture", "testing", "praise"]>;
    file: z.ZodString;
    line: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    message: z.ZodString;
    suggestion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    type: "issue";
    severity: "info" | "low" | "medium" | "high" | "critical";
    category: "bug" | "security" | "performance" | "smell" | "style" | "praise" | "reliability" | "architecture" | "testing";
    file: string;
    suggestion?: string | undefined;
    line?: number | null | undefined;
}, {
    message: string;
    type: "issue";
    severity: "info" | "low" | "medium" | "high" | "critical";
    category: "bug" | "security" | "performance" | "smell" | "style" | "praise" | "reliability" | "architecture" | "testing";
    file: string;
    suggestion?: string | undefined;
    line?: number | null | undefined;
}>]>;
export type SummaryEntry = z.infer<typeof SummaryEntrySchema>;
export type VerdictEntry = z.infer<typeof VerdictEntrySchema>;
export type StrengthEntry = z.infer<typeof StrengthEntrySchema>;
export type IssueEntry = z.infer<typeof IssueEntrySchema>;
export type ReviewEntry = z.infer<typeof ReviewEntrySchema>;
