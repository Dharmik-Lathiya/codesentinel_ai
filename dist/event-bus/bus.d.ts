import type { GitHubEvent, Subscriber } from "./types.js";
interface SubscriberHealth {
    failures: number;
    lastFailure: number;
    cooldownUntil: number;
}
export declare class EventBus {
    private subscribers;
    private health;
    private history;
    private readonly maxConcurrency;
    private readonly subscriberTimeoutMs;
    private readonly maxFailures;
    private readonly cooldownMs;
    constructor(opts?: {
        maxConcurrency?: number;
        subscriberTimeoutMs?: number;
        maxFailures?: number;
        cooldownMs?: number;
    });
    register(subscriber: Subscriber): void;
    unregister(name: string): void;
    registerAll(subscribers: Subscriber[]): void;
    emit(event: GitHubEvent): Promise<void>;
    private handleEmitResults;
    private dispatch;
    getSubscriberHealth(name: string): SubscriberHealth | undefined;
}
export {};
