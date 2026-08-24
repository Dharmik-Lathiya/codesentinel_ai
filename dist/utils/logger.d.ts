/** Lightweight leveled logger. Keeps secrets out of output by default. */
export type LogLevel = "debug" | "info" | "warn" | "error";
export declare class Logger {
    level: LogLevel;
    constructor(level?: LogLevel);
    setJsonMode(enabled: boolean): void;
    private emit;
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
export declare const logger: Logger;
