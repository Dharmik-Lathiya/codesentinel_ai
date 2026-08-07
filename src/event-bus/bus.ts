import type { GitHubEvent, Subscriber } from "./types.js";
import { logger } from "../utils/logger.js";

interface SubscriberHealth {
  failures: number;
  lastFailure: number;
  cooldownUntil: number;
}

const DEFAULT_MAX_CONCURRENCY_LIMIT = 10;
const DEFAULT_MAX_HISTORY_COUNT = 100;

export class EventBus {
  static readonly MAX_CONCURRENCY_LIMIT = DEFAULT_MAX_CONCURRENCY_LIMIT;
  static readonly MAX_HISTORY_COUNT = DEFAULT_MAX_HISTORY_COUNT;
  private subscribers = new Map<string, Subscriber>();
  private health = new Map<string, SubscriberHealth>();
  private history: (GitHubEvent | undefined)[] = new Array(EventBus.MAX_HISTORY_COUNT);
  private historyWriteIndex = 0;
  private historyCount = 0;
  private readonly maxConcurrency: number;
  private readonly subscriberTimeoutMs: number;
  private readonly maxFailures: number;
  private readonly cooldownMs: number;

  constructor(opts?: { maxConcurrency?: number; subscriberTimeoutMs?: number; maxFailures?: number; cooldownMs?: number }) {
    this.maxConcurrency = opts?.maxConcurrency ?? EventBus.MAX_CONCURRENCY_LIMIT;
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
    this.recordHistory(event);

    const matching = Array.from(this.subscribers.values()).filter((s) =>
      s.eventTypes.includes(event.type),
    );
    const results = await Promise.allSettled(
      matching.map((s) => this.dispatch(s, event)),
    );
    this.handleEmitResults(matching, results);
  }

  private handleEmitResults(matching: Subscriber[], results: PromiseSettledResult<void>[]): void {
    for (let i = 0; i < matching.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        logger.warn(`EventBus: subscriber "${matching[i].name}" failed: ${result.reason}`);
      }
    }
  }

  private recordHistory(event: GitHubEvent): void {
    this.history[this.historyWriteIndex] = event;
    this.historyWriteIndex = (this.historyWriteIndex + 1) % EventBus.MAX_HISTORY_COUNT;
    if (this.historyCount < EventBus.MAX_HISTORY_COUNT) this.historyCount++;
  }

  getHistory(): GitHubEvent[] {
    const out: GitHubEvent[] = [];
    for (let i = 0; i < this.historyCount; i++) {
      const idx =
        (this.historyWriteIndex - this.historyCount + i + EventBus.MAX_HISTORY_COUNT) %
        EventBus.MAX_HISTORY_COUNT;
      const e = this.history[idx];
      if (e) out.push(e);
    }
    return out;
  }

  private async dispatch(subscriber: Subscriber, event: GitHubEvent): Promise<void> {
    const health = this.health.get(subscriber.name);
    if (health && health.cooldownUntil > Date.now()) {
      logger.warn(`EventBus: "${subscriber.name}" in cooldown, skipping`);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const message = `subscriber "${subscriber.name}" timed out on ${event.type} after ${this.subscriberTimeoutMs}ms`;
    try {
      const timerPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), this.subscriberTimeoutMs);
      });
      const result = await Promise.race([subscriber.handler(event), timerPromise]);
      if (result.success === false) {
        throw result.error;
      }
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
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  getSubscriberHealth(name: string): SubscriberHealth | undefined {
    return this.health.get(name);
  }
}
