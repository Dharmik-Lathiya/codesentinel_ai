interface DashboardData {
    runs: {
        timestamp: string;
        mode: string;
        totalFindings: number;
        score: number | null;
        findingsBySeverity: Record<string, number>;
        findingsByCategory: Record<string, number>;
        durationMs: number;
    }[];
}
export declare class DashboardServer {
    private port;
    private dataDir;
    private server;
    private data;
    constructor(port: number, dataDir: string);
    private dataPath;
    private loadData;
    private saveData;
    recordRun(run: DashboardData["runs"][0]): void;
    start(): void;
    stop(): void;
}
export {};
