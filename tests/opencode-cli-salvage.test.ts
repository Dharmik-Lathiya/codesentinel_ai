import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const spawnMock = vi.fn();
const execSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  execSync: (...args: unknown[]) => execSyncMock(...args),
}));

const { OpenCodeProvider } = await import("../src/ai/opencode.js");

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
};

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 4242;
  return child;
}

/** Drain pending microtasks so runCli's listeners are attached before we emit. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Emit output then close on the child once listeners are guaranteed attached. */
function finish(child: FakeChild, opts: { code: number; stdout?: string; stderr?: string }): void {
  if (opts.stdout) child.stdout.emit("data", Buffer.from(opts.stdout));
  if (opts.stderr) child.stderr.emit("data", Buffer.from(opts.stderr));
  child.emit("close", opts.code);
}

const textEvent = (text: string): string =>
  JSON.stringify({ type: "text", part: { text } }) + "\n";

function makeProvider(): InstanceType<typeof OpenCodeProvider> {
  execSyncMock.mockImplementation(() => {
    throw new Error("no shell in test");
  });
  // use_opencode_cli=true; binary resolution fails everywhere -> npx path,
  // which routes through the same mocked spawn().
  return new OpenCodeProvider(
    { use_opencode_cli: "true" } as ConstructorParameters<typeof OpenCodeProvider>[0],
    process.cwd(),
  );
}

const req = {
  model: { provider: "opencode", model: "big-pickle" },
  messages: [{ role: "user", content: "Reply with one word: PONG" }],
} as Parameters<InstanceType<typeof OpenCodeProvider>["complete"]>[0];

describe("OpenCodeProvider CLI robustness", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    execSyncMock.mockReset();
  });

  it("salvages completed CLI output even when the process exits non-zero", async () => {
    // Observed in CI: opencode emits the full JSONL transcript then exits 1.
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const provider = makeProvider();

    const pending = provider.complete(req);
    await tick();
    finish(child, { code: 1, stdout: textEvent("PONG") });

    const result = await pending;
    expect(result.content).toContain("PONG");
  }, 10_000);

  it("rejects when the CLI exits non-zero with no usable output", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const provider = makeProvider();

    const pending = provider.complete(req);
    await tick();
    finish(child, { code: 1, stderr: "boom" });

    await expect(pending).rejects.toThrow(/exited with code 1/);
  }, 10_000);

  it("a failing CLI call does not wedge the shared lock for later calls", async () => {
    const first = fakeChild();
    const second = fakeChild();
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const provider = makeProvider();

    const p1 = provider.complete(req);
    await tick();
    finish(first, { code: 1, stderr: "transient glitch" });
    await expect(p1).rejects.toThrow(); // permanent-class error: no retry

    const p2 = provider.complete(req);
    await tick();
    finish(second, { code: 0, stdout: textEvent("OK") });
    await expect(p2).resolves.toMatchObject({ content: "OK" });
  }, 10_000);

  it("falls back to the next free model when the requested one requires payment", async () => {
    // Promo windows rotate: a pinned "-free" model can start billing overnight
    // ("APIError: No payment method"). The provider must move to the next
    // candidate instead of failing every call until someone edits config.
    const failed = fakeChild();
    const ok = fakeChild();
    spawnMock.mockReturnValueOnce(failed).mockReturnValueOnce(ok);
    const provider = makeProvider();

    const pending = provider.complete({
      ...req,
      model: { provider: "opencode", model: "big-pickle" },
    } as typeof req);
    await tick();
    finish(failed, {
      code: 1,
      stdout: textEvent("PONG"), // output present but model-level failure wins
      stderr:
        '{"type":"error","error":{"name":"APIError","data":{"message":"No payment method. Add a payment method here: https://opencode.ai/workspace"}}}',
    });

    // Let the provider fall back and attach listeners on the next candidate.
    await tick();
    finish(ok, { code: 0, stdout: textEvent("PONG") });
    const result = await pending;

    expect(result.content).toContain("PONG");
    const modelsUsed = spawnMock.mock.calls.map((c) => {
      const args = c[1] as string[];
      return args[args.indexOf("--model") + 1];
    });
    expect(modelsUsed[0]).toBe("opencode/big-pickle");
    expect(modelsUsed[1]).toMatch(/^opencode\/(hy3-free|x-preview-f-free)$/);
  }, 10_000);

  it("does not switch models for ordinary non-payment failures", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const provider = makeProvider();

    const pending = provider.complete(req);
    await tick();
    finish(child, { code: 1, stderr: "boom" });

    await expect(pending).rejects.toThrow(/exited with code 1/);
    expect(spawnMock).toHaveBeenCalledTimes(1); // no model fallback attempted
  }, 10_000);
});
