import type { GitHubEvent, Subscriber } from "./types.js";
import { logger } from "../utils/logger.js";

interface SubscriberHealth {
  failures: number;
  lastFailure: number;
  cooldownUntil: number;
}

export class EventBus {
  private subscribers = new Map<string, Subscriber>();
  private health = new Map<string, SubscriberHealth>();
  private history: GitHubEvent[] = [];
  private readonly maxConcurrency: number;
  private readonly subscriberTimeoutMs: number;
  private readonly maxFailures: number;
  private readonly cooldownMs: number;

  constructor(opts?: { maxConcurrency?: number; subscriberTimeoutMs?: number; maxFailures?: number; cooldownMs?: number }) {
    this.maxConcurrency = opts?.maxConcurrency ?? 10;
    this.subscriberTimeoutMs = opts?.subscriberTimeoutMs ?? 120_000;
    this.maxFailures = opts?.maxFailures ?? 5;
    this.cooldownMs = opts?.cooldownMs ?? 30_000;
  }

  register(subscriber: Subscriber): void {
    this.subscribers.set(subscriber.name, subscriber);
    logger.info(`EventBus: registered "${subscriber.name}"`);
  }

  unregister(name: string): void {
    this.subscribers.delete(name);
    this.health.delete(name);
  }

  registerAll(subscribers: Subscriber[]): void {
    for (const s of subscribers) this.register(s);
  }

  async emit(event: GitHubEvent): Promise<void> {
    this.history.push(event);
    if (this.history.length > 100) this.history.shift();

    const matching = Array.from(this.subscribers.values()).filter((s) =>
      s.eventTypes.includes(event.type),
    );

    const results = await Promise.allSettled(
      matching.map((s) => this.dispatch(s, event)),
    );

    for (let i = 0; i < matching.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        logger.warn(`EventBus: subscriber "${matching[i].name}" failed: ${result.reason}`);
      }
    }
  }

  private async dispatch(subscriber: Subscriber, event: GitHubEvent): Promise<void> {
    const health = this.health.get(subscriber.name);
    if (health && health.cooldownUntil > Date.now()) {
      logger.warn(`EventBus: "${subscriber.name}" in cooldown, skipping`);
      return;
    }

    try {
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), this.subscriberTimeoutMs),
      );
      await Promise.race([subscriber.handler(event), timer]);
      this.health.set(subscriber.name, { failures: 0, lastFailure: 0, cooldownUntil: 0 });
    } catch (err) {
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

  getSubscriberHealth(name: string): SubscriberHealth | undefined {
    return this.health.get(name);
  }
}
