import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../src/event-bus/bus.js";
import type { Subscriber } from "../src/event-bus/types.js";

function makeSub(name = "test", eventTypes = ["push"]): Subscriber {
  return {
    name,
    eventTypes,
    handler: vi.fn().mockResolvedValue({ success: true } as const),
  };
}

function pushEvent() {
  return { type: "push" as const, payload: {} };
}

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus({ subscriberTimeoutMs: 100, maxFailures: 3, cooldownMs: 5000 });
  });

  it("registers and unregisters subscriber", () => {
    const sub = makeSub();
    bus.register(sub);
    bus.unregister("test");
    expect(bus.getSubscriberHealth("test")).toBeUndefined();
  });

  it("registerAll registers multiple subscribers", () => {
    const a = makeSub("a");
    const b = makeSub("b");
    bus.registerAll([a, b]);

    const handler = vi.fn();
    bus.register({ name: "c", eventTypes: ["push"], handler: handler.mockResolvedValue({ success: true } as const) });
    bus.unregister("a");
  });

  it("emits to matching subscribers", async () => {
    const sub = makeSub();
    bus.register(sub);
    await bus.emit(pushEvent());
    expect(sub.handler).toHaveBeenCalledTimes(1);
  });

  it("does not emit to non-matching subscribers", async () => {
    const sub = makeSub("test", ["pull_request"]);
    bus.register(sub);
    await bus.emit(pushEvent());
    expect(sub.handler).not.toHaveBeenCalled();
  });

  it("emits to multiple matching subscribers", async () => {
    const a = makeSub("a");
    const b = makeSub("b");
    const c = makeSub("c", ["pull_request"]);
    bus.registerAll([a, b, c]);
    await bus.emit(pushEvent());
    expect(a.handler).toHaveBeenCalledTimes(1);
    expect(b.handler).toHaveBeenCalledTimes(1);
    expect(c.handler).not.toHaveBeenCalled();
  });

  it("times out a slow subscriber", async () => {
    const slow = makeSub("slow");
    slow.handler = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 5000)));
    bus.register(slow);
    await bus.emit(pushEvent());
    const health = bus.getSubscriberHealth("slow");
    expect(health).toBeDefined();
    expect(health!.failures).toBeGreaterThanOrEqual(1);
  });

  it("enters cooldown after max failures", async () => {
    const fail = makeSub("fail");
    fail.handler = vi.fn().mockRejectedValue(new Error("boom"));
    bus.register(fail);

    for (let i = 0; i < 3; i++) {
      await bus.emit(pushEvent());
    }

    const health = bus.getSubscriberHealth("fail");
    expect(health).toBeDefined();
    expect(health!.failures).toBe(3);
    expect(health!.cooldownUntil).toBeGreaterThan(0);
  });

  it("skips subscriber during cooldown", async () => {
    const fail = makeSub("fail");
    fail.handler = vi.fn().mockRejectedValue(new Error("boom"));
    bus.register(fail);

    for (let i = 0; i < 3; i++) {
      await bus.emit(pushEvent());
    }

    fail.handler.mockClear();

    await bus.emit(pushEvent());
    expect(fail.handler).not.toHaveBeenCalled();
  });

  it("recovers after successful dispatch resets health", async () => {
    let failCount = 0;
    const flaky = makeSub("flaky");
    flaky.handler = vi.fn().mockImplementation(() => {
      failCount++;
      if (failCount <= 2) return Promise.reject(new Error("transient"));
      return Promise.resolve({ success: true } as const);
    });
    bus.register(flaky);

    for (let i = 0; i < 4; i++) {
      await bus.emit(pushEvent());
    }

    const health = bus.getSubscriberHealth("flaky");
    expect(health).toBeDefined();
    expect(health!.failures).toBe(0);
  });
});
