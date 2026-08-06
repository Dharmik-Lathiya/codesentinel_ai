const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
let jsonMode = false;
export class Logger {
    level;
    constructor(level = "info") {
        this.level = level;
    }
    setJsonMode(enabled) {
        jsonMode = enabled;
    }
    emit(level, args) {
        if (LEVELS[level] < LEVELS[this.level])
            return;
        const msg = args
            .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
            .join(" ");
        if (jsonMode) {
            const entry = JSON.stringify({ level, message: msg, timestamp: new Date(Date.now()).toISOString() });
            if (level === "error")
                console.error(entry);
            else if (level === "warn")
                console.warn(entry);
            else if (level === "info")
                console.info(entry);
            return;
        }
        const prefix = `[codesentinel:${level}]`;
        if (level === "error")
            console.error(prefix, ...args);
        else if (level === "warn")
            console.warn(prefix, ...args);
        else if (level === "info")
            console.info(prefix, ...args);
    }
    debug(...args) {
        this.emit("debug", args);
    }
    info(...args) {
        this.emit("info", args);
    }
    warn(...args) {
        this.emit("warn", args);
    }
    error(...args) {
        this.emit("error", args);
    }
}
export const logger = new Logger(process.env.CODESENTINEL_LOG_LEVEL || "info");
//# sourceMappingURL=logger.js.map