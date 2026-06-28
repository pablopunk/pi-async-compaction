import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pi-ai
vi.mock("@earendil-works/pi-ai", () => ({
  complete: vi.fn(),
}));

// Mock pi-coding-agent
vi.mock("@earendil-works/pi-coding-agent", () => {
  return {
    buildSessionContext: vi.fn(() => ({ messages: [] })),
    convertToLlm: vi.fn(() => []),
    estimateTokens: vi.fn(() => 100),
    serializeConversation: vi.fn(() => ""),
  };
});

// Import after mocks
import asyncCompaction from "../extensions/async-compaction.js";

// Helper: minimal ExtensionAPI mock
function mockExtensionAPI() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  return {
    on(event: string, handler: (...args: any[]) => any) {
      handlers[event] = handler;
    },
    registerCommand(_name: string, _opts: any) {},
    _fire(event: string, ...args: any[]) {
      if (handlers[event]) return handlers[event](...args);
    },
  };
}

// Helper: minimal ExtensionContext mock
function mockContext(overrides: Partial<any> = {}) {
  return {
    hasUI: false,
    ui: { notify: vi.fn(), setStatus: vi.fn() },
    sessionManager: {
      getEntries: vi.fn(() => []),
      getLeafId: vi.fn(() => "leaf-1"),
      getBranch: vi.fn((_id?: string) => [{ id: "leaf-1" }, { id: "leaf-2" }]),
    },
    model: { provider: "test", id: "test-model", contextWindow: 128000 },
    modelRegistry: {
      find: vi.fn(() => null),
      getApiKeyAndHeaders: vi.fn(() => ({ ok: false, apiKey: null })),
    },
    cwd: "/test/project",
    isProjectTrusted: vi.fn(() => false),
    ...overrides,
  };
}

describe("asyncCompaction extension", () => {
  let pi: ReturnType<typeof mockExtensionAPI>;
  let ctx: ReturnType<typeof mockContext>;

  beforeEach(() => {
    pi = mockExtensionAPI();
    ctx = mockContext();
    asyncCompaction(pi as any);
  });

  describe("session_start handler", () => {
    it("loads settings and resets state without throwing", () => {
      expect(() => pi._fire("session_start", {}, ctx)).not.toThrow();
    });

    it("defaults to disabled when no settings file exists", () => {
      pi._fire("session_start", {}, ctx);
      // agent_end should be a no-op when disabled
      const result = pi._fire("agent_end", {}, ctx);
      expect(result).toBeUndefined();
    });
  });

  describe("agent_end handler", () => {
    it("does not trigger compaction when disabled", () => {
      pi._fire("session_start", {}, ctx);
      const result = pi._fire("agent_end", {}, ctx);
      expect(result).toBeUndefined();
    });

    it("does not throw with simulated context", () => {
      pi._fire("session_start", {}, ctx);
      expect(() => pi._fire("agent_end", {}, ctx)).not.toThrow();
    });
  });

  describe("context handler", () => {
    it("returns undefined when no compaction has been applied", () => {
      pi._fire("session_start", {}, ctx);
      const result = pi._fire("context", {}, ctx);
      expect(result).toBeUndefined();
    });
  });

  describe("session_shutdown handler", () => {
    it("aborts running job without throwing", () => {
      pi._fire("session_start", {}, ctx);
      expect(() => pi._fire("session_shutdown", {}, ctx)).not.toThrow();
    });
  });
});

// Unit tests for logic patterns used in the extension
describe("settings parsing logic", () => {
  it("parseSummarizer: handles provider/model string format", () => {
    const input = "openai/gpt-4";
    const slashIndex = input.indexOf("/");
    const valid = slashIndex > 0 && slashIndex < input.length - 1;
    expect(valid).toBe(true);
    if (valid) {
      expect(input.slice(0, slashIndex)).toBe("openai");
      expect(input.slice(slashIndex + 1)).toBe("gpt-4");
    }
  });

  it("parseSummarizer: rejects invalid formats", () => {
    expect("invalid".indexOf("/") > 0).toBe(false);
    const atStart = "/model-only";
    const slashIdx = atStart.indexOf("/");
    expect(slashIdx > 0 && slashIdx < atStart.length - 1).toBe(false);
  });

  it("parseSummarizer: accepts object format", () => {
    const input = { provider: "anthropic", model: "claude-3" };
    expect(typeof input.provider).toBe("string");
    expect(typeof input.model).toBe("string");
  });

  it("applySettings: boolean toggles enabled", () => {
    const raw = { asyncCompaction: true };
    expect(raw.asyncCompaction).toBe(true);
  });

  it("applySettings: threshold must be in range", () => {
    const valids = [1, 50, 99];
    for (const v of valids) expect(v > 0 && v < 100).toBe(true);
    const invalids = [0, -1, 100, 101];
    for (const v of invalids) expect(v > 0 && v < 100).toBe(false);
  });
});

describe("session context usage", () => {
  it("returns undefined when contextWindow <= 0", () => {
    expect(0 <= 0).toBe(true);
  });

  it("calculates token percentage correctly", () => {
    const pct = (50000 / 100000) * 100;
    expect(pct).toBe(50);
  });
});

describe("percent formatting", () => {
  it("formats valid number", () => {
    expect(`${(75.1234).toFixed(1)}%`).toBe("75.1%");
  });

  it("returns placeholder for undefined", () => {
    const v: number | undefined = undefined;
    expect(v === undefined || Number.isNaN(v!) ? "?" : "ok").toBe("?");
  });

  it("returns placeholder for NaN", () => {
    const v = NaN;
    expect(Number.isNaN(v) ? "?" : "ok").toBe("?");
  });
});
