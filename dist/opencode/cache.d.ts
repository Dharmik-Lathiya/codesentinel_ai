export interface Lesson {
    pattern: string;
    filePattern: string;
    lesson: string;
    severity: "critical" | "important" | "minor";
    createdAt: string;
    hitCount: number;
}
export interface CacheEntry {
    key: string;
    lessons: Lesson[];
    updatedAt: string;
}
export interface CacheBackend {
    get(key: string): Promise<CacheEntry | null>;
    set(key: string, entry: CacheEntry): Promise<void>;
    list(): Promise<string[]>;
    remove(key: string): Promise<void>;
}
export declare function buildCacheKey(filePath: string, pattern: string): string;
export declare class LearningCache {
    private backend;
    private locks;
    constructor(backendOrDir?: CacheBackend | string);
    private withLock;
    get(key: string): Promise<Lesson[]>;
    set(key: string, lesson: Lesson): Promise<void>;
    getAll(): Promise<Lesson[]>;
    clear(): Promise<void>;
    getStats(): Promise<{
        totalEntries: number;
        totalLessons: number;
    }>;
}
