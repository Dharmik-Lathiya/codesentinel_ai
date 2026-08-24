import { logger } from "../utils/logger.js";
const DEFAULT_MAX_CONCURRENCY_LIMIT = 10;
const DEFAULT_MAX_HISTORY_COUNT = 100;
export class EventBus {
    static MAX_CONCURRENCY_LIMIT = DEFAULT_MAX_CONCURRENCY_LIMIT;
    static MAX_HISTORY_COUNT = DEFAULT_MAX_HISTORY_COUNT;
    subscribers = new Map();
    health = new Map();
    history = [];
    maxConcurrency;
    subscriberTimeoutMs;
    maxFailures;
    cooldownMs;
    constructor(opts) {
        this.maxConcurrency = opts?.maxConcurrency ?? EventBus.MAX_CONCURRENCY_LIMIT;
        this.subscriberTimeoutMs = opts?.subscriberTimeoutMs ?? 120_000;
        this.maxFailures = opts?.maxFailures ?? 5;
        this.cooldownMs = opts?.cooldownMs ?? 30_000;
    }
    register(subscriber) {
        this.subscribers.set(subscriber.name, subscriber);
        logger.info(`EventBus: registered "${subscriber.name}"`);
    }
    unregister(name) {
        this.subscribers.delete(name);
        this.health.delete(name);
    }
    registerAll(subscribers) {
        for (const s of subscribers)
            this.register(s);
    }
    async emit(event) {
        this.history.push(event);
        if (this.history.length > EventBus.MAX_HISTORY_COUNT)
            this.history.shift();
        const matching = Array.from(this.subscribers.values()).filter((s) => s.eventTypes.includes(event.type));
        try {
            const results = await Promise.allSettled(matching.map((s) => this.dispatch(s, event)));
            this.handleEmitResults(matching, results);
        }
        catch (error) {
            logger.error(`EventBus: emit failed unexpectedly: ${error}`);
            throw error;
        }
    }
    handleEmitResults(matching, results) {
        for (let i = 0; i < matching.length; i++) {
            const result = results[i];
            if (result.status === "rejected") {
                logger.warn(`EventBus: subscriber "${matching[i].name}" failed: ${result.reason}`);
            }
        }
    }
    async dispatch(subscriber, event) {
        const health = this.health.get(subscriber.name);
        if (health && health.cooldownUntil > Date.now()) {
            logger.warn(`EventBus: "${subscriber.name}" in cooldown, skipping`);
            return;
        }
        try {
            const timer = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), this.subscriberTimeoutMs));
            await Promise.race([subscriber.handler(event), timer]);
            this.health.set(subscriber.name, { failures: 0, lastFailure: 0, cooldownUntil: 0 });
        }
        catch (err) {
            const h = this.health.get(subscriber.name) ?? { failures: 0, lastFailure: 0, cooldownUntil: 0 };
            h.failures++;
            h.lastFailure = Date.now();
            if (h.failures >= this.maxFailures) {
                h.cooldownUntil = Date.now() + this.cooldownMs;
                logger.warn(`EventBus: "${subscriber.name}" entered cooldown (${this.cooldownMs}ms)`);
            }
            this.health.set(subscriber.name, h);
            throw err;
        }
    }
    getSubscriberHealth(name) {
        return this.health.get(name);
    }
}
//# sourceMappingURL=bus.js.map