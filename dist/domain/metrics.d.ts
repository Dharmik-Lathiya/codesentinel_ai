import type { Finding } from "../analyzer/index.js";
export interface MetricsReport {
    totalFiles: number;
    totalFindings: number;
    findingsPerFile: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    topCategories: {
        category: string;
        count: number;
    }[];
}
export interface MetricsStore {
    reports: MetricsReport[];
    add(report: MetricsReport): void;
    average(): MetricsReport | null;
}
export declare function computeMetrics(files: {
    path: string;
}[], findings: Finding[]): MetricsReport;
export declare function createMetricsStore(): MetricsStore;
