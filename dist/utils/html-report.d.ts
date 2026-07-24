import type { EngineReport } from "../engine/index.js";
/**
 * Generate a self-contained HTML dashboard report from an EngineReport.
 * The HTML includes inline CSS and is fully portable (no external deps).
 */
export declare function renderHtmlReport(report: EngineReport): string;
