var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/github/action.ts
import { writeFileSync as writeFileSync8 } from "node:fs";

// src/engine/index.ts
import { writeFileSync as writeFileSync7 } from "node:fs";
import { resolve as resolve9 } from "node:path";

// src/config/index.ts
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "node:fs";
import { resolve as resolve2, extname } from "node:path";
import { z } from "zod";

// src/config/defaults.ts
var DEFAULT_SEVERITY_ADJUSTMENT = {
  highRiskPatterns: ["src/", "lib/", "app/"],
  lowRiskPatterns: ["test/", "tests/", "__tests__/", ".test.", ".spec."],
  historyBasedAdjustment: true,
  changeFrequencyMultiplier: 1.5
};
var DEFAULT_CONFIDENCE_THRESHOLDS = {
  security: 0.7,
  bug: 0.6,
  performance: 0.5,
  smell: 0.4,
  style: 0.3
};
var DEFAULT_PROGRESSIVE_ANALYSIS = {
  quickScanRules: ["security", "critical"],
  standardScanRules: ["security", "bug", "performance", "smell"],
  deepScanRules: ["security", "bug", "performance", "smell", "style", "experimental"],
  autoEscalate: true,
  escalationThreshold: 5
};
var DEFAULT_MULTI_FILE_ANALYSIS = {
  maxConcurrentFiles: 10,
  analyzeDependencies: true,
  analyzeImports: true,
  analyzePatterns: true,
  fileGroupPatterns: ["src/", "lib/", "test/"]
};
var DEFAULT_ANALYZER_CONFIG = {
  enableEnhancedAnalysis: false,
  severityAdjustment: DEFAULT_SEVERITY_ADJUSTMENT,
  confidenceThresholds: DEFAULT_CONFIDENCE_THRESHOLDS,
  customRules: [],
  progressiveAnalysis: DEFAULT_PROGRESSIVE_ANALYSIS,
  multiFileAnalysis: DEFAULT_MULTI_FILE_ANALYSIS
};
var DEFAULT_GATE_CONFIG = {
  minScore: 0,
  maxCritical: 10,
  maxHigh: 50,
  blockOnSecurity: false,
  blockOnBugs: false
};
var DEFAULT_SECRET_PATTERNS = [
  { id: "aws-key", name: "AWS Access Key", regex: "AKIA[0-9A-Z]{16}", severity: "critical", message: "Hardcoded AWS Access Key ID detected.", suggestion: "Use IAM roles or environment variables instead." },
  { id: "aws-secret", name: "AWS Secret Key", regex: `(?i)aws(.{0,20})?(secret|access)_?key\\s*[=:]\\s*['"][A-Za-z0-9/+=]{40}['"]`, severity: "critical", message: "Hardcoded AWS Secret Access Key detected.", suggestion: "Use IAM roles or environment variables instead." },
  { id: "github-token", name: "GitHub Token", regex: `(?i)github[-_]?(token|pat|key)\\s*[=:]\\s*['"](ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}['"]`, severity: "critical", message: "Hardcoded GitHub token detected.", suggestion: "Use GITHUB_TOKEN secret or environment variables." },
  { id: "slack-token", name: "Slack Token", regex: "(xox[baprs]-[0-9a-zA-Z]{10,})", severity: "high", message: "Hardcoded Slack token detected.", suggestion: "Use environment variables for Slack tokens." },
  { id: "ssh-key", name: "SSH Private Key", regex: "(?i)-----BEGIN\\s+(?:(?:RSA|DSA|EC|OPENSSH)\\s+)?PRIVATE\\s+KEY-----", severity: "critical", message: "Hardcoded SSH private key detected.", suggestion: "Use SSH agent or secrets manager." },
  { id: "jwt-token", name: "JWT Token", regex: `(?i)(jwt|bearer)\\s*[=:]\\s*['"]eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}['"]`, severity: "high", message: "Hardcoded JWT token detected.", suggestion: "Use short-lived tokens from a secure source." },
  { id: "pg-conn-str", name: "PostgreSQL Connection String", regex: "postgres(ql)?://\\w+:\\w+@", severity: "high", message: "Hardcoded PostgreSQL connection string detected.", suggestion: "Use environment variables for database URLs." },
  { id: "redis-conn-str", name: "Redis Connection String", regex: "redis://\\w+:\\w+@", severity: "high", message: "Hardcoded Redis connection string detected.", suggestion: "Use environment variables for Redis URLs." },
  { id: "private-key-header", name: "Private Key Header", regex: "(?i)-----BEGIN\\s+(?:(?:RSA|DSA|EC|OPENSSH)\\s+)?PRIVATE\\s+KEY-----", severity: "critical", message: "Hardcoded private key detected.", suggestion: "Use a secrets manager or environment variables." },
  { id: "npm-token", name: "npm Token", regex: `(?i)npm[-_]?token\\s*[=:]\\s*['"][a-f0-9]{36}['"]`, severity: "high", message: "Hardcoded npm token detected.", suggestion: "Use environment variables for npm tokens." },
  { id: "generic-api-key", name: "Generic API Key", regex: `(?i)(api[-_]?(key|token|secret)|secret[-_]?key)\\s*[=:]\\s*['"][A-Za-z0-9_\\-]{20,}['"]`, severity: "high", message: "Possible hardcoded API key or secret detected.", suggestion: "Use environment variables or a secrets manager." },
  { id: "google-api-key", name: "Google API Key", regex: "(?i)AIza[0-9A-Za-z\\-_]{35}", severity: "high", message: "Hardcoded Google API key detected.", suggestion: "Use environment variables or Google Cloud IAM." },
  { id: "google-oauth-id", name: "Google OAuth Client ID", regex: "[0-9]+-[0-9A-Za-z_]{32}\\.apps\\.googleusercontent\\.com", severity: "high", message: "Hardcoded Google OAuth client ID detected.", suggestion: "Store client IDs in environment variables." },
  { id: "stripe-live-key", name: "Stripe Live API Key", regex: "(?i)sk_live_[0-9a-zA-Z]{24,}", severity: "critical", message: "Hardcoded Stripe live secret key detected.", suggestion: "Use Stripe's restricted keys or environment variables." },
  { id: "stripe-publishable-key", name: "Stripe Publishable Key", regex: "(?i)pk_(live|test)_[0-9a-zA-Z]{24,}", severity: "low", message: "Stripe publishable key exposed.", suggestion: "Stripe publishable keys are public but should still be in env vars." },
  { id: "mongodb-conn-str", name: "MongoDB Connection String", regex: "mongodb(?:\\+srv)?://[^\\s@]+:[^\\s@]+@", severity: "critical", message: "Hardcoded MongoDB connection string with credentials detected.", suggestion: "Use environment variables for MongoDB URIs." },
  { id: "discord-token", name: "Discord Bot Token", regex: "[MN][A-Za-z0-9_-]{23}\\.[A-Za-z0-9_-]{6}\\.[A-Za-z0-9_-]{27}", severity: "critical", message: "Hardcoded Discord bot token detected.", suggestion: "Use environment variables for Discord tokens." },
  { id: "telegram-token", name: "Telegram Bot Token", regex: "[0-9]{8,10}:[A-Za-z0-9_-]{35}", severity: "critical", message: "Hardcoded Telegram bot token detected.", suggestion: "Use environment variables for Telegram tokens." },
  { id: "twilio-account-sid", name: "Twilio Account SID", regex: "(?i)AC[0-9a-f]{32}", severity: "high", message: "Hardcoded Twilio Account SID detected.", suggestion: "Use environment variables for Twilio credentials." },
  { id: "twilio-auth-token", name: "Twilio Auth Token", regex: `(?i)twilio(.{0,20})?(auth|secret|token)\\s*[=:]\\s*['"][0-9a-f]{32}['"]`, severity: "critical", message: "Hardcoded Twilio auth token detected.", suggestion: "Use environment variables for Twilio credentials." },
  { id: "heroku-api-key", name: "Heroku API Key", regex: `(?i)heroku(.{0,20})?(api[-_]?key|token)\\s*[=:]\\s*['"][A-Za-z0-9_-]{36,}['"]`, severity: "high", message: "Hardcoded Heroku API key detected.", suggestion: "Use environment variables for Heroku API access." },
  { id: "sendgrid-api-key", name: "SendGrid API Key", regex: "(?i)SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}", severity: "critical", message: "Hardcoded SendGrid API key detected.", suggestion: "Use environment variables for SendGrid credentials." },
  { id: "mailchimp-api-key", name: "Mailchimp API Key", regex: "[0-9a-f]{32}-us[0-9]{1,2}", severity: "high", message: "Hardcoded Mailchimp API key detected.", suggestion: "Use environment variables for Mailchimp API access." },
  { id: "square-access-token", name: "Square Access Token", regex: "(?i)EAAA[A-Za-z0-9_\\-]{50,}", severity: "critical", message: "Hardcoded Square access token detected.", suggestion: "Use environment variables for Square credentials." },
  { id: "pypi-api-token", name: "PyPI API Token", regex: `(?i)pypi[-_]?token\\s*[=:]\\s*['"]pypi-[A-Za-z0-9_]{36,}['"]`, severity: "high", message: "Hardcoded PyPI API token detected.", suggestion: "Use environment variables for package registry tokens." },
  { id: "docker-hub-token", name: "Docker Hub Token", regex: `(?i)docker[-_]?(hub|token|pat)\\s*[=:]\\s*['"][A-Za-z0-9_\\-]{36,}['"]`, severity: "high", message: "Hardcoded Docker Hub token detected.", suggestion: "Use Docker Hub credentials via environment variables." },
  { id: "sentry-dsn", name: "Sentry DSN", regex: "https://[0-9a-f]{32}@[a-z0-9]+\\.ingest\\.sentry\\.io", severity: "medium", message: "Sentry DSN exposed.", suggestion: "Sentry DSNs are public but should use environment variables." },
  { id: "datadog-api-key", name: "Datadog API Key", regex: `(?i)datadog(.{0,20})?(api[-_]?key)\\s*[=:]\\s*['"][0-9a-f]{32}['"]`, severity: "high", message: "Hardcoded Datadog API key detected.", suggestion: "Use environment variables for Datadog credentials." }
];
var DEFAULT_DASHBOARD_CONFIG = {
  port: 4173,
  dataDir: ".codesentinel-dashboard"
};
var DEFAULT_LINTER_CONFIG = {
  enabled: true,
  tools: ["eslint", "biome", "pylint"],
  args: {}
};
var DEFAULT_LEARNING_CONFIG = {
  enabled: false,
  dbPath: ".codesentinel/learning.db",
  metaReview: true,
  patternDiscovery: true,
  metaReviewInterval: 10
};
var DEFAULT_MCP_CONFIG = {
  enabled: false,
  servers: []
};
var DEFAULT_BATCH_CONFIG = {
  enabled: true,
  batchSize: 5,
  maxFilesPerBatch: 5,
  maxLinesPerFile: 500
};
var DEFAULT_CONFIG = {
  mode: "review",
  max_iterations: 5,
  enable_auto_fix: false,
  enable_scoring: true,
  enable_test_generation: false,
  include_positive_feedback: true,
  dry_run: false,
  custom_prompt_paths: {},
  project_context: "",
  default_model: { provider: "opencode", model: "deepseek-v4-flash-free" },
  models: {
    review: { provider: "opencode", model: "deepseek-v4-flash-free" },
    fix: { provider: "opencode", model: "deepseek-v4-flash-free" },
    audit: { provider: "opencode", model: "deepseek-v4-flash-free" },
    score: { provider: "opencode", model: "deepseek-v4-flash-free" },
    testgen: { provider: "opencode", model: "deepseek-v4-flash-free" },
    chat: { provider: "opencode", model: "deepseek-v4-flash-free" },
    describe: { provider: "opencode", model: "deepseek-v4-flash-free" }
  },
  test_runner: "vitest",
  include: ["**/*.{ts,tsx,js,jsx,py,go,java,rb}"],
  exclude: [
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**",
    ".git/**",
    "**/*.test.*",
    "**/*.spec.*"
  ],
  output: {
    postGithubComments: false,
    createGithubIssues: false,
    writeReportFile: true,
    writeHtmlReport: false,
    reportDir: "codesentinel-reports"
  },
  enable_cache: true,
  cache_dir: ".codesentinel-cache",
  plugins: [],
  analyzer: DEFAULT_ANALYZER_CONFIG,
  gate: DEFAULT_GATE_CONFIG,
  secretPatterns: DEFAULT_SECRET_PATTERNS,
  dismissalsFile: ".codesentinel/dismissals.json",
  dashboard: DEFAULT_DASHBOARD_CONFIG,
  linters: DEFAULT_LINTER_CONFIG,
  enableSecretScanner: false,
  jsonl_output: false,
  securityBlendStrategy: "min",
  learning: DEFAULT_LEARNING_CONFIG,
  mcp: DEFAULT_MCP_CONFIG,
  batch: DEFAULT_BATCH_CONFIG,
  autoMerge: false
};
function mergeConfig(base, override) {
  const merged = { ...base, ...override };
  if (override.default_model) {
    merged.default_model = { ...base.default_model, ...override.default_model };
  }
  if (override.models) {
    merged.models = { ...base.models, ...override.models };
  }
  if (override.output) {
    merged.output = { ...base.output, ...override.output };
  }
  if (override.custom_prompt_paths) {
    merged.custom_prompt_paths = {
      ...base.custom_prompt_paths,
      ...override.custom_prompt_paths
    };
  }
  if (override.include) {
    merged.include = [...base.include, ...override.include];
  }
  if (override.exclude) {
    merged.exclude = [...base.exclude, ...override.exclude];
  }
  if (override.plugins) {
    merged.plugins = [...base.plugins, ...override.plugins];
  }
  if (override.gate) {
    merged.gate = { ...base.gate, ...override.gate };
  }
  if (override.secretPatterns) {
    merged.secretPatterns = [...override.secretPatterns];
  }
  if (override.dashboard) {
    merged.dashboard = { ...base.dashboard, ...override.dashboard };
  }
  if (override.linters) {
    merged.linters = {
      ...base.linters,
      ...override.linters,
      args: { ...base.linters.args, ...override.linters.args }
    };
  }
  if (override.enableSecretScanner !== void 0) {
    merged.enableSecretScanner = override.enableSecretScanner;
  }
  if (override.analyzer) {
    merged.analyzer = {
      ...base.analyzer,
      ...override.analyzer,
      severityAdjustment: {
        ...base.analyzer.severityAdjustment,
        ...override.analyzer.severityAdjustment
      },
      confidenceThresholds: {
        ...base.analyzer.confidenceThresholds,
        ...override.analyzer.confidenceThresholds
      },
      progressiveAnalysis: {
        ...base.analyzer.progressiveAnalysis,
        ...override.analyzer.progressiveAnalysis
      },
      multiFileAnalysis: {
        ...base.analyzer.multiFileAnalysis,
        ...override.analyzer.multiFileAnalysis
      }
    };
    if (override.analyzer.customRules) {
      merged.analyzer.customRules = [...base.analyzer.customRules, ...override.analyzer.customRules];
    }
  }
  if (override.autoMerge !== void 0) {
    merged.autoMerge = override.autoMerge;
  }
  return merged;
}

// src/config/loader.ts
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// src/utils/jsonc.ts
function parseJsonc(raw) {
  const placeholders = [];
  let masked = raw.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    placeholders.push(match);
    return `\0STR${placeholders.length - 1}\0`;
  });
  masked = masked.replace(/\/\*[\s\S]*?\*\//g, "");
  masked = masked.replace(/(^|[^:])\/\/.*$/gm, "$1");
  masked = masked.replace(/\x00STR(\d+)\x00/g, (_, i) => placeholders[Number(i)]);
  try {
    return JSON.parse(masked);
  } catch (error) {
    throw new Error(`Failed to parse JSONC: ${error.message}`);
  }
}

// src/config/loader.ts
var SEARCH_PATHS = [
  ".opencode-reviewer.yml",
  ".opencode-reviewer.yaml",
  "codesentinel.config.yml",
  "codesentinel.config.yaml",
  "codesentinel.config.json"
];
function searchConfigPaths(cwd) {
  const dir = cwd ?? process.cwd();
  if (process.env.CODESENTINEL_CONFIG) {
    const p = resolve(dir, process.env.CODESENTINEL_CONFIG);
    if (existsSync(p)) return p;
  }
  for (const name of SEARCH_PATHS) {
    const p = resolve(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}
function loadYamlConfig(filePath) {
  const raw = readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    return parseJsonc(raw);
  }
  try {
    const yamlModule = __require("js-yaml");
    return yamlModule.load(raw);
  } catch (err) {
    throw new Error(`Failed to parse YAML config ${filePath}: ${err}`);
  }
}

// src/config/index.ts
var userConfigSchema = z.object({
  mode: z.enum(["review", "fix", "audit", "score", "testgen", "chat", "gate", "describe", "improve"]).optional(),
  max_iterations: z.number().int().positive().optional(),
  enable_auto_fix: z.boolean().optional(),
  enable_scoring: z.boolean().optional(),
  enable_test_generation: z.boolean().optional(),
  include_positive_feedback: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  custom_prompt_paths: z.record(z.string()).optional(),
  project_context: z.string().optional(),
  default_model: z.object({ provider: z.string(), model: z.string() }).optional(),
  models: z.record(z.string(), z.any()).optional(),
  test_runner: z.enum(["jest", "vitest"]).optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  output: z.record(z.any()).optional(),
  enable_cache: z.boolean().optional(),
  cache_dir: z.string().optional(),
  plugins: z.array(z.string()).optional(),
  analyzer: z.object({
    enableEnhancedAnalysis: z.boolean().optional(),
    severityAdjustment: z.object({
      highRiskPatterns: z.array(z.string()).optional(),
      lowRiskPatterns: z.array(z.string()).optional(),
      historyBasedAdjustment: z.boolean().optional(),
      changeFrequencyMultiplier: z.number().optional()
    }).optional(),
    confidenceThresholds: z.object({
      security: z.number().min(0).max(1).optional(),
      bug: z.number().min(0).max(1).optional(),
      performance: z.number().min(0).max(1).optional(),
      smell: z.number().min(0).max(1).optional(),
      style: z.number().min(0).max(1).optional()
    }).optional(),
    customRules: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        pattern: z.string(),
        severity: z.enum(["info", "low", "medium", "high", "critical"]),
        category: z.enum(["bug", "security", "performance", "smell", "style", "praise"]),
        comment: z.string(),
        suggestion: z.string().optional(),
        filePatterns: z.array(z.string()).optional(),
        confidence: z.number().min(0).max(1).optional()
      })
    ).optional(),
    progressiveAnalysis: z.object({
      quickScanRules: z.array(z.string()).optional(),
      standardScanRules: z.array(z.string()).optional(),
      deepScanRules: z.array(z.string()).optional(),
      autoEscalate: z.boolean().optional(),
      escalationThreshold: z.number().optional()
    }).optional(),
    multiFileAnalysis: z.object({
      maxConcurrentFiles: z.number().optional(),
      analyzeDependencies: z.boolean().optional(),
      analyzeImports: z.boolean().optional(),
      analyzePatterns: z.boolean().optional(),
      fileGroupPatterns: z.array(z.string()).optional()
    }).optional()
  }).optional(),
  gate: z.object({
    minScore: z.number().min(0).max(100).optional(),
    maxCritical: z.number().min(0).optional(),
    maxHigh: z.number().min(0).optional(),
    blockOnSecurity: z.boolean().optional(),
    blockOnBugs: z.boolean().optional()
  }).optional(),
  secretPatterns: z.array(z.object({
    id: z.string(),
    name: z.string(),
    regex: z.string(),
    severity: z.enum(["info", "low", "medium", "high", "critical"]),
    message: z.string(),
    suggestion: z.string().optional()
  })).optional(),
  dismissalsFile: z.string().optional(),
  dashboard: z.object({
    port: z.number().optional(),
    dataDir: z.string().optional()
  }).optional(),
  jsonl_output: z.boolean().optional(),
  linters: z.object({
    enabled: z.boolean().optional(),
    tools: z.array(z.string()).optional(),
    args: z.record(z.array(z.string())).optional()
  }).optional(),
  enableSecretScanner: z.boolean().optional(),
  securityBlendStrategy: z.enum(["min", "avg", "static-only"]).optional(),
  learning: z.object({
    enabled: z.boolean().optional(),
    dbPath: z.string().optional(),
    metaReview: z.boolean().optional(),
    patternDiscovery: z.boolean().optional(),
    metaReviewInterval: z.number().optional()
  }).optional(),
  mcp: z.object({
    enabled: z.boolean().optional(),
    servers: z.array(z.any()).optional()
  }).optional(),
  batch: z.object({
    enabled: z.boolean().optional(),
    batchSize: z.number().optional(),
    maxFilesPerBatch: z.number().optional(),
    maxLinesPerFile: z.number().optional()
  }).optional()
}).passthrough();
function loadConfig(opts = {}) {
  let fileConfig = {};
  const configPath = opts.configPath;
  if (configPath) {
    const path = resolve2(configPath);
    if (!existsSync2(path)) {
      throw new Error(`Config file not found: ${path}`);
    }
    const ext = extname(path).toLowerCase();
    if (ext === ".yml" || ext === ".yaml") {
      fileConfig = loadYamlConfig(path);
    } else {
      const raw = readFileSync2(path, "utf8");
      fileConfig = parseJsonc(raw);
    }
  } else {
    const yamlPath = searchConfigPaths();
    if (yamlPath) {
      fileConfig = loadYamlConfig(yamlPath);
    }
  }
  const parsed = userConfigSchema.safeParse(fileConfig);
  if (!parsed.success) {
    const friendly = formatZodErrors(parsed.error);
    throw new Error(`Invalid config${configPath ? ` in ${configPath}` : ""}:
${friendly}`);
  }
  const fromFile = mergeConfig(DEFAULT_CONFIG, parsed.data);
  const final = mergeConfig(
    fromFile,
    opts.overrides ?? {}
  );
  validateConfig(final);
  return final;
}
function formatZodErrors(error) {
  const LABELS = {
    mode: "mode",
    max_iterations: "max_iterations",
    enable_auto_fix: "enable_auto_fix",
    enable_scoring: "enable_scoring",
    enable_test_generation: "enable_test_generation",
    test_runner: "test_runner",
    include: "include",
    exclude: "exclude",
    plugins: "plugins",
    gate: "gate",
    analyzer: "analyzer",
    default_model: "default_model",
    cache_dir: "cache_dir",
    enable_cache: "enable_cache",
    secretPatterns: "secretPatterns",
    dismissalsFile: "dismissalsFile",
    dashboard: "dashboard"
  };
  const lines = [];
  for (const issue of error.issues) {
    const path = issue.path.map((p) => typeof p === "number" ? `[${p}]` : p).join(".");
    const label = path ? LABELS[path] ?? path : "(root)";
    if (issue.code === "invalid_type") {
      const expected = issue.received === "undefined" ? "optional" : `type ${issue.expected}`;
      lines.push(`  - ${label}: expected ${expected}, got ${issue.received}`);
    } else if (issue.code === "invalid_enum_value") {
      const valid = issue.options.map((o) => `"${o}"`).join(", ");
      lines.push(`  - ${label}: must be one of ${valid}, got "${issue.received}"`);
    } else if (issue.code === "too_small") {
      lines.push(`  - ${label}: must be >= ${issue.minimum}`);
    } else if (issue.code === "too_big") {
      lines.push(`  - ${label}: must be <= ${issue.maximum}`);
    } else if (issue.code === "invalid_string") {
      lines.push(`  - ${label}: ${issue.validation} string expected`);
    } else {
      lines.push(`  - ${label}: ${issue.message}`);
    }
  }
  return lines.join("\n");
}
function validateConfig(config) {
  if (config.max_iterations < 1) {
    throw new Error("max_iterations must be >= 1");
  }
  const validModes = [
    "review",
    "fix",
    "audit",
    "score",
    "testgen",
    "chat",
    "gate",
    "describe",
    "improve"
  ];
  if (!validModes.includes(config.mode)) {
    throw new Error(`Invalid mode: ${config.mode}`);
  }
}
function configFromInputs(inputs) {
  const out = {};
  if (inputs.mode) out.mode = inputs.mode;
  if (inputs.max_iterations)
    out.max_iterations = Number(inputs.max_iterations);
  if (inputs.enable_auto_fix)
    out.enable_auto_fix = inputs.enable_auto_fix === "true";
  if (inputs.enable_scoring)
    out.enable_scoring = inputs.enable_scoring === "true";
  if (inputs.enable_test_generation)
    out.enable_test_generation = inputs.enable_test_generation === "true";
  if (inputs.project_context) out.project_context = inputs.project_context;
  if (inputs.test_runner) out.test_runner = inputs.test_runner;
  if (inputs.provider) {
    const providerModel = { provider: inputs.provider, model: "deepseek-v4-flash-free" };
    out.default_model = providerModel;
    out.models = {
      review: providerModel,
      fix: providerModel,
      audit: providerModel,
      score: providerModel,
      testgen: providerModel,
      chat: providerModel
    };
  }
  if (inputs.auto_merge) out.autoMerge = inputs.auto_merge === "true";
  if (inputs.jsonl_output) out.jsonl_output = inputs.jsonl_output === "true";
  if (inputs.mcp_enabled) out.mcp = { enabled: inputs.mcp_enabled === "true", servers: [] };
  if (inputs.learning_enabled) {
    out.learning = {
      enabled: inputs.learning_enabled === "true",
      dbPath: inputs.learning_db_path ?? DEFAULT_CONFIG.learning.dbPath
    };
  }
  return out;
}

// src/utils/logger.ts
var DEBUG_LEVEL = 10;
var INFO_LEVEL = 20;
var WARN_LEVEL = 30;
var ERROR_LEVEL = 40;
var LEVELS = {
  debug: DEBUG_LEVEL,
  info: INFO_LEVEL,
  warn: WARN_LEVEL,
  error: ERROR_LEVEL
};
var jsonMode = false;
var Logger = class {
  constructor(level = "info") {
    this.level = level;
  }
  setJsonMode(enabled) {
    jsonMode = enabled;
  }
  emit(level, args) {
    if (LEVELS[level] < LEVELS[this.level]) return;
    const msg = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
    if (jsonMode) {
      const entry = JSON.stringify({ level, message: msg, timestamp: new Date(Date.now()).toISOString() });
      if (level === "error") console.error(entry);
      else if (level === "warn") console.warn(entry);
      else if (level === "info") console.info(entry);
      else console.debug(entry);
      return;
    }
    const prefix = `[codesentinel:${level}]`;
    if (level === "error") console.error(prefix, ...args);
    else if (level === "warn") console.warn(prefix, ...args);
    else if (level === "info") console.info(prefix, ...args);
    else console.debug(prefix, ...args);
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
};
var logger = new Logger(
  process.env.CODESENTINEL_LOG_LEVEL || "info"
);

// src/utils/retry.ts
var DEFAULT_BASE_DELAY_MS = 1e3;
var HTTP_STATUS_429 = "429";
var HTTP_STATUS_503 = "503";
var HTTP_STATUS_502 = "502";
var DEFAULT_SHOULD_RETRY = (err) => {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("rate limit") || msg.includes("rate-limited") || msg.includes(HTTP_STATUS_429) || msg.includes(HTTP_STATUS_503) || msg.includes(HTTP_STATUS_502) || msg.includes("timeout") || msg.includes("econnreset") || msg.includes("overloaded");
  }
  return false;
};
async function retry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// src/github/reporter.ts
var GitHubReporter = class {
  constructor(coords) {
    this.coords = coords;
  }
  api = "https://api.github.com";
  headers() {
    return {
      Authorization: `Bearer ${this.coords.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
  async request(method, url, body) {
    return retry(async () => {
      const res = await fetch(url, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : void 0
      });
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining && Number(remaining) < 10) {
        logger.warn(`GitHub API rate limit low: ${remaining} requests remaining`);
      }
      if (res.status === 403 || res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const resetTime = res.headers.get("x-ratelimit-reset");
        let delayMs = 5e3;
        if (retryAfter) {
          delayMs = Number(retryAfter) * 1e3;
        } else if (resetTime) {
          delayMs = Math.max(0, Number(resetTime) * 1e3 - Date.now()) + 1e3;
        }
        logger.warn(`GitHub API rate limited, retrying after ${delayMs}ms`);
        throw new Error(`Rate limited (${res.status}), retrying after ${delayMs}ms`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`GitHub API ${res.status} ${res.statusText}: ${text}`);
      }
      return res.json().catch(() => null);
    }, {
      maxAttempts: 3,
      baseDelayMs: 2e3,
      shouldRetry: (err) => {
        if (err instanceof Error) {
          const msg = err.message.toLowerCase();
          return msg.includes("rate limit") || msg.includes("429") || msg.includes("403") || msg.includes("503");
        }
        return false;
      }
    });
  }
  /** Post a single review comment on a PR (inline if line+file provided). */
  async postReviewComment(opts) {
    if (!this.coords.pullNumber) return;
    const base = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/pulls/${this.coords.pullNumber}/comments`;
    if (opts.file && opts.line && opts.commitId) {
      await this.request("POST", base, {
        body: opts.body,
        path: opts.file,
        line: opts.line,
        commit_id: opts.commitId,
        side: "RIGHT"
      });
    } else {
      await this.postIssueComment(opts.body);
    }
  }
  /** Post a top-level comment on the PR / issue. */
  async postIssueComment(body) {
    if (!this.coords.pullNumber) return;
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues/${this.coords.pullNumber}/comments`;
    await this.request("POST", url, { body });
  }
  /** List all comments on a PR with pagination. */
  async listIssueComments() {
    if (!this.coords.pullNumber) return [];
    const comments = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues/${this.coords.pullNumber}/comments?per_page=${perPage}&page=${page}`;
      const result = await this.request("GET", url);
      if (!result || result.length === 0) break;
      comments.push(...result);
      if (result.length < perPage) break;
      page++;
    }
    return comments;
  }
  /** Create a GitHub issue (used by audit mode). */
  async createIssue(title, body) {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues`;
    await this.request("POST", url, { title, body });
  }
  /** Create a GitHub Check Run with annotations. */
  async createCheckRun(opts) {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/check-runs`;
    await this.request("POST", url, {
      name: opts.name,
      head_sha: opts.headSha,
      status: opts.status,
      conclusion: opts.conclusion,
      output: opts.output
    });
  }
  /** Set commit status (for gate results). */
  async setCommitStatus(opts) {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/statuses/${opts.sha}`;
    await this.request("POST", url, {
      state: opts.state,
      description: opts.description,
      context: opts.context
    });
  }
  /** Create a new branch from an existing SHA. */
  async createBranch(branchName, sha) {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/git/refs`;
    await this.request("POST", url, { ref: `refs/heads/${branchName}`, sha });
  }
  /** Create a pull request and return its number. */
  async createPR(opts) {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/pulls`;
    const result = await this.request("POST", url, {
      title: opts.title,
      body: opts.body,
      head: opts.head,
      base: opts.base
    });
    return result.number;
  }
  /** Enable auto-merge on a PR (merges when all required checks pass). */
  async enableAutoMerge(pullNumber, mergeMethod = "squash") {
    try {
      const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/pulls/${pullNumber}/merge`;
      await this.request("PUT", url, { merge_method: mergeMethod });
    } catch {
      logger.warn("enableAutoMerge: auto-merge not available, trying squash");
    }
  }
  /** Get the default branch name and its latest commit SHA. */
  async getDefaultBranch() {
    const repoUrl = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}`;
    const repo = await this.request("GET", repoUrl);
    const branchUrl = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/branches/${repo.default_branch}`;
    const branch = await this.request("GET", branchUrl);
    return { name: repo.default_branch, sha: branch.commit.sha };
  }
};

// src/ai/provider.ts
var ProviderUnavailableError = class extends Error {
  constructor(provider, reason) {
    super(`Provider "${provider}" unavailable: ${reason}`);
    this.name = "ProviderUnavailableError";
  }
};
function extractJson(text) {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      logger.warn("extractJson: No JSON object found in model response");
      return null;
    }
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    logger.warn(`extractJson: Failed to parse JSON \u2014 ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// src/ai/openai.ts
var DEFAULT_MAX_TOKENS = 4096;
var OpenAIProvider = class {
  constructor(secrets) {
    this.secrets = secrets;
    if (!secrets.openai_api_key) {
      throw new ProviderUnavailableError("openai", "missing OPENAI_API_KEY");
    }
  }
  name = "openai";
  client = null;
  initializing = null;
  /** Lazily import and construct the optional SDK exactly once. */
  async getClient() {
    if (this.client) return this.client;
    if (!this.initializing) {
      this.initializing = import("openai").then((mod) => {
        const OpenAI = mod.default ?? mod.OpenAI;
        return new OpenAI({ apiKey: this.secrets.openai_api_key });
      });
    }
    try {
      this.client = await this.initializing;
    } catch (e) {
      this.initializing = null;
      throw new ProviderUnavailableError(
        "openai",
        "Failed to initialize OpenAI client: " + (e instanceof Error ? e.message : String(e))
      );
    }
    return this.client;
  }
  async complete(req) {
    try {
      const client = await this.getClient();
      const res = await client.chat.completions.create({
        model: req.model.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS
      });
      const message = res.choices?.[0]?.message?.content ?? "";
      return {
        content: message,
        model: req.model.model,
        provider: this.name,
        usage: {
          promptTokens: res.usage?.prompt_tokens,
          completionTokens: res.usage?.completion_tokens
        }
      };
    } catch (error) {
      if (error instanceof ProviderUnavailableError) throw error;
      throw new ProviderUnavailableError(
        "openai",
        "OpenAI API call failed: " + (error instanceof Error ? error.message : String(error))
      );
    }
  }
};
function openaiFactory(secrets) {
  try {
    return new OpenAIProvider(secrets);
  } catch {
    return null;
  }
}

// src/ai/anthropic.ts
var DEFAULT_MAX_TOKENS2 = 4096;
var AnthropicProvider = class {
  constructor(secrets) {
    this.secrets = secrets;
    if (!secrets.anthropic_api_key) {
      throw new ProviderUnavailableError("anthropic", "missing ANTHROPIC_API_KEY");
    }
  }
  name = "anthropic";
  client = null;
  initializing = null;
  async getClient() {
    if (this.client) return this.client;
    if (!this.initializing) {
      this.initializing = import("@anthropic-ai/sdk").then((mod) => {
        const Anthropic = mod.default ?? mod.Anthropic;
        return new Anthropic({ apiKey: this.secrets.anthropic_api_key });
      });
    }
    try {
      this.client = await this.initializing;
    } catch (err) {
      this.initializing = null;
      this.client = null;
      throw new Error(
        `[anthropic] Failed to initialize client: ${err.message}`
      );
    }
    return this.client;
  }
  async complete(req) {
    let client;
    try {
      client = await this.getClient();
    } catch (err) {
      throw new Error(
        `[anthropic] Cannot get client: ${err.message}`
      );
    }
    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    const messages = req.messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    }));
    let res;
    try {
      res = await client.messages.create({
        model: req.model.model,
        system,
        messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS2
      });
    } catch (err) {
      throw new Error(
        `[anthropic] API call failed: ${err.message}`
      );
    }
    const text = Array.isArray(res.content) ? res.content.map((b) => b.text ?? "").join("") : String(res.content);
    return {
      content: text,
      model: req.model.model,
      provider: this.name,
      usage: {
        promptTokens: res.usage?.input_tokens,
        completionTokens: res.usage?.output_tokens
      }
    };
  }
};
function anthropicFactory(secrets) {
  try {
    return new AnthropicProvider(secrets);
  } catch {
    return null;
  }
}

// src/ai/gemini.ts
var DEFAULT_MAX_OUTPUT_TOKENS = 4096;
var GeminiProvider = class {
  constructor(secrets) {
    this.secrets = secrets;
    if (!secrets.gemini_api_key) {
      throw new ProviderUnavailableError("gemini", "missing GEMINI_API_KEY");
    }
  }
  name = "gemini";
  client = null;
  model = null;
  initializing = null;
  async getModel(req) {
    if (this.model) return this.model;
    if (!this.initializing) {
      this.initializing = import("@google/generative-ai").then((mod) => {
        const { GoogleGenerativeAI } = mod;
        const genAI = new GoogleGenerativeAI(this.secrets.gemini_api_key);
        return genAI.getGenerativeModel({ model: req.model.model });
      });
    }
    try {
      this.model = await this.initializing;
    } catch (err) {
      this.initializing = null;
      throw new ProviderUnavailableError(
        "gemini",
        `failed to initialize model: ${err.message}`
      );
    }
    return this.model;
  }
  async #generateContent(model, prompt, req) {
    try {
      return await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
        }
      });
    } catch (err) {
      throw new Error(
        `Gemini generateContent failed: ${err.message}`
      );
    }
  }
  async complete(req) {
    let model;
    try {
      model = await this.getModel(req);
    } catch (err) {
      throw new ProviderUnavailableError(
        "gemini",
        `failed to get model: ${err.message}`
      );
    }
    const prompt = req.messages.map((m) => `${m.role.toUpperCase()}:
${m.content}`).join("\n\n");
    const res = await this.#generateContent(model, prompt, req);
    const text = res.response?.text?.() ?? "";
    return { content: text, model: req.model.model, provider: this.name };
  }
};
function geminiFactory(secrets) {
  try {
    return new GeminiProvider(secrets);
  } catch {
    return null;
  }
}

// src/ai/opencode.ts
var DEFAULT_MAX_TOKENS3 = 4096;
var OpenCodeProvider = class {
  name = "opencode";
  baseUrl;
  apiKey;
  constructor(secrets) {
    this.apiKey = secrets.opencode_api_key || "opencode";
    this.baseUrl = (secrets.opencode_base_url || "http://localhost:4096").replace(/\/v1$/, "").replace(/\/$/, "");
  }
  async complete(req) {
    const url = `${this.baseUrl}/v1/chat/completions`;
    logger.info(`OpenCodeProvider.complete: POST ${url} model=${req.model.model}`);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: req.model.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS3
        })
      });
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : String(err);
      logger.error(`OpenCodeProvider.complete: NETWORK ERROR \u2014 ${msg2}`);
      throw new ProviderUnavailableError("opencode", `cannot reach ${this.baseUrl} \u2014 ${msg2}. Check OPENCODE_BASE_URL or switch provider via --provider.`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const snippet = body.slice(0, 200);
      logger.error(`OpenCodeProvider.complete: HTTP ${res.status} \u2014 ${snippet}`);
      throw new Error(`OpenCode API error ${res.status}: ${snippet}`);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    let content = msg?.content ?? "";
    if (!content && msg?.reasoning_content) {
      content = msg.reasoning_content;
    }
    if (!content) {
      logger.debug(`OpenCodeProvider: empty content \u2014 raw keys=${Object.keys(msg ?? {})} response_keys=${Object.keys(data)}`);
    }
    logger.info(`OpenCodeProvider.complete: SUCCESS \u2014 tokens_in=${data?.usage?.prompt_tokens} tokens_out=${data?.usage?.completion_tokens}`);
    return {
      content,
      model: req.model.model,
      provider: this.name,
      usage: {
        promptTokens: data?.usage?.prompt_tokens,
        completionTokens: data?.usage?.completion_tokens
      }
    };
  }
};
function opencodeFactory(secrets) {
  try {
    return new OpenCodeProvider(secrets);
  } catch {
    return null;
  }
}

// src/ai/index.ts
var AIHub = class {
  constructor(config, secrets) {
    this.config = config;
    this.secrets = secrets;
  }
  providers = /* @__PURE__ */ new Map();
  factories = {
    openai: openaiFactory,
    anthropic: anthropicFactory,
    gemini: geminiFactory,
    opencode: opencodeFactory
  };
  /** Resolve the model configuration for a task, falling back to default. */
  modelForTask(task) {
    return this.config.models[task] ?? this.config.default_model;
  }
  /** Get (or lazily build) the provider for a given model. */
  providerFor(model) {
    const existing = this.providers.get(model.provider);
    if (existing) return existing;
    const factory = this.factories[model.provider];
    if (!factory) {
      throw new Error(`Unknown provider: "${model.provider}". Supported providers: openai, anthropic, gemini, opencode.`);
    }
    const provider = factory(this.secrets);
    if (!provider) {
      const keyEnvMap = {
        openai: "OPENAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        gemini: "GEMINI_API_KEY",
        opencode: "OPENCODE_API_KEY"
      };
      const keyName = keyEnvMap[model.provider] ?? `${model.provider.toUpperCase()}_API_KEY`;
      throw new ProviderUnavailableError(
        model.provider,
        `Could not initialize. Ensure ${keyName} is set. See README for configuration.`
      );
    }
    this.providers.set(model.provider, provider);
    return provider;
  }
  /** Run a completion for a task with the resolved model. Retries on transient errors. */
  async complete(task, messages, opts = {}) {
    const model = this.modelForTask(task);
    const provider = this.providerFor(model);
    logger.info(`AIHub.complete: task=${task} provider=${provider.name} model=${model.model}`);
    return retry(
      () => provider.complete({
        model,
        messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens
      })
    );
  }
};

// src/prompts/index.ts
import { readFileSync as readFileSync3, existsSync as existsSync3 } from "node:fs";
import { resolve as resolve3, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = dirname(fileURLToPath(import.meta.url));
var DEFAULT_PROMPT_DIR = resolve3(__dirname, "..", "..", "prompts");
var PromptRegistry = class {
  constructor(config, promptDir = DEFAULT_PROMPT_DIR) {
    this.config = config;
    this.promptDir = promptDir;
  }
  cache = /* @__PURE__ */ new Map();
  /** Load a prompt by name, honoring `custom_prompt_paths` overrides. */
  load(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const custom = this.config.custom_prompt_paths[name];
    const candidates = [
      custom && resolve3(custom),
      join(this.promptDir, `${name}.md`)
    ].filter(Boolean);
    for (const path of candidates) {
      if (path && existsSync3(path)) {
        const content = readFileSync3(path, "utf8");
        this.cache.set(name, content);
        return content;
      }
    }
    throw new Error(`Prompt "${name}" not found in ${candidates.join(", ")}`);
  }
  /** Render a prompt, replacing {{var}} placeholders with provided values. */
  render(name, vars) {
    const template = this.load(name);
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      const value = vars[key];
      if (value === void 0 || value === null) return "";
      return String(value);
    });
  }
};

// src/utils/files.ts
import { readFileSync as readFileSync4, writeFileSync, readdirSync, statSync, existsSync as existsSync4, mkdirSync } from "node:fs";
import { join as join2, relative, resolve as resolve4 } from "node:path";
function globToRegExp(glob) {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 2;
        if (glob[i] === "/") i += 1;
        continue;
      }
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
      } else {
        const opts = glob.slice(i + 1, end).split(",");
        re += "(?:" + opts.map(escapeRe).join("|") + ")";
        i = end + 1;
        continue;
      }
    } else if (c === "." || c === "+" || c === "^" || c === "$") {
      re += "\\" + c;
    } else if (c === "/") {
      re += "/";
    } else {
      re += c;
    }
    i++;
  }
  return new RegExp("^" + re + "$");
}
function escapeRe(s) {
  return s.replace(/[.+^$*?{}|\\]/g, "\\$&");
}
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".cache", ".codesentinel-cache", "coverage", "codesentinel"]);
function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join2(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(full);
      else out.push(relative(root, full));
    }
  }
  return out;
}
function readIgnoreFile(root) {
  const ignorePath = resolve4(root, ".codesentinelignore");
  if (!existsSync4(ignorePath)) return [];
  try {
    const content = readFileSync4(ignorePath, "utf8");
    return content.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
  } catch {
    return [];
  }
}
function collectFiles(root, include, exclude) {
  const ignorePatterns = readIgnoreFile(root);
  const allExclude = [...exclude, ...ignorePatterns];
  const incRe = include.map(globToRegExp);
  const excRe = allExclude.map(globToRegExp);
  const all = walk(root);
  return all.filter((rel) => {
    const normalized = rel.split("\\").join("/");
    if (!incRe.some((re) => re.test(normalized))) return false;
    if (excRe.some((re) => re.test(normalized))) return false;
    return true;
  });
}
function readText(path) {
  try {
    return readFileSync4(path, "utf8");
  } catch {
    return "";
  }
}
function languageOf(path) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    go: "go",
    java: "java",
    rb: "ruby",
    rs: "rust",
    c: "c",
    cpp: "cpp",
    cs: "csharp"
  };
  return map[ext] ?? "text";
}
function ensureDir(path) {
  if (!existsSync4(path)) mkdirSync(path, { recursive: true });
}

// src/analyzer/enhanced.ts
var EnhancedAnalyzer = class {
  severityConfig;
  confidenceThresholds;
  customRules;
  analysisContext;
  constructor(severityConfig, confidenceThresholds, customRules) {
    this.severityConfig = {
      highRiskPatterns: ["src/", "lib/", "app/"],
      lowRiskPatterns: ["test/", "tests/", "__tests__/", ".test.", ".spec."],
      historyBasedAdjustment: true,
      changeFrequencyMultiplier: 1.5,
      ...severityConfig
    };
    this.confidenceThresholds = {
      security: 0.7,
      bug: 0.6,
      performance: 0.5,
      smell: 0.4,
      style: 0.3,
      ...confidenceThresholds
    };
    this.customRules = customRules || [];
    this.analysisContext = {
      fileHistory: /* @__PURE__ */ new Map(),
      sessionStart: Date.now()
    };
  }
  /**
   * Analyze a file with enhanced features.
   */
  analyze(path, content, options) {
    const startTime = Date.now();
    const findings = [];
    findings.push(...this.analyzeWithDynamicSeverity(path, content, options?.fileHistory));
    findings.push(...this.applyCustomRules(path, content));
    const filteredFindings = this.filterByConfidence(findings);
    return filteredFindings;
  }
  /**
   * Analyze with dynamic severity adjustment based on file context.
   */
  analyzeWithDynamicSeverity(path, content, fileHistory) {
    const findings = [];
    const lines = content.split("\n");
    const severityMultiplier = this.calculateSeverityMultiplier(path, fileHistory);
    lines.forEach((line, idx) => {
      if (/api[_-]?key\s*=\s*["'][A-Za-z0-9_\-]{16,}/i.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("high", severityMultiplier),
          "security",
          path,
          idx + 1,
          "Possible hardcoded API key detected.",
          "Move secrets to environment variables or a secrets manager.",
          0.9
          // High confidence
        ));
      }
      if (/\bconsole\.(log|debug)\(/.test(line) && !path.includes(".test.")) {
        findings.push(this.createFinding(
          this.adjustSeverity("low", severityMultiplier),
          "smell",
          path,
          idx + 1,
          "Debug logging left in source.",
          "Remove or replace with a proper logger.",
          0.8
          // High confidence
        ));
      }
      if (/\beval\s*\(/.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("critical", severityMultiplier),
          "security",
          path,
          idx + 1,
          "Use of eval() is dangerous and can lead to code injection.",
          "Avoid eval; parse structured input instead.",
          0.95
          // Very high confidence
        ));
      }
      if (/(TODO|FIXME|XXX)\b/.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("info", severityMultiplier),
          "smell",
          path,
          idx + 1,
          "Tech-debt marker (TODO/FIXME) found.",
          "Link to a tracked issue where possible.",
          0.9
          // High confidence
        ));
      }
      if (/password\s*=\s*["'][^"']+["']/i.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("high", severityMultiplier),
          "security",
          path,
          idx + 1,
          "Possible hardcoded password detected.",
          "Use environment variables or a secrets manager.",
          0.85
          // High confidence
        ));
      }
      if (/\bprocess\.exit\s*\(/.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("medium", severityMultiplier),
          "smell",
          path,
          idx + 1,
          "Direct process.exit() call found.",
          "Use exceptions or return codes for cleaner shutdown.",
          0.9
          // High confidence
        ));
      }
    });
    findings.push(...this.detectDeepNesting(path, lines, severityMultiplier));
    findings.push(...this.detectMagicNumbers(path, lines, severityMultiplier));
    findings.push(...this.detectMissingErrorHandling(path, content, severityMultiplier));
    findings.push(...this.detectLongFunctions(path, lines, severityMultiplier));
    return findings;
  }
  /**
   * Calculate severity multiplier based on file risk level.
   */
  calculateSeverityMultiplier(path, fileHistory) {
    let multiplier = 1;
    if (this.severityConfig.highRiskPatterns.some((pattern) => path.includes(pattern))) {
      multiplier *= 1.3;
    }
    if (this.severityConfig.lowRiskPatterns.some((pattern) => path.includes(pattern))) {
      multiplier *= 0.7;
    }
    if (this.severityConfig.historyBasedAdjustment && fileHistory) {
      if (fileHistory.changeCount > 10) {
        multiplier *= this.severityConfig.changeFrequencyMultiplier;
      }
      if (fileHistory.findingDensity > 0.1) {
        multiplier *= 1.2;
      }
    }
    return Math.min(Math.max(multiplier, 0.5), 2);
  }
  /**
   * Adjust severity based on multiplier.
   */
  adjustSeverity(baseSeverity, multiplier) {
    const severityOrder = ["info", "low", "medium", "high", "critical"];
    const baseIndex = severityOrder.indexOf(baseSeverity);
    const adjustedIndex = Math.round(baseIndex * multiplier);
    const clampedIndex = Math.min(Math.max(adjustedIndex, 0), severityOrder.length - 1);
    return severityOrder[clampedIndex];
  }
  /**
   * Create a finding with confidence metadata.
   */
  createFinding(severity, category, file, line, comment, suggestion, confidence) {
    return {
      severity,
      category,
      file,
      line,
      comment,
      suggestion,
      source: "static",
      // @ts-ignore - Adding confidence metadata
      confidence
    };
  }
  /**
   * Apply custom rules to the file content.
   */
  applyCustomRules(path, content) {
    const findings = [];
    for (const rule of this.customRules) {
      if (rule.filePatterns && !rule.filePatterns.some((pattern) => path.includes(pattern))) {
        continue;
      }
      try {
        const regex = new RegExp(rule.pattern, "gi");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            findings.push(this.createFinding(
              rule.severity,
              rule.category,
              path,
              idx + 1,
              rule.comment,
              rule.suggestion || "",
              rule.confidence || 0.7
            ));
          }
        });
      } catch {
      }
    }
    return findings;
  }
  /**
   * Filter findings by confidence thresholds.
   */
  filterByConfidence(findings) {
    return findings.filter((finding) => {
      const confidence = finding.confidence || 0.5;
      const threshold = this.confidenceThresholds[finding.category] || 0.5;
      return confidence >= threshold;
    });
  }
  /**
   * Detect deep nesting with severity adjustment.
   */
  detectDeepNesting(path, lines, severityMultiplier) {
    const findings = [];
    const maxDepth = 4;
    let blockStart = -1;
    let blockDepth = 0;
    lines.forEach((line, idx) => {
      const indent = line.search(/\S/);
      if (indent >= 0) {
        const depth = Math.floor(indent / 2);
        if (depth > maxDepth) {
          if (blockStart === -1) {
            blockStart = idx + 1;
            blockDepth = depth;
          }
          if (depth > blockDepth) blockDepth = depth;
          return;
        }
      }
      if (blockStart !== -1) {
        findings.push(this.createFinding(
          this.adjustSeverity("medium", severityMultiplier),
          "smell",
          path,
          blockStart,
          `Deep nesting detected (depth: ${blockDepth}, lines ${blockStart}-${idx}).`,
          "Consider extracting logic into separate functions.",
          Math.min(0.5 + (blockDepth - maxDepth) * 0.1, 0.9)
        ));
        blockStart = -1;
        blockDepth = 0;
      }
    });
    if (blockStart !== -1) {
      findings.push(this.createFinding(
        this.adjustSeverity("medium", severityMultiplier),
        "smell",
        path,
        blockStart,
        `Deep nesting detected (depth: ${blockDepth}, lines ${blockStart}-${lines.length}).`,
        "Consider extracting logic into separate functions.",
        Math.min(0.5 + (blockDepth - maxDepth) * 0.1, 0.9)
      ));
    }
    return findings;
  }
  /**
   * Detect magic numbers with severity adjustment.
   */
  detectMagicNumbers(path, lines, severityMultiplier) {
    const findings = [];
    const magicNumberRegex = /(?<![a-zA-Z_])\b(?!0\b|1\b|-1\b|2\b)\d{2,}\b(?![a-zA-Z_])/g;
    lines.forEach((line, idx) => {
      if (line.trim().startsWith("//") || line.trim().startsWith("import") || line.trim().startsWith("export")) {
        return;
      }
      let match;
      while ((match = magicNumberRegex.exec(line)) !== null) {
        findings.push(this.createFinding(
          this.adjustSeverity("low", severityMultiplier),
          "smell",
          path,
          idx + 1,
          `Magic number ${match[0]} detected.`,
          "Consider extracting to a named constant.",
          0.7
          // Medium confidence
        ));
      }
    });
    return findings;
  }
  /**
   * Detect missing error handling with severity adjustment.
   */
  detectMissingErrorHandling(path, content, severityMultiplier) {
    const findings = [];
    const lines = content.split("\n");
    const inTryBlock = /* @__PURE__ */ new Set();
    let tryStart = -1;
    let braceCount = 0;
    lines.forEach((line, idx) => {
      if (tryStart >= 0) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        if (braceCount <= 0) {
          for (let i = tryStart; i <= idx; i++) {
            inTryBlock.add(i);
          }
          tryStart = -1;
        }
      } else if (/\btry\s*\{/.test(line)) {
        tryStart = idx;
        braceCount = 1;
      }
    });
    lines.forEach((line, idx) => {
      if (inTryBlock.has(idx)) return;
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
      if (/\bawait\b/.test(line) && !/\b(try|catch)\b/.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("low", severityMultiplier),
          "smell",
          path,
          idx + 1,
          "Await call without error handling.",
          "Wrap in try/catch for proper error handling.",
          0.8
          // High confidence
        ));
      }
    });
    return findings;
  }
  /**
   * Detect long functions with severity adjustment.
   */
  detectLongFunctions(path, lines, severityMultiplier) {
    const findings = [];
    let functionStart = -1;
    let functionName = "";
    let braceCount = 0;
    lines.forEach((line, idx) => {
      const functionMatch = line.match(/(?:function|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function))\s+(\w+)?/);
      if (functionMatch && functionStart === -1) {
        functionStart = idx;
        functionName = functionMatch[1] || "anonymous";
        braceCount = 0;
      }
      if (functionStart >= 0) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        if (braceCount <= 0 && idx > functionStart) {
          const functionLength = idx - functionStart;
          if (functionLength > 50) {
            findings.push(this.createFinding(
              this.adjustSeverity("medium", severityMultiplier),
              "smell",
              path,
              functionStart + 1,
              `Long function "${functionName}" (${functionLength} lines).`,
              "Consider breaking into smaller functions.",
              Math.min(0.5 + (functionLength - 50) * 0.01, 0.9)
              // Longer = higher confidence
            ));
          }
          functionStart = -1;
        }
      }
    });
    return findings;
  }
  /**
   * Analyze multiple files with enhanced features.
   */
  analyzeMany(files, options) {
    return files.flatMap(
      (f) => this.analyze(f.path, f.content, {
        fileHistory: options?.fileHistories?.get(f.path),
        previousFindings: options?.previousFindings?.get(f.path)
      })
    );
  }
  /**
   * Update analysis context with new file history.
   */
  updateContext(fileHistory) {
    this.analysisContext.fileHistory = fileHistory;
  }
  /**
   * Get analysis context for comparison.
   */
  getContext() {
    return { ...this.analysisContext };
  }
  /**
   * Add a custom rule.
   */
  addCustomRule(rule) {
    this.customRules.push(rule);
  }
  /**
   * Remove a custom rule by ID.
   */
  removeCustomRule(ruleId) {
    this.customRules = this.customRules.filter((rule) => rule.id !== ruleId);
  }
  /**
   * Update confidence thresholds.
   */
  updateConfidenceThresholds(thresholds) {
    this.confidenceThresholds = { ...this.confidenceThresholds, ...thresholds };
  }
  /**
   * Update severity adjustment configuration.
   */
  updateSeverityConfig(config) {
    this.severityConfig = { ...this.severityConfig, ...config };
  }
};

// src/analyzer/cache.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync5, mkdirSync as mkdirSync2, readFileSync as readFileSync5, writeFileSync as writeFileSync2, statSync as statSync2 } from "node:fs";
import { join as join3 } from "node:path";
var AnalysisCache = class {
  cacheDir;
  config;
  memoryCache = /* @__PURE__ */ new Map();
  constructor(cacheDir, config) {
    this.cacheDir = cacheDir;
    this.config = {
      maxAgeMs: 24 * 60 * 60 * 1e3,
      // 24 hours
      maxEntries: 1e3,
      enableCompression: false,
      ...config
    };
    if (!existsSync5(cacheDir)) {
      mkdirSync2(cacheDir, { recursive: true });
    }
    this.loadMemoryCache();
  }
  /**
   * Generate a cache key for an analysis.
   */
  generateKey(filePath, content, configHash) {
    const contentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);
    return `${filePath}-${contentHash}-${configHash}`;
  }
  /**
   * Get cached analysis results.
   */
  get(filePath, content, configHash) {
    const key = this.generateKey(filePath, content, configHash);
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && this.isValid(memoryEntry)) {
      return memoryEntry;
    }
    const diskEntry = this.loadFromDisk(key);
    if (diskEntry && this.isValid(diskEntry)) {
      this.memoryCache.set(key, diskEntry);
      return diskEntry;
    }
    return null;
  }
  /**
   * Store analysis results in cache.
   */
  set(filePath, content, configHash, findings, metadata) {
    const key = this.generateKey(filePath, content, configHash);
    const contentHash = createHash("sha256").update(content).digest("hex");
    const entry = {
      key,
      timestamp: Date.now(),
      filePath,
      contentHash,
      findings,
      metadata: {
        ...metadata,
        configHash
      }
    };
    this.memoryCache.set(key, entry);
    this.saveToDisk(key, entry);
    this.evictOldEntries();
  }
  /**
   * Compare two analysis results.
   */
  compare(previousFindings, currentFindings) {
    const previousMap = new Map(previousFindings.map((f, i) => [`${f.file}:${f.line}:${f.comment}`, f]));
    const currentMap = new Map(currentFindings.map((f, i) => [`${f.file}:${f.line}:${f.comment}`, f]));
    const newFindings = [];
    const fixedFindings = [];
    const unchangedFindings = [];
    const modifiedFindings = [];
    for (const [key, current] of currentMap) {
      const previous = previousMap.get(key);
      if (!previous) {
        newFindings.push(current);
      } else {
        const changes = this.detectChanges(previous, current);
        if (changes.length > 0) {
          modifiedFindings.push({ previous, current, changes });
        } else {
          unchangedFindings.push(current);
        }
      }
    }
    for (const [key, previous] of previousMap) {
      if (!currentMap.has(key)) {
        fixedFindings.push(previous);
      }
    }
    const previousTotal = previousFindings.length;
    const currentTotal = currentFindings.length;
    const netChange = currentTotal - previousTotal;
    const percentageChange = previousTotal > 0 ? netChange / previousTotal * 100 : 0;
    return {
      newFindings,
      fixedFindings,
      unchangedFindings,
      modifiedFindings,
      summary: {
        previousTotal,
        currentTotal,
        netChange,
        percentageChange
      }
    };
  }
  /**
   * Detect changes between two findings.
   */
  detectChanges(previous, current) {
    const changes = [];
    if (previous.severity !== current.severity) {
      changes.push(`severity: ${previous.severity} \u2192 ${current.severity}`);
    }
    if (previous.category !== current.category) {
      changes.push(`category: ${previous.category} \u2192 ${current.category}`);
    }
    if (previous.comment !== current.comment) {
      changes.push(`comment changed`);
    }
    if (previous.suggestion !== current.suggestion) {
      changes.push(`suggestion changed`);
    }
    return changes;
  }
  /**
   * Check if a cache entry is still valid.
   */
  isValid(entry) {
    const age = Date.now() - entry.timestamp;
    return age < this.config.maxAgeMs;
  }
  /**
   * Load entry from disk cache.
   */
  loadFromDisk(key) {
    try {
      const filePath = join3(this.cacheDir, `${key}.json`);
      if (!existsSync5(filePath)) return null;
      const content = readFileSync5(filePath, "utf8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  /**
   * Save entry to disk cache.
   */
  saveToDisk(key, entry) {
    try {
      const filePath = join3(this.cacheDir, `${key}.json`);
      writeFileSync2(filePath, JSON.stringify(entry), "utf8");
    } catch {
    }
  }
  /**
   * Load memory cache from disk on startup.
   */
  loadMemoryCache() {
    try {
      const files = __require("node:fs").readdirSync(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join3(this.cacheDir, file);
        const content = readFileSync5(filePath, "utf8");
        const entry = JSON.parse(content);
        if (this.isValid(entry)) {
          this.memoryCache.set(entry.key, entry);
        }
      }
    } catch {
    }
  }
  /**
   * Evict old entries when cache exceeds max size.
   */
  evictOldEntries() {
    if (this.memoryCache.size <= this.config.maxEntries) return;
    const entries = Array.from(this.memoryCache.values()).sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = entries.slice(0, entries.length - this.config.maxEntries);
    for (const entry of toRemove) {
      this.memoryCache.delete(entry.key);
      try {
        const filePath = join3(this.cacheDir, `${entry.key}.json`);
        if (existsSync5(filePath)) {
          __require("node:fs").unlinkSync(filePath);
        }
      } catch {
      }
    }
  }
  /**
   * Clear all cache entries.
   */
  clear() {
    this.memoryCache.clear();
    try {
      const files = __require("node:fs").readdirSync(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join3(this.cacheDir, file);
        __require("node:fs").unlinkSync(filePath);
      }
    } catch {
    }
  }
  /**
   * Get cache statistics.
   */
  getStats() {
    let diskEntries = 0;
    let totalSizeBytes = 0;
    try {
      const files = __require("node:fs").readdirSync(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        diskEntries++;
        const filePath = join3(this.cacheDir, file);
        const stat = statSync2(filePath);
        totalSizeBytes += stat.size;
      }
    } catch {
    }
    return {
      memoryEntries: this.memoryCache.size,
      diskEntries,
      totalSizeBytes
    };
  }
};
function generateConfigHash(config) {
  const sortedConfig = Object.keys(config).sort().reduce((acc, key) => {
    acc[key] = config[key];
    return acc;
  }, {});
  return createHash("sha256").update(JSON.stringify(sortedConfig)).digest("hex").slice(0, 16);
}

// src/analyzer/progressive.ts
var ProgressiveAnalyzer = class {
  config;
  multiFileConfig;
  constructor(config, multiFileConfig) {
    this.config = {
      quickScanRules: ["security", "critical"],
      standardScanRules: ["security", "bug", "performance", "smell"],
      deepScanRules: ["security", "bug", "performance", "smell", "style", "experimental"],
      autoEscalate: true,
      escalationThreshold: 5,
      ...config
    };
    this.multiFileConfig = {
      maxConcurrentFiles: 10,
      analyzeDependencies: true,
      analyzeImports: true,
      analyzePatterns: true,
      fileGroupPatterns: ["src/", "lib/", "test/"],
      ...multiFileConfig
    };
  }
  /**
   * Perform progressive analysis starting with quick scan.
   */
  async analyzeProgressive(files, analyzer) {
    const results = [];
    let totalFindings = [];
    const quickResult = await this.performAnalysis(
      files,
      analyzer,
      "quick",
      this.config.quickScanRules
    );
    results.push(quickResult);
    totalFindings.push(...quickResult.findings);
    if (this.config.autoEscalate && quickResult.findings.length >= this.config.escalationThreshold) {
      const standardResult = await this.performAnalysis(
        files,
        analyzer,
        "standard",
        this.config.standardScanRules
      );
      results.push(standardResult);
      totalFindings.push(...standardResult.findings);
      if (standardResult.findings.length >= this.config.escalationThreshold) {
        const deepResult = await this.performAnalysis(
          files,
          analyzer,
          "deep",
          this.config.deepScanRules
        );
        results.push(deepResult);
        totalFindings.push(...deepResult.findings);
      }
    }
    results.forEach((r) => {
      r.totalFindings = totalFindings.length;
    });
    return results;
  }
  /**
   * Perform analysis at a specific depth.
   */
  async performAnalysis(files, analyzer, depth, rules) {
    const startTime = Date.now();
    const findings = [];
    for (const file of files) {
      const fileFindings = analyzer(file.path, file.content, rules);
      findings.push(...fileFindings);
    }
    return {
      depth,
      findings,
      escalated: false,
      durationMs: Date.now() - startTime,
      rulesApplied: rules,
      totalFindings: findings.length
    };
  }
  /**
   * Perform multi-file analysis with cross-file insights.
   */
  async analyzeMultiFile(files, analyzer) {
    const fileResults = /* @__PURE__ */ new Map();
    const crossFileFindings = [];
    for (const file of files) {
      const findings = analyzer(file.path, file.content);
      fileResults.set(file.path, findings);
    }
    if (this.multiFileConfig.analyzeDependencies) {
      const dependencyAnalysis = this.analyzeDependencies(files);
      crossFileFindings.push(...this.generateDependencyFindings(dependencyAnalysis));
    }
    if (this.multiFileConfig.analyzeImports) {
      const importExportAnalysis = this.analyzeImportsExports(files);
      crossFileFindings.push(...this.generateImportExportFindings(importExportAnalysis));
    }
    if (this.multiFileConfig.analyzePatterns) {
      const patternAnalysis = this.analyzePatterns(files);
      crossFileFindings.push(...this.generatePatternFindings(patternAnalysis));
    }
    const totalFindings = Array.from(fileResults.values()).reduce((sum, findings) => sum + findings.length, 0) + crossFileFindings.length;
    let mostProblematicFile = "";
    let mostProblematicFileFindings = 0;
    for (const [file, findings] of fileResults) {
      if (findings.length > mostProblematicFileFindings) {
        mostProblematicFile = file;
        mostProblematicFileFindings = findings.length;
      }
    }
    return {
      fileResults,
      crossFileFindings,
      summary: {
        totalFiles: files.length,
        totalFindings,
        averageFindingsPerFile: files.length > 0 ? totalFindings / files.length : 0,
        mostProblematicFile,
        mostProblematicFileFindings
      }
    };
  }
  /**
   * Analyze dependencies between files.
   */
  analyzeDependencies(files) {
    const graph = /* @__PURE__ */ new Map();
    const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    const requireRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;
    for (const file of files) {
      const dependencies = /* @__PURE__ */ new Set();
      let match;
      importRegex.lastIndex = 0;
      requireRegex.lastIndex = 0;
      while ((match = importRegex.exec(file.content)) !== null) {
        const dep = this.resolveDependency(file.path, match[1]);
        if (dep) dependencies.add(dep);
      }
      while ((match = requireRegex.exec(file.content)) !== null) {
        const dep = this.resolveDependency(file.path, match[1]);
        if (dep) dependencies.add(dep);
      }
      graph.set(file.path, dependencies);
    }
    const circularDependencies = this.detectCircularDependencies(graph);
    const fanIn = /* @__PURE__ */ new Map();
    const fanOut = /* @__PURE__ */ new Map();
    for (const [file, deps] of graph) {
      fanOut.set(file, deps.size);
      for (const dep of deps) {
        fanIn.set(dep, (fanIn.get(dep) || 0) + 1);
      }
    }
    const highFanOut = Array.from(fanOut.entries()).filter(([_, count]) => count > 10).map(([file, _]) => file);
    const highFanIn = Array.from(fanIn.entries()).filter(([_, count]) => count > 10).map(([file, _]) => file);
    return {
      graph,
      circularDependencies,
      highFanOut,
      highFanIn
    };
  }
  /**
   * Resolve a dependency path relative to a file.
   */
  resolveDependency(filePath, importPath) {
    if (importPath.startsWith(".")) {
      const parts = filePath.split("/");
      parts.pop();
      for (const segment of importPath.split("/")) {
        if (segment === "..") {
          parts.pop();
        } else if (segment !== ".") {
          parts.push(segment);
        }
      }
      return parts.join("/");
    }
    return null;
  }
  /**
   * Detect circular dependencies in the graph.
   */
  detectCircularDependencies(graph) {
    const cycles = [];
    const visited = /* @__PURE__ */ new Set();
    const recursionStack = /* @__PURE__ */ new Set();
    const dfs = (node, path) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);
      const deps = graph.get(node) || /* @__PURE__ */ new Set();
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep, [...path]);
        } else if (recursionStack.has(dep)) {
          const cycleStart = path.indexOf(dep);
          if (cycleStart !== -1) {
            cycles.push(path.slice(cycleStart));
          }
        }
      }
      path.pop();
      recursionStack.delete(node);
    };
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }
    return cycles;
  }
  /**
   * Analyze imports and exports across files.
   */
  analyzeImportsExports(files) {
    const unusedImports = /* @__PURE__ */ new Map();
    const missingExports = /* @__PURE__ */ new Map();
    let totalImports = 0;
    let totalExports = 0;
    for (const file of files) {
      const importPaths = this.extractImports(file.content);
      const importedNames = this.extractImportedNames(file.content);
      const exports = this.extractExports(file.content);
      totalImports += importPaths.length;
      totalExports += exports.length;
      const contentWithoutImports = file.content.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*/g, "");
      const unused = [];
      for (let i = 0; i < importedNames.length; i++) {
        const name = importedNames[i];
        const wordRegex = new RegExp(`\\b${name}\\b`);
        if (!wordRegex.test(contentWithoutImports)) {
          unused.push(importPaths[i] || name);
        }
      }
      if (unused.length > 0) {
        unusedImports.set(file.path, unused);
      }
    }
    return {
      unusedImports,
      missingExports,
      stats: {
        totalImports,
        totalExports,
        averageImportsPerFile: files.length > 0 ? totalImports / files.length : 0
      }
    };
  }
  /**
   * Extract imports from file content.
   */
  extractImports(content) {
    const imports = [];
    const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    return imports;
  }
  /**
   * Extract the imported identifiers from an import statement.
   */
  extractImportedNames(content) {
    const names = [];
    const importRegex = /import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importClause = match[1].trim();
      if (importClause === "*") continue;
      if (importClause.startsWith("{")) {
        const named = importClause.replace(/[{}]/g, "").split(",").map((s) => {
          const parts = s.trim().split(/\s+as\s+/);
          return (parts[1] || parts[0]).trim();
        }).filter(Boolean);
        names.push(...named);
      } else {
        names.push(importClause);
      }
    }
    return names;
  }
  /**
   * Extract exports from file content.
   */
  extractExports(content) {
    const exports = [];
    const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    return exports;
  }
  /**
   * Analyze code patterns across files.
   */
  analyzePatterns(files) {
    const patterns = [];
    const duplicateCode = [];
    const errorHandlingPattern = this.detectErrorHandlingPattern(files);
    if (errorHandlingPattern) patterns.push(errorHandlingPattern);
    const asyncPattern = this.detectAsyncPattern(files);
    if (asyncPattern) patterns.push(asyncPattern);
    const duplicates = this.detectDuplicateCode(files);
    duplicateCode.push(...duplicates);
    return {
      patterns,
      duplicateCode,
      stats: {
        totalPatterns: patterns.length,
        totalDuplicates: duplicateCode.length,
        averagePatternSize: duplicateCode.length > 0 ? duplicateCode.reduce((sum, d) => sum + d.content.split("\n").length, 0) / duplicateCode.length : 0
      }
    };
  }
  /**
   * Detect error handling patterns.
   */
  detectErrorHandlingPattern(files) {
    const filesWithPattern = [];
    const errorHandlingRegex = /try\s*\{[\s\S]*?\}\s*catch\s*\(/g;
    for (const file of files) {
      if (errorHandlingRegex.test(file.content)) {
        filesWithPattern.push(file.path);
      }
    }
    if (filesWithPattern.length >= 3) {
      return {
        id: "error-handling-pattern",
        description: "Consistent error handling pattern using try/catch",
        files: filesWithPattern,
        frequency: filesWithPattern.length,
        severity: "info"
      };
    }
    return null;
  }
  /**
   * Detect async/await patterns.
   */
  detectAsyncPattern(files) {
    const filesWithPattern = [];
    const asyncRegex = /async\s+(?:function|()=>)/g;
    for (const file of files) {
      if (asyncRegex.test(file.content)) {
        filesWithPattern.push(file.path);
      }
    }
    if (filesWithPattern.length >= 3) {
      return {
        id: "async-pattern",
        description: "Consistent async/await pattern",
        files: filesWithPattern,
        frequency: filesWithPattern.length,
        severity: "info"
      };
    }
    return null;
  }
  /**
   * Detect duplicate code blocks.
   */
  detectDuplicateCode(files) {
    const duplicates = [];
    const minLines = 5;
    const similarityThreshold = 0.8;
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const file1 = files[i];
        const file2 = files[j];
        const lines1 = file1.content.split("\n");
        const lines2 = file2.content.split("\n");
        for (let start1 = 0; start1 < lines1.length - minLines; start1++) {
          for (let start2 = 0; start2 < lines2.length - minLines; start2++) {
            let matchLength = 0;
            while (start1 + matchLength < lines1.length && start2 + matchLength < lines2.length && lines1[start1 + matchLength].trim() === lines2[start2 + matchLength].trim()) {
              matchLength++;
            }
            if (matchLength >= minLines) {
              const similarity = matchLength / Math.max(lines1.length, lines2.length);
              if (similarity >= similarityThreshold) {
                duplicates.push({
                  files: [file1.path, file2.path],
                  ranges: [
                    { file: file1.path, start: start1 + 1, end: start1 + matchLength },
                    { file: file2.path, start: start2 + 1, end: start2 + matchLength }
                  ],
                  content: lines1.slice(start1, start1 + matchLength).join("\n"),
                  similarity
                });
              }
            }
          }
        }
      }
    }
    return duplicates;
  }
  /**
   * Generate findings from dependency analysis.
   */
  generateDependencyFindings(analysis) {
    const findings = [];
    for (const cycle of analysis.circularDependencies) {
      findings.push({
        severity: "high",
        category: "bug",
        file: cycle[0],
        line: null,
        comment: `Circular dependency detected: ${cycle.join(" \u2192 ")}`,
        suggestion: "Refactor to break the circular dependency.",
        source: "static"
      });
    }
    for (const file of analysis.highFanOut) {
      findings.push({
        severity: "medium",
        category: "smell",
        file,
        line: null,
        comment: "File has too many dependencies (high fan-out).",
        suggestion: "Consider splitting into smaller modules.",
        source: "static"
      });
    }
    for (const file of analysis.highFanIn) {
      findings.push({
        severity: "info",
        category: "smell",
        file,
        line: null,
        comment: "File is depended on by many others (high fan-in).",
        suggestion: "Consider if this is a god module that should be split.",
        source: "static"
      });
    }
    return findings;
  }
  /**
   * Generate findings from import/export analysis.
   */
  generateImportExportFindings(analysis) {
    const findings = [];
    for (const [file, imports] of analysis.unusedImports) {
      for (const imp of imports) {
        findings.push({
          severity: "low",
          category: "smell",
          file,
          line: null,
          comment: `Unused import: ${imp}`,
          suggestion: "Remove unused imports to keep code clean.",
          source: "static"
        });
      }
    }
    return findings;
  }
  /**
   * Generate findings from pattern analysis.
   */
  generatePatternFindings(analysis) {
    const findings = [];
    for (const pattern of analysis.patterns) {
      if (pattern.frequency > 5) {
        findings.push({
          severity: "info",
          category: "style",
          file: pattern.files[0],
          line: null,
          comment: `Common pattern detected: ${pattern.description} (${pattern.frequency} occurrences)`,
          suggestion: "Consider extracting to a shared utility.",
          source: "static"
        });
      }
    }
    for (const duplicate of analysis.duplicateCode) {
      findings.push({
        severity: "medium",
        category: "smell",
        file: duplicate.files[0],
        line: duplicate.ranges[0].start,
        comment: `Duplicate code detected across ${duplicate.files.length} files (${Math.round(duplicate.similarity * 100)}% similar)`,
        suggestion: "Extract common code into a shared module.",
        source: "static"
      });
    }
    return findings;
  }
};

// src/analyzer/index.ts
var StaticAnalyzer = class {
  enhancedAnalyzer;
  progressiveAnalyzer;
  analysisCache = null;
  analyzerConfig;
  configHash;
  constructor(config, cacheDir) {
    this.analyzerConfig = {
      ...DEFAULT_ANALYZER_CONFIG,
      ...config
    };
    this.configHash = generateConfigHash(this.analyzerConfig);
    this.enhancedAnalyzer = new EnhancedAnalyzer(
      this.analyzerConfig.severityAdjustment,
      this.analyzerConfig.confidenceThresholds,
      this.analyzerConfig.customRules
    );
    this.progressiveAnalyzer = new ProgressiveAnalyzer(
      this.analyzerConfig.progressiveAnalysis,
      this.analyzerConfig.multiFileAnalysis
    );
    if (cacheDir) {
      this.analysisCache = new AnalysisCache(cacheDir);
    }
  }
  analyze(path, content) {
    if (this.analysisCache) {
      const cached = this.analysisCache.get(path, content, this.configHash);
      if (cached) {
        return cached.findings;
      }
    }
    let findings;
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      findings = this.enhancedAnalyzer.analyze(path, content);
    } else {
      findings = this.analyzeBasic(path, content);
    }
    if (this.analysisCache) {
      this.analysisCache.set(path, content, this.configHash, findings, {
        durationMs: 0,
        // Would need to track this properly
        rulesApplied: ["basic"]
      });
    }
    return findings;
  }
  /**
   * Basic analysis without enhanced features (original logic).
   */
  analyzeBasic(path, content) {
    const findings = [];
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      const isComment = trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
      if (/api[_-]?key\s*=\s*["'][A-Za-z0-9_\-]{16,}/i.test(line)) {
        findings.push({
          severity: "high",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "Possible hardcoded API key detected.",
          suggestion: "Move secrets to environment variables or a secrets manager.",
          source: "static"
        });
      }
      if (!isComment && /\bconsole\.(log|debug)\(/.test(line) && !path.includes(".test.")) {
        findings.push({
          severity: "low",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Debug logging left in source.",
          suggestion: "Remove or replace with a proper logger.",
          source: "static"
        });
      }
      if (!isComment && /\beval\s*\(/.test(line)) {
        findings.push({
          severity: "critical",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "Use of eval() is dangerous and can lead to code injection.",
          suggestion: "Avoid eval; parse structured input instead.",
          source: "static"
        });
      }
      if (/(TODO|FIXME|XXX)\b/.test(line)) {
        findings.push({
          severity: "info",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Tech-debt marker (TODO/FIXME) found.",
          suggestion: "Link to a tracked issue where possible.",
          source: "static"
        });
      }
      if (!isComment && /password\s*=\s*["'][^"']+["']/i.test(line)) {
        findings.push({
          severity: "high",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "Possible hardcoded password detected.",
          suggestion: "Use environment variables or a secrets manager.",
          source: "static"
        });
      }
      if (!isComment && /\bprocess\.exit\s*\(/.test(line)) {
        findings.push({
          severity: "medium",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Direct process.exit() call found.",
          suggestion: "Use exceptions or return codes for cleaner shutdown.",
          source: "static"
        });
      }
      if (!isComment && /[^!=!]==[^=]/.test(line) && !/===/.test(line)) {
        findings.push({
          severity: "medium",
          category: "bug",
          file: path,
          line: idx + 1,
          comment: "Loose equality (==) used instead of strict equality (===).",
          suggestion: "Use === to avoid unexpected type coercion.",
          source: "static"
        });
      }
      if (!isComment && /\bvar\s+\w+/.test(line)) {
        findings.push({
          severity: "low",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Use of 'var' detected.",
          suggestion: "Use 'let' or 'const' for block scoping.",
          source: "static"
        });
      }
      if (!isComment && /typeof\s+\w+\s*===?\s*[^"']undefined/.test(line)) {
        findings.push({
          severity: "medium",
          category: "bug",
          file: path,
          line: idx + 1,
          comment: "Incorrect typeof comparison \u2014 should compare against string 'undefined'.",
          suggestion: "Use: typeof x === 'undefined'",
          source: "static"
        });
      }
      if (!isComment && /JSON\.parse\s*\(/.test(line) && !/\btry\b/.test(content.split("\n").slice(Math.max(0, idx - 3), idx + 1).join("\n"))) {
        findings.push({
          severity: "medium",
          category: "bug",
          file: path,
          line: idx + 1,
          comment: "JSON.parse() without nearby error handling.",
          suggestion: "Wrap in try/catch to handle malformed JSON.",
          source: "static"
        });
      }
      if (!isComment && /\bparseInt\s*\([^,)]+\)/.test(line) && !/parseInt\s*\([^,]+,\s*\d+/.test(line)) {
        findings.push({
          severity: "low",
          category: "bug",
          file: path,
          line: idx + 1,
          comment: "parseInt() called without explicit radix parameter.",
          suggestion: "Use parseInt(value, 10) to avoid unexpected results.",
          source: "static"
        });
      }
      if (!isComment && /\b(setTimeout|setInterval)\s*\(\s*["']/.test(line)) {
        findings.push({
          severity: "high",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "String passed to setTimeout/setInterval (acts like eval).",
          suggestion: "Pass a function reference instead of a string.",
          source: "static"
        });
      }
      if (!isComment && /\bnew\s+Date\s*\(\s*\)/.test(line)) {
        findings.push({
          severity: "low",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "new Date() without arguments is timezone-dependent.",
          suggestion: "Consider using a timezone-aware date library or explicit timezone.",
          source: "static"
        });
      }
      if (!isComment && /\bMath\.random\s*\(/.test(line) && /(token|secret|password|key|auth|session)/i.test(line)) {
        findings.push({
          severity: "high",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "Math.random() is not cryptographically secure.",
          suggestion: "Use crypto.randomBytes() or crypto.randomUUID() instead.",
          source: "static"
        });
      }
      if (!isComment && /\bawait\b/.test(line) && /\.(forEach|each)\s*\(/.test(content.split("\n").slice(Math.max(0, idx - 2), idx + 1).join(" "))) {
        findings.push({
          severity: "high",
          category: "bug",
          file: path,
          line: idx + 1,
          comment: "await inside forEach does not work \u2014 forEach ignores returned promises.",
          suggestion: "Use for...of or Promise.all() with map() instead.",
          source: "static"
        });
      }
    });
    findings.push(...this.detectDeepNesting(path, lines));
    findings.push(...this.detectMagicNumbers(path, lines));
    findings.push(...this.detectMissingErrorHandling(path, content));
    findings.push(...this.detectLongFunctions(path, lines));
    return findings;
  }
  /**
   * Perform progressive analysis (quick scan → deep analysis).
   */
  async analyzeProgressive(files) {
    return this.progressiveAnalyzer.analyzeProgressive(files, (path, content, rules) => {
      if (this.analyzerConfig.enableEnhancedAnalysis) {
        return this.enhancedAnalyzer.analyze(path, content);
      }
      return this.analyzeBasic(path, content);
    });
  }
  /**
   * Perform multi-file analysis with cross-file insights.
   */
  async analyzeMultiFile(files) {
    return this.progressiveAnalyzer.analyzeMultiFile(files, (path, content) => {
      if (this.analyzerConfig.enableEnhancedAnalysis) {
        return this.enhancedAnalyzer.analyze(path, content);
      }
      return this.analyzeBasic(path, content);
    });
  }
  /**
   * Compare analysis results between two runs.
   */
  compareAnalyses(previousFindings, currentFindings) {
    if (!this.analysisCache) {
      return null;
    }
    return this.analysisCache.compare(previousFindings, currentFindings);
  }
  /**
   * Update file histories for dynamic severity adjustment.
   */
  updateFileHistories(fileHistories) {
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.updateContext(fileHistories);
    }
  }
  /**
   * Add a custom rule.
   */
  addCustomRule(rule) {
    this.analyzerConfig.customRules.push(rule);
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.addCustomRule(rule);
    }
  }
  /**
   * Remove a custom rule.
   */
  removeCustomRule(ruleId) {
    this.analyzerConfig.customRules = this.analyzerConfig.customRules.filter((r) => r.id !== ruleId);
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.removeCustomRule(ruleId);
    }
  }
  /**
   * Update confidence thresholds.
   */
  updateConfidenceThresholds(thresholds) {
    this.analyzerConfig.confidenceThresholds = {
      ...this.analyzerConfig.confidenceThresholds,
      ...thresholds
    };
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.updateConfidenceThresholds(thresholds);
    }
  }
  /**
   * Update severity adjustment configuration.
   */
  updateSeverityConfig(config) {
    this.analyzerConfig.severityAdjustment = {
      ...this.analyzerConfig.severityAdjustment,
      ...config
    };
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.updateSeverityConfig(config);
    }
  }
  /**
   * Get analyzer configuration.
   */
  getConfig() {
    return { ...this.analyzerConfig };
  }
  /**
   * Get cache statistics.
   */
  getCacheStats() {
    return this.analysisCache?.getStats() ?? null;
  }
  /**
   * Clear analysis cache.
   */
  clearCache() {
    this.analysisCache?.clear();
  }
  /** Detect deep nesting (more than 4 levels of indentation). */
  detectDeepNesting(path, lines) {
    const findings = [];
    const maxDepth = 4;
    let blockStart = -1;
    let blockDepth = 0;
    lines.forEach((line, idx) => {
      const indent = line.search(/\S/);
      if (indent >= 0) {
        const depth = Math.floor(indent / 2);
        if (depth > maxDepth) {
          if (blockStart === -1) {
            blockStart = idx + 1;
            blockDepth = depth;
          }
          if (depth > blockDepth) blockDepth = depth;
          return;
        }
      }
      if (blockStart !== -1) {
        findings.push({
          severity: "medium",
          category: "smell",
          file: path,
          line: blockStart,
          comment: `Deep nesting detected (depth: ${blockDepth}, lines ${blockStart}-${idx}).`,
          suggestion: "Consider extracting logic into separate functions.",
          source: "static"
        });
        blockStart = -1;
        blockDepth = 0;
      }
    });
    if (blockStart !== -1) {
      findings.push({
        severity: "medium",
        category: "smell",
        file: path,
        line: blockStart,
        comment: `Deep nesting detected (depth: ${blockDepth}, lines ${blockStart}-${lines.length}).`,
        suggestion: "Consider extracting logic into separate functions.",
        source: "static"
      });
    }
    return findings;
  }
  /** Detect magic numbers (numeric literals other than 0, 1, -1). */
  detectMagicNumbers(path, lines) {
    const findings = [];
    const magicNumberRegex = /(?<![a-zA-Z_])\b(?!0\b|1\b|-1\b|2\b)\d{2,}\b(?![a-zA-Z_])/g;
    lines.forEach((line, idx) => {
      if (line.trim().startsWith("//") || line.trim().startsWith("import") || line.trim().startsWith("export")) {
        return;
      }
      let match;
      while ((match = magicNumberRegex.exec(line)) !== null) {
        findings.push({
          severity: "low",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: `Magic number ${match[0]} detected.`,
          suggestion: "Consider extracting to a named constant.",
          source: "static"
        });
      }
    });
    return findings;
  }
  /** Detect missing error handling (bare await without try/catch). */
  detectMissingErrorHandling(path, content) {
    const findings = [];
    const lines = content.split("\n");
    const inTryBlock = /* @__PURE__ */ new Set();
    let tryStart = -1;
    let braceCount = 0;
    lines.forEach((line, idx) => {
      if (tryStart >= 0) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        if (braceCount <= 0) {
          for (let i = tryStart; i <= idx; i++) {
            inTryBlock.add(i);
          }
          tryStart = -1;
        }
      } else if (/\btry\s*\{/.test(line)) {
        tryStart = idx;
        braceCount = 1;
      }
    });
    lines.forEach((line, idx) => {
      if (inTryBlock.has(idx)) return;
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
      if (/\bawait\b/.test(line) && !/\b(try|catch)\b/.test(line)) {
        findings.push({
          severity: "low",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Await call without error handling.",
          suggestion: "Wrap in try/catch for proper error handling.",
          source: "static"
        });
      }
    });
    return findings;
  }
  /** Detect long functions (more than 50 lines). */
  detectLongFunctions(path, lines) {
    const findings = [];
    let functionStart = -1;
    let functionName = "";
    let braceCount = 0;
    lines.forEach((line, idx) => {
      const functionMatch = line.match(/(?:function|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function))\s+(\w+)?/);
      if (functionMatch && functionStart === -1) {
        functionStart = idx;
        functionName = functionMatch[1] || "anonymous";
        braceCount = 0;
      }
      if (functionStart >= 0) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        if (braceCount <= 0 && idx > functionStart) {
          const functionLength = idx - functionStart;
          if (functionLength > 50) {
            findings.push({
              severity: "medium",
              category: "smell",
              file: path,
              line: functionStart + 1,
              comment: `Long function "${functionName}" (${functionLength} lines).`,
              suggestion: "Consider breaking into smaller functions.",
              source: "static"
            });
          }
          functionStart = -1;
        }
      }
    });
    return findings;
  }
  /** Aggregate findings across many files. */
  analyzeMany(files) {
    return files.flatMap((f) => this.analyze(f.path, f.content));
  }
};

// src/scorer/index.ts
var WEIGHTS = {
  readability: 0.25,
  maintainability: 0.3,
  security: 0.25,
  test_coverage: 0.2
};
var clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
var SEVERITY_PENALTY = {
  info: 2,
  low: 4,
  medium: 8,
  high: 16,
  critical: 30
};
var Scorer = class {
  /**
   * Build a baseline score from static findings + simple code metrics.
   * This works fully offline and is deterministic.
   */
  scoreStatic(files, findings) {
    const securityPenalty = findings.filter((f) => f.category === "security").reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
    const smellPenalty = findings.filter((f) => f.category === "smell" || f.category === "style").reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity] / 2, 0);
    const security = clamp(100 - securityPenalty);
    const maintainability = clamp(100 - smellPenalty);
    const readability = clamp(this.readabilityMetric(files));
    const testCoverage = clamp(this.coverageMetric(files));
    return this.finalize({
      readability,
      maintainability,
      security,
      test_coverage: testCoverage,
      rationale: "Baseline score derived from static heuristics (security findings, code smells, comment density, and test file presence)."
    });
  }
  /**
   * Blend an AI-provided sub-score breakdown with the static baseline. The AI
   * result is trusted more for subjective dimensions (readability), while
   * static analysis dominates security (it is more reliable there).
   */
  blendWithAI(baseline, ai, rationale, strategy = "min") {
    const readability = ai.readability ?? baseline.readability;
    const maintainability = ai.maintainability ?? baseline.maintainability;
    let security;
    switch (strategy) {
      case "avg":
        security = Math.round(((ai.security ?? baseline.security) + baseline.security) / 2);
        break;
      case "static-only":
        security = baseline.security;
        break;
      case "min":
      default:
        security = Math.min(ai.security ?? 100, baseline.security);
        break;
    }
    const test_coverage = ai.test_coverage ?? baseline.test_coverage;
    return this.finalize({
      readability,
      maintainability,
      security,
      test_coverage,
      rationale
    });
  }
  /** Compute the weighted overall and attach it to the breakdown. */
  finalize(b) {
    const readability = clamp(b.readability);
    const maintainability = clamp(b.maintainability);
    const security = clamp(b.security);
    const test_coverage = clamp(b.test_coverage);
    const overall = clamp(
      readability * WEIGHTS.readability + maintainability * WEIGHTS.maintainability + security * WEIGHTS.security + test_coverage * WEIGHTS.test_coverage
    );
    return { readability, maintainability, security, test_coverage, overall, rationale: b.rationale };
  }
  /** Readability heuristic: penalize very long functions and reward comments. */
  readabilityMetric(files) {
    let total = 0;
    let fileCount = 0;
    for (const { content } of files) {
      fileCount++;
      const lines = content.split("\n");
      const commentLines = lines.filter(
        (l) => /^\s*(\/\/|#|\/\*|\*)/.test(l)
      ).length;
      const commentRatio = lines.length ? commentLines / lines.length : 0;
      const longLines = lines.filter((l) => l.length > 120).length;
      const score = 100 - longLines * 2 + commentRatio * 20;
      total += Math.max(20, score);
    }
    return fileCount ? total / fileCount : 100;
  }
  /** Coverage heuristic: fraction of source files that have a related test. */
  coverageMetric(files) {
    const testPaths = new Set(
      files.map((f) => f.path).filter((p) => /\.(test|spec)\.[jt]sx?$/.test(p) || /__tests__\//.test(p))
    );
    const sourceFiles = files.filter((f) => !/\.(test|spec)\.[jt]sx?$/.test(f.path) && !/__tests__\//.test(f.path));
    if (sourceFiles.length === 0) return 100;
    let covered = 0;
    for (const f of sourceFiles) {
      const base = f.path.replace(/\.[^.]+$/, "");
      if ([...testPaths].some((t) => t.startsWith(base))) covered++;
    }
    return covered / sourceFiles.length * 100;
  }
};

// src/cache/index.ts
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync6, mkdirSync as mkdirSync3, readFileSync as readFileSync6, writeFileSync as writeFileSync3, statSync as statSync3, readdirSync as readdirSync2, unlinkSync } from "node:fs";
import { join as join4 } from "node:path";
var DEFAULT_TTL_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_MAX_ENTRIES = 500;
var FileCache = class {
  constructor(dir, ttlMs, maxEntries) {
    this.dir = dir;
    this.ttlMs = ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = maxEntries ?? DEFAULT_MAX_ENTRIES;
    if (!existsSync6(dir)) mkdirSync3(dir, { recursive: true });
  }
  ttlMs;
  maxEntries;
  /** Compute a stable cache key from arbitrary inputs. */
  key(namespace, payload) {
    const hash = createHash2("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
    return `${namespace}-${hash}.json`;
  }
  /** Compute a fast content hash for a single string. */
  contentHash(content) {
    return createHash2("sha256").update(content).digest("hex").slice(0, 16);
  }
  get(namespace, payload) {
    const path = join4(this.dir, this.key(namespace, payload));
    if (!existsSync6(path)) return null;
    try {
      const stat = statSync3(path);
      if (Date.now() - stat.mtimeMs > this.ttlMs) return null;
      writeFileSync3(path, readFileSync6(path, "utf8"), "utf8");
      return JSON.parse(readFileSync6(path, "utf8"));
    } catch {
      return null;
    }
  }
  set(namespace, payload, value) {
    const path = join4(this.dir, this.key(namespace, payload));
    try {
      writeFileSync3(path, JSON.stringify(value), "utf8");
      this.evictIfNeeded();
    } catch {
    }
  }
  /** Remove oldest entries when cache exceeds maxEntries. */
  evictIfNeeded() {
    try {
      const files = readdirSync2(this.dir).filter((f) => f.endsWith(".json")).map((f) => {
        const fp = join4(this.dir, f);
        const stat = statSync3(fp);
        return { path: fp, mtime: stat.mtimeMs };
      });
      if (files.length <= this.maxEntries) return;
      files.sort((a, b) => a.mtime - b.mtime);
      const toRemove = files.slice(0, files.length - this.maxEntries);
      for (const f of toRemove) {
        try {
          unlinkSync(f.path);
        } catch {
        }
      }
    } catch {
    }
  }
};

// src/plugins/index.ts
var PluginManager = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  plugins = [];
  /** Dynamically import and register plugins listed in config. */
  async load(paths) {
    for (const p of paths) {
      const plugin = await this.loadPlugin(p);
      if (plugin) {
        this.plugins.push(plugin);
        await plugin.init?.(this.ctx);
        this.ctx.logger.info(`Loaded plugin: ${plugin.name}`);
      }
    }
  }
  async loadPlugin(path) {
    try {
      const mod = await import(path);
      const plugin = mod.default;
      if (!plugin) {
        this.ctx.logger.warn(
          `Plugin "${path}" does not export a default CodeSentinelPlugin.`
        );
        return null;
      }
      if (typeof plugin.name !== "string" || plugin.name.length === 0) {
        this.ctx.logger.warn(
          `Plugin "${path}" is missing a valid "name" property.`
        );
        return null;
      }
      return plugin;
    } catch (err) {
      this.ctx.logger.warn(`Failed to load plugin "${path}":`, err);
      return null;
    }
  }
  get all() {
    return this.plugins;
  }
  /** Run all plugins' analyze hooks and merge their findings. */
  async runAnalyze(files) {
    const results = await Promise.all(
      this.plugins.map(async (p) => {
        try {
          return await p.analyze?.(files) ?? [];
        } catch (err) {
          this.ctx.logger.warn(
            `Analyze hook failed for plugin "${p.name}":`,
            err
          );
          return [];
        }
      })
    );
    return results.flat();
  }
  /** Run all plugins' score hooks sequentially. */
  async runScore(breakdown, files) {
    let b = breakdown;
    for (const p of this.plugins) {
      try {
        b = await p.score?.(b, files) ?? b;
      } catch (err) {
        this.ctx.logger.warn(
          `Score hook failed for plugin "${p.name}":`,
          err
        );
      }
    }
    return b;
  }
};

// src/testgen/index.ts
import { writeFileSync as writeFileSync4, existsSync as existsSync7 } from "node:fs";
import { dirname as dirname2, join as join5, relative as relative2, resolve as resolve5 } from "node:path";
function detectFunctions(root, files) {
  const testSet = new Set(
    files.map((f) => f.path).filter((p) => /\.(test|spec)\./.test(p))
  );
  const out = [];
  const fnRe = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;
  for (const { path, content } of files) {
    if (/\.(test|spec)\./.test(path)) continue;
    const base = path.replace(/\.[^.]+$/, "");
    const hasTest = [...testSet].some((t) => t.startsWith(base));
    let m;
    fnRe.lastIndex = 0;
    while ((m = fnRe.exec(content)) !== null) {
      out.push({
        name: m[1],
        line: content.slice(0, m.index).split("\n").length,
        file: path,
        hasTest
      });
    }
  }
  return out;
}
var TestGenerator = class {
  constructor(config, ai, prompts) {
    this.config = config;
    this.ai = ai;
    this.prompts = prompts;
  }
  /**
   * Generate and save tests for the given source files. Returns the list of
   * written tests. Skips files that already appear to have tests unless
   * `force` is set.
   */
  async generate(root, files, opts = {}) {
    const detected = detectFunctions(root, files);
    const targets = detected.filter((d) => opts.force || !d.hasTest);
    const uniqueFiles = [...new Set(targets.map((d) => d.file))];
    const results = [];
    for (const rel of uniqueFiles) {
      const file = files.find((f) => f.path === rel);
      if (!file) continue;
      const gen = await this.generateForFile(root, file);
      if (gen) results.push(gen);
    }
    return results;
  }
  async generateForFile(root, file) {
    const framework = this.config.test_runner === "jest" ? "Jest with describe/it/expect" : "Vitest with describe/it/expect";
    const targetPath = this.testPathFor(root, file.path);
    const prompt = this.prompts.render("testgen", {
      test_runner: this.config.test_runner,
      test_framework: framework,
      file: file.path,
      language: languageOf(file.path),
      code: file.content,
      project_context: this.config.project_context || "(none)"
    });
    const res = await this.ai.complete("testgen", [
      { role: "system", content: "You generate precise unit tests." },
      { role: "user", content: prompt }
    ]);
    const parsed = extractJson(
      res.content
    );
    if (!parsed?.content) return null;
    const outPath = parsed.test_file_path ? resolve5(root, parsed.test_file_path) : targetPath;
    ensureDir(dirname2(outPath));
    writeFileSync4(outPath, parsed.content, "utf8");
    return { file: file.path, testFilePath: relative2(root, outPath), content: parsed.content };
  }
  /** Determine the conventional test file path for a source file. */
  testPathFor(root, srcPath) {
    const abs = resolve5(root, srcPath);
    const dir = dirname2(abs);
    const ext = srcPath.match(/\.([^.]+)$/)?.[1] ?? "ts";
    const base = srcPath.replace(/\.[^.]+$/, "");
    if (this.config.test_runner === "jest") {
      return join5(dir, "__tests__", (base.split("/").pop() ?? "index") + `.test.${ext}`);
    }
    return join5(root, base + `.test.${ext}`);
  }
};

// src/utils/git.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var exec = promisify(execFile);
async function git(args, cwd = process.cwd()) {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}
async function collectDiff(base, cwd = process.cwd()) {
  const baseRef = base || await defaultBaseRef(cwd);
  let nameStatus;
  try {
    nameStatus = await git(
      ["diff", "--name-status", "--no-renames", baseRef + "..."],
      cwd
    );
  } catch (err) {
    logger.warn(`Failed to collect diff against "${baseRef}":`, err);
    return [];
  }
  const lines = nameStatus.split("\n").map((l) => l.trim()).filter(Boolean);
  const files = [];
  for (const line of lines) {
    const [statusCode, path] = line.split(/\t/);
    if (!statusCode || !path) continue;
    const status = mapStatus(statusCode);
    let content = "";
    if (status !== "deleted") {
      try {
        content = await git(["show", `:${path}`], cwd);
      } catch {
        logger.debug(`Could not read content for ${path}`);
      }
    }
    let diff = "";
    try {
      diff = await git(["diff", baseRef + "...", "--", path], cwd);
    } catch {
      logger.debug(`Could not collect diff for ${path}`);
    }
    files.push({ path, status, content, diff });
  }
  return files;
}
async function defaultBaseRef(cwd) {
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    const remoteBase = `origin/${githubBaseRef}`;
    if (await refExists(remoteBase, cwd)) return remoteBase;
    if (await refExists(githubBaseRef, cwd)) return githubBaseRef;
  }
  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    if (await refExists(ref, cwd)) return ref;
  }
  return "HEAD";
}
async function refExists(ref, cwd) {
  try {
    await git(["rev-parse", "--verify", ref], cwd);
    return true;
  } catch {
    return false;
  }
}
function mapStatus(code) {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  if (code.startsWith("R")) return "renamed";
  return "modified";
}

// src/utils/html-report.ts
function renderHtmlReport(report) {
  const severityColors = {
    critical: "#dc2626",
    high: "#ea580c",
    medium: "#d97706",
    low: "#2563eb",
    info: "#6b7280"
  };
  const categoryCounts = {};
  for (const f of report.findings) {
    categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
  }
  const severityCounts = report.metrics.findingsBySeverity;
  const findingsRows = report.findings.map((f) => {
    const color = severityColors[f.severity] ?? "#6b7280";
    return `<tr>
        <td><span style="color:${color};font-weight:700">${f.severity}</span></td>
        <td>${escapeHtml(f.category)}</td>
        <td>${escapeHtml(f.file)}${f.line ? `:${f.line}` : ""}</td>
        <td>${escapeHtml(f.comment)}</td>
        <td>${f.suggestion ? escapeHtml(f.suggestion) : "\u2014"}</td>
      </tr>`;
  }).join("\n");
  const fixRows = report.fixAttempts.map((a) => {
    const status = a.fixed ? a.verified ? "verified" : "applied" : "skipped";
    const statusColor = a.fixed ? a.verified ? "#16a34a" : "#d97706" : "#6b7280";
    return `<tr>
        <td>#${a.iteration}</td>
        <td>${escapeHtml(a.file)}</td>
        <td><span style="color:${statusColor};font-weight:700">${status}</span></td>
        <td>${escapeHtml(a.explanation)}</td>
      </tr>`;
  }).join("\n");
  const testRows = report.generatedTests.map((t) => `<tr><td>${escapeHtml(t.file)}</td><td>${escapeHtml(t.testFilePath)}</td></tr>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeSentinel \u2014 ${report.mode} Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 2rem; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.25rem; }
    .meta { color: #64748b; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .card { background: #fff; border-radius: 8px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card .label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 1.75rem; font-weight: 700; margin-top: 0.25rem; }
    .card .sub { font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem; }
    .score-ring { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; color: #fff; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 1.5rem; }
    th { background: #f1f5f9; text-align: left; padding: 0.6rem 0.75rem; font-size: 0.8rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    td { padding: 0.6rem 0.75rem; border-top: 1px solid #e2e8f0; font-size: 0.875rem; }
    tr:hover td { background: #f8fafc; }
    .empty { text-align: center; color: #94a3b8; padding: 2rem; }
    .bar-chart { display: flex; align-items: end; gap: 0.5rem; height: 120px; margin-top: 0.5rem; }
    .bar { display: flex; flex-direction: column; align-items: center; flex: 1; }
    .bar-fill { width: 100%; border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; }
    .bar-label { font-size: 0.7rem; color: #64748b; margin-top: 0.25rem; text-align: center; }
    .bar-value { font-size: 0.75rem; font-weight: 600; margin-bottom: 0.25rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>CodeSentinel \u2014 ${report.mode} Report</h1>
  <p class="meta">Generated in ${report.metrics.durationMs}ms &middot; ${report.metrics.filesAnalyzed} file(s) analyzed</p>

  <div class="cards">
    <div class="card">
      <div class="label">Findings</div>
      <div class="value">${report.findings.length}</div>
      <div class="sub">${Object.entries(severityCounts).map(([s, c]) => `${c} ${s}`).join(", ") || "none"}</div>
    </div>
    ${report.score ? `
    <div class="card" style="display:flex;align-items:center;gap:1rem">
      <div class="score-ring" style="background:${scoreColor(report.score.overall)}">${report.score.overall}</div>
      <div>
        <div class="label">Quality Score</div>
        <div class="sub">Readability ${report.score.readability} &middot; Maintainability ${report.score.maintainability}</div>
        <div class="sub">Security ${report.score.security} &middot; Coverage ${report.score.test_coverage}</div>
      </div>
    </div>` : ""}
    <div class="card">
      <div class="label">Fix Attempts</div>
      <div class="value">${report.fixAttempts.length}</div>
      <div class="sub">${report.fixAttempts.filter((a) => a.fixed && a.verified).length} verified</div>
    </div>
    <div class="card">
      <div class="label">Tests Generated</div>
      <div class="value">${report.generatedTests.length}</div>
    </div>
  </div>

  ${report.findings.length > 0 ? `<h2>Severity Distribution</h2>
  <div class="bar-chart">
    ${Object.entries(severityCounts).map(([sev, count]) => {
    const maxCount = Math.max(...Object.values(severityCounts));
    const height = maxCount > 0 ? Math.round(count / maxCount * 100) : 0;
    return `<div class="bar">
        <div class="bar-value">${count}</div>
        <div class="bar-fill" style="height:${height}%;background:${severityColors[sev] ?? "#6b7280"}"></div>
        <div class="bar-label">${sev}</div>
      </div>`;
  }).join("\n    ")}
  </div>` : ""}

  ${Object.keys(categoryCounts).length > 0 ? `<h2>Category Breakdown</h2>
  <div class="bar-chart">
    ${Object.entries(categoryCounts).map(([cat, count]) => {
    const maxCount = Math.max(...Object.values(categoryCounts));
    const height = maxCount > 0 ? Math.round(count / maxCount * 100) : 0;
    return `<div class="bar">
        <div class="bar-value">${count}</div>
        <div class="bar-fill" style="height:${height}%;background:#6366f1"></div>
        <div class="bar-label">${cat}</div>
      </div>`;
  }).join("\n    ")}
  </div>` : ""}

  <h2>Findings</h2>
  ${report.findings.length > 0 ? `<table>
    <thead><tr><th>Severity</th><th>Category</th><th>File</th><th>Comment</th><th>Suggestion</th></tr></thead>
    <tbody>${findingsRows}</tbody>
  </table>` : `<div class="empty">No findings detected.</div>`}

  ${report.fixAttempts.length > 0 ? `<h2>Fix Attempts</h2>
  <table>
    <thead><tr><th>#</th><th>File</th><th>Status</th><th>Explanation</th></tr></thead>
    <tbody>${fixRows}</tbody>
  </table>` : ""}

  ${report.generatedTests.length > 0 ? `<h2>Generated Tests</h2>
  <table>
    <thead><tr><th>Source</th><th>Test File</th></tr></thead>
    <tbody>${testRows}</tbody>
  </table>` : ""}

  <p class="meta" style="margin-top:2rem;text-align:center">Report generated by CodeSentinel AI</p>
</div>
</body>
</html>`;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function scoreColor(score) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#d97706";
  if (score >= 40) return "#ea580c";
  return "#dc2626";
}

// src/secrets/index.ts
function checkLine(line, lineNumber, path, pattern, re) {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return null;
  if (trimmed.startsWith("#")) return null;
  re.lastIndex = 0;
  if (re.test(line)) {
    return {
      severity: pattern.severity,
      category: "security",
      file: path,
      line: lineNumber,
      comment: pattern.message,
      suggestion: pattern.suggestion,
      source: "static"
    };
  }
  return null;
}
function scanSecrets(path, content, patterns) {
  const findings = [];
  const lines = content.split("\n");
  for (const pattern of patterns) {
    const flags = pattern.regex.startsWith("(?i)") ? "gi" : "g";
    const source = pattern.regex.startsWith("(?i)") ? pattern.regex.slice(4) : pattern.regex;
    let re;
    try {
      re = new RegExp(source, flags);
    } catch {
      continue;
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const finding = checkLine(line, i + 1, path, pattern, re);
      if (finding) findings.push(finding);
    }
  }
  return findings;
}

// src/dismiss/index.ts
import { readFileSync as readFileSync7, writeFileSync as writeFileSync5, existsSync as existsSync8, mkdirSync as mkdirSync4 } from "node:fs";
import { dirname as dirname3 } from "node:path";
var MAX_RULE_ID_COMMENT_LENGTH = 40;
var DismissalManager = class {
  constructor(filePath) {
    this.filePath = filePath;
    this.load();
  }
  dismissals = [];
  load() {
    if (existsSync8(this.filePath)) {
      try {
        const raw = readFileSync7(this.filePath, "utf8");
        this.dismissals = JSON.parse(raw);
      } catch {
        this.dismissals = [];
      }
    }
  }
  save() {
    const dir = dirname3(this.filePath);
    if (!existsSync8(dir)) mkdirSync4(dir, { recursive: true });
    writeFileSync5(this.filePath, JSON.stringify(this.dismissals, null, 2), "utf8");
  }
  dismiss(finding, reason) {
    this.dismissals.push({
      file: finding.file,
      line: finding.line,
      ruleId: `${finding.category}:${finding.comment.slice(0, MAX_RULE_ID_COMMENT_LENGTH)}`,
      reason,
      dismissedAt: new Date(Date.now()).toISOString()
    });
    this.save();
  }
  dismissByRule(ruleId, reason) {
    this.dismissals.push({
      file: "",
      line: null,
      ruleId,
      reason,
      dismissedAt: new Date(Date.now()).toISOString()
    });
    this.save();
  }
  dismissByFinding(file, line, ruleId, reason) {
    this.dismissals.push({
      file,
      line,
      ruleId,
      reason,
      dismissedAt: new Date(Date.now()).toISOString()
    });
    this.save();
  }
  isDismissed(finding) {
    const ruleId = `${finding.category}:${finding.comment.slice(0, MAX_RULE_ID_COMMENT_LENGTH)}`;
    return this.dismissals.some(
      (d) => d.ruleId === ruleId && d.file === finding.file && (d.line === null || d.line === finding.line)
    );
  }
  filterDismissed(findings) {
    return findings.filter((f) => !this.isDismissed(f));
  }
  listDismissals() {
    return [...this.dismissals];
  }
  clearDismissals() {
    this.dismissals = [];
    this.save();
  }
};

// src/dashboard/index.ts
import { createServer } from "node:http";
import { readFileSync as readFileSync8, writeFileSync as writeFileSync6, existsSync as existsSync9, mkdirSync as mkdirSync5 } from "node:fs";
import { resolve as resolve7 } from "node:path";
var HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CodeSentinel Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; }
  h1 { color: #58a6ff; margin-bottom: 24px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
  .stat-card h3 { font-size: 14px; color: #8b949e; margin-bottom: 8px; }
  .stat-card .value { font-size: 28px; font-weight: 600; }
  .chart-container { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .chart-container h2 { font-size: 16px; margin-bottom: 12px; }
  canvas { max-height: 300px; }
  .runs-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  .runs-table th, .runs-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #30363d; font-size: 14px; }
  .runs-table th { color: #8b949e; font-weight: 600; }
  .severity-critical { color: #f85149; }
  .severity-high { color: #d29922; }
  .severity-medium { color: #58a6ff; }
  .severity-low { color: #3fb950; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .empty { color: #8b949e; text-align: center; padding: 48px; font-size: 16px; }
</style>
</head>
<body>
<h1>\u{1F4CA} CodeSentinel Dashboard</h1>
<div id="empty-state" class="empty" style="display:none">
  <p>No analysis runs yet. Run <code>codesentinel review</code> or <code>codesentinel gate</code> to see data here.</p>
</div>
<div class="stats" id="stats"></div>
<div class="grid-2">
  <div class="chart-container"><h2>Findings by Severity</h2><canvas id="severityChart"></canvas></div>
  <div class="chart-container"><h2>Findings by Category</h2><canvas id="categoryChart"></canvas></div>
</div>
<div class="chart-container"><h2>Score Trend</h2><canvas id="scoreChart"></canvas></div>
<div class="chart-container"><h2>Recent Runs</h2>
<table class="runs-table">
<thead><tr><th>Time</th><th>Mode</th><th>Findings</th><th>Score</th><th>Duration</th></tr></thead>
<tbody id="runs-body"></tbody>
</table>
</div>
<script>
async function loadData() {
  const res = await fetch('/api/data');
  const data = await res.json();
  const runs = data.runs || [];
  if (runs.length === 0) { document.getElementById('empty-state').style.display = 'block'; return; }
  const latest = runs[runs.length - 1];
  const totalFindings = runs.reduce((s,r) => s + r.totalFindings, 0);
  document.getElementById('stats').innerHTML = \`
    <div class="stat-card"><h3>Total Runs</h3><div class="value">\${runs.length}</div></div>
    <div class="stat-card"><h3>Latest Score</h3><div class="value">\${latest.score ?? 'N/A'}</div></div>
    <div class="stat-card"><h3>Total Findings</h3><div class="value">\${totalFindings}</div></div>
    <div class="stat-card"><h3>Latest Mode</h3><div class="value">\${latest.mode}</div></div>
  \`;
  new Chart(document.getElementById('severityChart'), { type: 'bar', data: { labels: Object.keys(latest.findingsBySeverity), datasets: [{ label: 'Findings', data: Object.values(latest.findingsBySeverity), backgroundColor: ['#3fb950','#58a6ff','#d29922','#f85149'] }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
  new Chart(document.getElementById('categoryChart'), { type: 'doughnut', data: { labels: Object.keys(latest.findingsByCategory), datasets: [{ data: Object.values(latest.findingsByCategory), backgroundColor: ['#f85149','#d29922','#58a6ff','#3fb950','#8b949e'] }] }, options: { responsive: true } });
  new Chart(document.getElementById('scoreChart'), { type: 'line', data: { labels: runs.map(r => new Date(r.timestamp).toLocaleTimeString()), datasets: [{ label: 'Score', data: runs.map(r => r.score), borderColor: '#58a6ff', tension: 0.3 }] }, options: { responsive: true, scales: { y: { min: 0, max: 100 } } } });
  document.getElementById('runs-body').innerHTML = runs.slice().reverse().map(r => \`<tr><td>\${new Date(r.timestamp).toLocaleString()}</td><td>\${r.mode}</td><td class="severity-\${Object.keys(r.findingsBySeverity)[0] || ''}">\${r.totalFindings}</td><td>\${r.score ?? 'N/A'}</td><td>\${r.durationMs}ms</td></tr>\`).join('');
}
loadData();
</script>
</body>
</html>`;
var DashboardServer = class {
  constructor(port, dataDir) {
    this.port = port;
    this.dataDir = dataDir;
    this.loadData();
  }
  server = null;
  data = { runs: [] };
  dataPath() {
    return resolve7(this.dataDir, "dashboard.json");
  }
  loadData() {
    const p = this.dataPath();
    if (existsSync9(p)) {
      try {
        this.data = JSON.parse(readFileSync8(p, "utf8"));
      } catch {
        this.data = { runs: [] };
      }
    }
  }
  saveData() {
    const p = this.dataPath();
    const dir = resolve7(this.dataDir);
    if (!existsSync9(dir)) mkdirSync5(dir, { recursive: true });
    writeFileSync6(p, JSON.stringify(this.data, null, 2), "utf8");
  }
  recordRun(run) {
    this.data.runs.push(run);
    if (this.data.runs.length > 100) this.data.runs = this.data.runs.slice(-100);
    this.saveData();
  }
  start() {
    this.server = createServer((req, res) => {
      if (req.url === "/api/data") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.data));
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(HTML_PAGE);
      }
    });
    this.server.listen(this.port, () => {
      logger.info(`Dashboard server started at http://localhost:${this.port}`);
    });
    const shutdown = () => {
      logger.info("Shutting down dashboard server...");
      this.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
};

// src/deadcode/index.ts
function parseExports(path, content) {
  const exports = [];
  const lines = content.split("\n");
  const exportRe = /^export\s+(?:default\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/;
  const namedExportRe = /^export\s+\{\s*([^}]+)\s*\}/;
  lines.forEach((line, idx) => {
    const match = line.match(exportRe);
    if (match) {
      exports.push({ name: match[1], file: path, line: idx + 1 });
    }
    const namedMatch = line.match(namedExportRe);
    if (namedMatch) {
      for (const n of namedMatch[1].split(",")) {
        const name = n.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) exports.push({ name, file: path, line: idx + 1 });
      }
    }
  });
  return exports;
}
function parseImports(path, content) {
  const imports = [];
  const importRe = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g;
  const defaultImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRe.exec(content)) !== null) {
    imports.push({
      source: match[2],
      names: match[1].split(",").map((n) => n.trim().split(/\s+as\s+/).pop()?.trim() ?? "").filter(Boolean)
    });
  }
  while ((match = defaultImportRe.exec(content)) !== null) {
    imports.push({
      source: match[2],
      names: [match[1]]
    });
  }
  return imports;
}
function detectDeadCode(files) {
  const allExports = [];
  const allImports = [];
  const fileMap = /* @__PURE__ */ new Map();
  for (const f of files) {
    fileMap.set(f.path, f.content);
    allExports.push(...parseExports(f.path, f.content));
    allImports.push(...parseImports(f.path, f.content));
  }
  const importedNames = /* @__PURE__ */ new Set();
  for (const imp of allImports) {
    for (const name of imp.names) if (name) importedNames.add(name);
  }
  const findings = [];
  for (const exp of allExports) {
    if (exp.name === "default") continue;
    if (!importedNames.has(exp.name)) {
      findings.push({
        severity: "medium",
        category: "smell",
        file: exp.file,
        line: exp.line,
        comment: `Exported symbol "${exp.name}" is never imported by any other file.`,
        suggestion: "Remove the export if this code is unused, or verify it's used externally.",
        source: "static"
      });
    }
  }
  return findings;
}

// src/suggestions/index.ts
function buildSuggestionsComment(findings, fileContents) {
  const parts = ["### CodeSentinel \u2014 Suggested Fixes\n"];
  for (const f of findings.slice(0, 10)) {
    const content = fileContents.get(f.file) ?? "";
    const lines = content.split("\n");
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const ctxBefore = lines.slice(Math.max(0, f.line - 3), f.line - 1).join("\n");
      const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + 2)).join("\n");
      const context = ctxBefore ? ctxBefore + "\n" : "";
      const after = ctxAfter ? "\n" + ctxAfter : "";
      const suggested = f.suggestion?.replace(/^```[\s\S]*?\n/gm, "").replace(/```$/gm, "").trim() ?? "";
      const code = suggested || `${context}  // FIXME: ${f.comment}
${after}`;
      parts.push(`**${f.file}:${f.line}** \u2014 ${f.severity.toUpperCase()}

\`\`\`suggestion
${code}
\`\`\`
`);
    }
  }
  return parts.join("\n---\n");
}

// src/gate/index.ts
var MAX_SCORE = 100;
function evaluateGate(findings, score, config) {
  const critical = findings.filter((f) => f.severity === "critical");
  const high = findings.filter((f) => f.severity === "high");
  const security = findings.filter((f) => f.category === "security");
  const bugs = findings.filter((f) => f.category === "bug");
  if (critical.length > config.maxCritical) {
    return { passed: false, reason: `Too many critical findings: ${critical.length} > ${config.maxCritical}` };
  }
  if (high.length > config.maxHigh) {
    return { passed: false, reason: `Too many high findings: ${high.length} > ${config.maxHigh}` };
  }
  if (config.blockOnSecurity && security.length > 0) {
    return { passed: false, reason: `Security findings blocked: ${security.length} found` };
  }
  if (config.blockOnBugs && bugs.length > 0) {
    return { passed: false, reason: `Bug findings blocked: ${bugs.length} found` };
  }
  if (score && score.overall < config.minScore) {
    return { passed: false, reason: `Score ${score.overall}/${MAX_SCORE} below minimum ${config.minScore}` };
  }
  return { passed: true, reason: "All gate checks passed" };
}

// src/linters/index.ts
import { execSync } from "node:child_process";
import { existsSync as existsSync10 } from "node:fs";
import { resolve as resolve8 } from "node:path";
var eslint = {
  name: "eslint",
  detect(root) {
    return existsSync10(resolve8(root, "node_modules", ".bin", "eslint"));
  },
  run(root, extraArgs) {
    try {
      const out = execSync(
        `npx eslint --format json --no-color ${extraArgs.join(" ")} . 2>/dev/null || true`,
        { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
      );
      if (!out.trim()) return [];
      const results = JSON.parse(out);
      return results.flatMap(
        (f) => f.messages.map((m) => ({
          file: f.filePath,
          line: m.line || null,
          severity: m.severity >= 2 ? "high" : "low",
          category: "smell",
          comment: m.message,
          suggestion: `See rule: ${m.ruleId ?? "unknown"}`,
          source: "linter"
        }))
      );
    } catch (e) {
      logger.warn(`eslint run failed: ${e}`);
      return [];
    }
  }
};
var biome = {
  name: "biome",
  detect(root) {
    return existsSync10(resolve8(root, "node_modules", ".bin", "biome"));
  },
  run(root, extraArgs) {
    try {
      const out = execSync(
        `npx biome lint --diagnostic-level=warn --max-diagnostics=200 ${extraArgs.join(" ")} . 2>/dev/null || true`,
        { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
      );
      if (!out.trim()) return [];
      const parsed = JSON.parse(out);
      return (parsed.diagnostics ?? []).map((d) => ({
        file: d.location.path.file,
        line: d.location.span?.start.line ?? null,
        severity: d.severity === "error" ? "high" : "medium",
        category: "smell",
        comment: d.message.text,
        suggestion: `Category: ${d.category}`,
        source: "linter"
      }));
    } catch (e) {
      logger.warn(`biome run failed: ${e}`);
      return [];
    }
  }
};
var pylint = {
  name: "pylint",
  detect(root) {
    try {
      execSync("which pylint", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  run(root, extraArgs) {
    try {
      const out = execSync(
        `pylint --output-format=json ${extraArgs.join(" ")} . 2>/dev/null || true`,
        { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
      );
      if (!out.trim()) return [];
      const results = JSON.parse(out);
      return results.map((m) => ({
        file: m.path,
        line: m.line || null,
        severity: m.type === "error" || m.type === "fatal" ? "high" : m.type === "warning" ? "medium" : "low",
        category: "smell",
        comment: m.message,
        suggestion: `Symbol: ${m.symbol}`,
        source: "linter"
      }));
    } catch (e) {
      logger.warn(`pylint run failed: ${e}`);
      return [];
    }
  }
};
var tools = { eslint, biome, pylint };
function runLinters(root, config) {
  const active = config.tools.length > 0 ? config.tools : Object.keys(tools);
  const findings = [];
  for (const name of active) {
    const tool = tools[name];
    if (!tool) {
      logger.warn(`Unknown linter: "${name}", skipping`);
      continue;
    }
    if (!tool.detect(root)) {
      logger.info(`Linter "${name}" not found, skipping`);
      continue;
    }
    logger.info(`Running linter: ${name}`);
    const extra = config.args[name] ?? [];
    const start = Date.now();
    const result = tool.run(root, extra);
    logger.info(`Linter "${name}" finished: ${result.length} findings in ${Date.now() - start}ms`);
    findings.push(...result);
  }
  return findings;
}

// src/scanners/index.ts
import { execSync as execSync2 } from "node:child_process";
var MAX_BUFFER = 10 * 1024 * 1024;
var SNIPPET_LENGTH = 80;
function parseTrufflehogLine(line) {
  try {
    const r = JSON.parse(line);
    return {
      file: r.SourceMetadata?.Data?.Filesystem?.file ?? "unknown",
      line: r.SourceMetadata?.Data?.Filesystem?.line ?? null,
      severity: "high",
      category: "security",
      comment: `[trufflehog] ${r.DetectorName ?? "secret"}: ${r.Description ?? ""}`,
      suggestion: `Matched: ${(r.Raw || "").slice(0, SNIPPET_LENGTH)}`,
      source: "scanner"
    };
  } catch {
    return null;
  }
}
var gitleaks = {
  name: "gitleaks",
  detect() {
    try {
      execSync2("which gitleaks", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  run(root) {
    try {
      const out = execSync2(
        "gitleaks detect --no-git --source . --report-format json --report-path /dev/stdout 2>/dev/null || true",
        { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER }
      );
      if (!out.trim()) return [];
      let results;
      try {
        results = JSON.parse(out);
      } catch {
        logger.warn("gitleaks JSON parse failed");
        return [];
      }
      return results.map((r) => ({
        file: r.File,
        line: r.StartLine || null,
        severity: r.Severity?.toLowerCase() === "high" ? "high" : "critical",
        category: "security",
        comment: `[gitleaks] ${r.Description}`,
        suggestion: `Match: ${r.Match.trim().slice(0, SNIPPET_LENGTH)}`,
        source: "scanner"
      }));
    } catch (e) {
      logger.warn(`gitleaks run failed: ${e}`);
      return [];
    }
  }
};
var trufflehog = {
  name: "trufflehog",
  detect() {
    try {
      execSync2("which trufflehog", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  run(root) {
    try {
      const out = execSync2(
        "trufflehog filesystem . --json --no-verification 2>/dev/null || true",
        { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER }
      );
      if (!out.trim()) return [];
      const lines = out.trim().split("\n").filter(Boolean);
      return lines.map(parseTrufflehogLine).filter((f) => f !== null);
    } catch (e) {
      logger.warn(`trufflehog run failed: ${e}`);
      return [];
    }
  }
};
var scanners = { gitleaks, trufflehog };
function runThirdPartySecrets(root) {
  const findings = [];
  for (const [name, tool] of Object.entries(scanners)) {
    if (!tool.detect()) {
      logger.info(`Secret scanner "${name}" not found, skipping`);
      continue;
    }
    logger.info(`Running secret scanner: ${name}`);
    const start = Date.now();
    const result = tool.run(root);
    logger.info(`Secret scanner "${name}" finished: ${result.length} findings in ${Date.now() - start}ms`);
    findings.push(...result);
  }
  return findings;
}

// src/utils/concurrency.ts
async function concurrentMap(items, fn, concurrency = 5) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        throw error;
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  try {
    await Promise.all(workers);
  } catch (error) {
    throw error;
  }
  return results;
}

// src/mcp/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
var MCPManager = class {
  clients = /* @__PURE__ */ new Map();
  configs;
  constructor(configs = []) {
    this.configs = configs;
  }
  async connectAll() {
    for (const cfg of this.configs) {
      await this.connect(cfg);
    }
  }
  async connect(cfg) {
    try {
      const client = new Client(
        { name: "codesentinel", version: "1.0.0" },
        { capabilities: {} }
      );
      let transport;
      if (cfg.type === "local" && cfg.command) {
        transport = new StdioClientTransport({
          command: cfg.command[0],
          args: cfg.command.slice(1),
          env: cfg.environment
        });
      } else if (cfg.type === "remote" && cfg.url) {
        transport = new SSEClientTransport(new URL(cfg.url));
      } else {
        logger.warn(`MCP: invalid config for "${cfg.name}"`);
        return;
      }
      const timeout = cfg.timeoutMs ?? 5e3;
      const abort = AbortSignal.timeout(timeout);
      await client.connect(transport);
      this.clients.set(cfg.name, client);
      logger.info(`MCP: connected to "${cfg.name}"`);
    } catch (err) {
      logger.warn(`MCP: failed to connect to "${cfg.name}": ${err}`);
    }
  }
  async disconnectAll() {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
        logger.info(`MCP: disconnected "${name}"`);
      } catch {
      }
    }
    this.clients.clear();
  }
  async queryContext(prompt, maxTokens = 4e3) {
    const entries = [];
    for (const [name, client] of this.clients) {
      try {
        const tools2 = await client.listTools();
        for (const tool of tools2.tools) {
          if (tool.name.includes("search") || tool.name.includes("query") || tool.name.includes("docs")) {
            const result = await client.callTool({ name: tool.name, arguments: { query: prompt } });
            const content = JSON.stringify(result.content ?? "");
            entries.push({ serverName: name, content, relevance: 1 });
          }
        }
      } catch (err) {
        logger.warn(`MCP: query error on "${name}": ${err}`);
      }
    }
    return this.trimByBudget(entries, maxTokens);
  }
  async getLibraryDocs(libraries, maxTokens = 2e3) {
    const entries = [];
    for (const lib of libraries) {
      for (const [name, client] of this.clients) {
        try {
          const tools2 = await client.listTools();
          for (const tool of tools2.tools) {
            if (tool.name.toLowerCase().includes("docs") || tool.name.toLowerCase().includes("context")) {
              const result = await client.callTool({ name: tool.name, arguments: { library: lib } });
              const content = JSON.stringify(result.content ?? "");
              entries.push({ serverName: name, content, relevance: 0.8 });
            }
          }
        } catch {
        }
      }
    }
    return this.trimByBudget(entries, maxTokens);
  }
  trimByBudget(entries, maxTokens) {
    const sorted = entries.sort((a, b) => b.relevance - a.relevance);
    let total = 0;
    const result = [];
    for (const e of sorted) {
      const tokens = e.content.length / 4;
      if (total + tokens > maxTokens) break;
      total += tokens;
      result.push(e);
    }
    return result;
  }
};

// src/mcp/servers.ts
var MS_PER_SECOND = 1e3;
var CONTEXT7_TIMEOUT_MS = 10 * MS_PER_SECOND;
var GITHUB_TIMEOUT_MS = 15 * MS_PER_SECOND;
function context7Server(apiKey) {
  const env = {};
  if (apiKey) env.CONTEXT7_API_KEY = apiKey;
  return {
    name: "context7",
    type: "local",
    command: ["npx", "-y", "--quiet", "@upstash/context7-mcp"],
    environment: Object.keys(env).length ? env : void 0,
    timeoutMs: CONTEXT7_TIMEOUT_MS
  };
}
function githubMCPServer(token) {
  const env = {};
  if (token) env.GITHUB_TOKEN = token;
  return {
    name: "github",
    type: "local",
    command: ["npx", "-y", "--quiet", "@github/github-mcp-server"],
    environment: Object.keys(env).length ? env : void 0,
    timeoutMs: GITHUB_TIMEOUT_MS
  };
}
function getDefaultMCPServers(token, context7Key) {
  const servers = [];
  try {
    servers.push(context7Server(context7Key));
  } catch {
  }
  if (token) {
    try {
      servers.push(githubMCPServer(token));
    } catch {
    }
  }
  return servers;
}

// src/learning/db.ts
async function connectDb(url) {
  if (url?.startsWith("postgres://") || url?.startsWith("postgresql://")) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url });
    return {
      run: (sql, params) => pool.query(sql, params).then(() => {
      }),
      get: (sql, params) => pool.query(sql, params).then((r) => r.rows[0]),
      all: (sql, params) => pool.query(sql, params).then((r) => r.rows),
      close: () => pool.end()
    };
  }
  if (url?.startsWith("mysql://")) {
    try {
      const mod = await Function('return import("mysql2/promise")')();
      const conn = await mod.createConnection(url);
      return {
        run: (sql, params) => conn.execute(sql, params).then(() => {
        }),
        get: async (sql, params) => {
          const [rows] = await conn.execute(sql, params);
          return rows[0];
        },
        all: async (sql, params) => {
          const [rows] = await conn.execute(sql, params);
          return rows;
        },
        close: () => conn.end()
      };
    } catch {
      throw new Error("mysql2 is not installed. Run: npm install mysql2");
    }
  }
  const { default: BetterSqlite3 } = await import("better-sqlite3");
  const db = new BetterSqlite3(url ?? ":memory:");
  db.pragma("journal_mode = WAL");
  const closeDb = () => {
    db.close();
  };
  return {
    run: (sql, params) => {
      db.prepare(sql).run(...params ?? []);
      return Promise.resolve();
    },
    get: (sql, params) => Promise.resolve(db.prepare(sql).get(...params ?? [])),
    all: (sql, params) => Promise.resolve(db.prepare(sql).all(...params ?? [])),
    close: () => {
      closeDb();
      return Promise.resolve();
    }
  };
}

// src/learning/schema.ts
var SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  file TEXT NOT NULL,
  line INTEGER,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  suggestion TEXT,
  source TEXT DEFAULT 'ai',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (finding_id) REFERENCES findings(id)
);

CREATE TABLE IF NOT EXISTS review_quality (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  actionability REAL,
  accuracy REAL,
  coverage REAL,
  consistency REAL,
  overall REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  pattern_text TEXT NOT NULL,
  category TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  auto_rule_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  comment TEXT,
  suggestion TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_overrides (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  override_text TEXT NOT NULL,
  reason TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_findings_file ON findings(file);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns(category);
CREATE INDEX IF NOT EXISTS idx_custom_rules_status ON custom_rules(status);
`;
var RADIX = 36;
var SLICE_END = 10;
function generateId() {
  return `cs_${Date.now()}_${Math.random().toString(RADIX).slice(2, SLICE_END)}`;
}

// src/learning/store.ts
var DEFAULT_FINDINGS_LIMIT = 100;
var MAX_RELEVANT_LESSONS = 10;
var LearningStore = class {
  db = null;
  dbPath;
  ready = false;
  constructor(dbPath) {
    this.dbPath = dbPath ?? ".codesentinel/learning.db";
  }
  async init() {
    try {
      this.db = await connectDb(this.dbPath);
      await this.db.run(SCHEMA_SQL);
      this.ready = true;
      logger.info("LearningStore: initialized");
    } catch (err) {
      logger.warn(`LearningStore: init failed (${err}), running without persistence`);
      this.ready = false;
    }
  }
  async recordFinding(finding) {
    if (!this.ready) return "";
    try {
      const id = generateId();
      await this.db.run(
        `INSERT INTO findings (id, file, line, severity, category, message, suggestion, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, finding.file, finding.line ?? null, finding.severity, finding.category, finding.message, finding.suggestion ?? null, finding.source ?? "ai"]
      );
      return id;
    } catch (err) {
      logger.warn(`recordFinding failed: ${err}`);
      return "";
    }
  }
  async getFindings(limit = DEFAULT_FINDINGS_LIMIT) {
    if (!this.ready) return [];
    try {
      return this.db.all("SELECT * FROM findings ORDER BY created_at DESC LIMIT ?", [limit]);
    } catch (err) {
      logger.warn(`getFindings failed: ${err}`);
      return [];
    }
  }
  async recordFeedback(findingId, feedbackType, comment) {
    if (!this.ready) return;
    try {
      await this.db.run(
        "INSERT INTO feedback (id, finding_id, feedback_type, comment) VALUES (?, ?, ?, ?)",
        [generateId(), findingId, feedbackType, comment ?? null]
      );
    } catch (err) {
      logger.warn(`recordFeedback failed: ${err}`);
    }
  }
  async getRelevantLessons(fileExtension) {
    if (!this.ready) return [];
    try {
      const rows = await this.db.all(
        `SELECT f.message, COUNT(*) as frequency
         FROM findings f
         WHERE f.file LIKE ?
         GROUP BY f.message
         ORDER BY frequency DESC
         LIMIT ?`,
        [`%.${fileExtension}`, MAX_RELEVANT_LESSONS]
      );
      return rows.map((r) => r.message);
    } catch (err) {
      logger.warn(`getRelevantLessons failed: ${err}`);
      return [];
    }
  }
  async recordPattern(patternText, category) {
    if (!this.ready) return;
    try {
      const existing = await this.db.get(
        "SELECT * FROM patterns WHERE pattern_text = ?",
        [patternText]
      );
      if (existing) {
        await this.db.run("UPDATE patterns SET frequency = frequency + 1, updated_at = datetime('now') WHERE id = ?", [existing.id]);
      } else {
        await this.db.run(
          "INSERT INTO patterns (id, pattern_text, category) VALUES (?, ?, ?)",
          [generateId(), patternText, category]
        );
      }
    } catch (err) {
      logger.warn(`recordPattern failed: ${err}`);
    }
  }
  async getPendingRules() {
    if (!this.ready) return [];
    try {
      return this.db.all("SELECT * FROM custom_rules WHERE status = 'pending' ORDER BY created_at DESC");
    } catch (err) {
      logger.warn(`getPendingRules failed: ${err}`);
      return [];
    }
  }
  async approveRule(ruleId) {
    if (!this.ready) return;
    try {
      await this.db.run("UPDATE custom_rules SET status = 'approved' WHERE id = ?", [ruleId]);
    } catch (err) {
      logger.warn(`approveRule failed: ${err}`);
    }
  }
  async declineRule(ruleId) {
    if (!this.ready) return;
    try {
      await this.db.run("UPDATE custom_rules SET status = 'declined' WHERE id = ?", [ruleId]);
    } catch (err) {
      logger.warn(`declineRule failed: ${err}`);
    }
  }
  async getFalsePositiveRate() {
    if (!this.ready) return 0;
    try {
      const total = await this.db.get("SELECT COUNT(*) as count FROM feedback");
      const fp = await this.db.get(
        "SELECT COUNT(*) as count FROM feedback WHERE feedback_type = 'false_positive'"
      );
      if (!total || total.count === 0) return 0;
      return (fp?.count ?? 0) / total.count;
    } catch (err) {
      logger.warn(`getFalsePositiveRate failed: ${err}`);
      return 0;
    }
  }
  /** Get rules with high false-positive rate (>= threshold) and minimum feedback count. */
  async getHighFalsePositiveRules(minFeedback = 3, fpThreshold = 0.8) {
    if (!this.ready) return [];
    try {
      const rows = await this.db.all(
        `SELECT finding_id, COUNT(*) as total, SUM(CASE WHEN feedback_type = 'false_positive' THEN 1 ELSE 0 END) as fp_count
         FROM feedback GROUP BY finding_id HAVING total >= ? AND (CAST(SUM(CASE WHEN feedback_type = 'false_positive' THEN 1 ELSE 0 END) AS REAL) / COUNT(*)) >= ?`,
        [minFeedback, fpThreshold]
      );
      return rows.map((r) => ({ ruleId: r.finding_id, fpRate: r.fp_count / r.total, total: r.total }));
    } catch (err) {
      logger.warn(`getHighFalsePositiveRules failed: ${err}`);
      return [];
    }
  }
  async getActivePromptOverrides(taskType) {
    if (!this.ready) return [];
    try {
      const rows = await this.db.all(
        "SELECT override_text FROM prompt_overrides WHERE task_type = ? AND active = 1 ORDER BY created_at DESC",
        [taskType]
      );
      return rows.map((r) => r.override_text);
    } catch (err) {
      logger.warn(`getActivePromptOverrides failed: ${err}`);
      return [];
    }
  }
  async createPromptOverride(taskType, overrideText, reason) {
    if (!this.ready) return;
    try {
      await this.db.run(
        "INSERT INTO prompt_overrides (id, task_type, override_text, reason) VALUES (?, ?, ?, ?)",
        [generateId(), taskType, overrideText, reason ?? null]
      );
    } catch (err) {
      logger.warn(`createPromptOverride failed: ${err}`);
    }
  }
  async autoCreateRule(patternId, name, pattern, severity, category, comment, suggestion) {
    if (!this.ready) return null;
    try {
      const existing = await this.db.get(
        "SELECT * FROM custom_rules WHERE pattern = ? AND status IN ('pending', 'approved')",
        [pattern]
      );
      if (existing) return null;
      const id = generateId();
      await this.db.run(
        "INSERT INTO custom_rules (id, name, pattern, severity, category, comment, suggestion) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, name, pattern, severity, category, comment ?? null, suggestion ?? null]
      );
      await this.db.run("UPDATE patterns SET auto_rule_id = ? WHERE id = ?", [id, patternId]);
      return id;
    } catch (err) {
      logger.warn(`autoCreateRule failed: ${err}`);
      return null;
    }
  }
  async getPatternsAboveThreshold(minFrequency) {
    if (!this.ready) return [];
    try {
      return this.db.all(
        "SELECT * FROM patterns WHERE frequency >= ? AND auto_rule_id IS NULL ORDER BY frequency DESC",
        [minFrequency]
      );
    } catch (err) {
      logger.warn(`getPatternsAboveThreshold failed: ${err}`);
      return [];
    }
  }
  async close() {
    if (!this.db) return;
    try {
      await this.db.close();
    } catch (err) {
      logger.warn(`close failed: ${err}`);
    }
  }
};

// src/event-bus/bus.ts
var DEFAULT_MAX_CONCURRENCY = 10;
var MAX_HISTORY_LENGTH = 100;
var EventBus = class {
  subscribers = /* @__PURE__ */ new Map();
  health = /* @__PURE__ */ new Map();
  history = [];
  maxConcurrency;
  subscriberTimeoutMs;
  maxFailures;
  cooldownMs;
  constructor(opts) {
    this.maxConcurrency = opts?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.subscriberTimeoutMs = opts?.subscriberTimeoutMs ?? 12e4;
    this.maxFailures = opts?.maxFailures ?? 5;
    this.cooldownMs = opts?.cooldownMs ?? 3e4;
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
    for (const s of subscribers) this.register(s);
  }
  async emit(event) {
    this.history.push(event);
    if (this.history.length > MAX_HISTORY_LENGTH) this.history.shift();
    const matching = Array.from(this.subscribers.values()).filter(
      (s) => s.eventTypes.includes(event.type)
    );
    try {
      const results = await Promise.allSettled(
        matching.map((s) => this.dispatch(s, event))
      );
      this.handleEmitResults(matching, results);
    } catch (error) {
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
      const timer = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("timeout")), this.subscriberTimeoutMs)
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
  getSubscriberHealth(name) {
    return this.health.get(name);
  }
};

// src/types/jsonl.ts
import { z as z2 } from "zod";
var SeveritySchema = z2.enum(["info", "low", "medium", "high", "critical"]);
var MAX_SUMMARY_LENGTH = 2e3;
var MAX_TITLE_LENGTH = 200;
var MAX_DESCRIPTION_LENGTH = 1e3;
var MAX_MESSAGE_LENGTH = 1e3;
var MAX_SUGGESTION_LENGTH = 2e3;
var SummaryEntrySchema = z2.object({
  type: z2.literal("summary"),
  summary: z2.string().min(1).max(MAX_SUMMARY_LENGTH)
});
var VerdictEntrySchema = z2.object({
  type: z2.literal("verdict"),
  verdict: z2.enum(["approved", "changes_requested", "comment"])
});
var StrengthEntrySchema = z2.object({
  type: z2.literal("strength"),
  title: z2.string().min(1).max(MAX_TITLE_LENGTH),
  description: z2.string().max(MAX_DESCRIPTION_LENGTH).optional()
});
var IssueEntrySchema = z2.object({
  type: z2.literal("issue"),
  severity: SeveritySchema,
  category: z2.enum(["bug", "security", "performance", "smell", "style"]),
  file: z2.string().min(1),
  line: z2.number().int().positive().nullable().optional(),
  message: z2.string().min(1).max(MAX_MESSAGE_LENGTH),
  suggestion: z2.string().max(MAX_SUGGESTION_LENGTH).optional()
});
var ReviewEntrySchema = z2.discriminatedUnion("type", [
  SummaryEntrySchema,
  VerdictEntrySchema,
  StrengthEntrySchema,
  IssueEntrySchema
]);

// src/jsonl-parser.ts
function emptyResult() {
  return { summary: "", verdict: "comment", strengths: [], issues: [] };
}
function parseJsonlString(raw) {
  const entries = [];
  for (const line of raw.split("\n").map((l) => l.trim())) {
    if (!line || line.startsWith("#")) continue;
    try {
      const parsed = JSON.parse(line);
      const result = ReviewEntrySchema.safeParse(parsed);
      if (result.success) {
        entries.push(result.data);
      }
    } catch {
    }
  }
  return entries;
}
function validateAndNormalize(entries) {
  const result = emptyResult();
  for (const entry of entries) {
    switch (entry.type) {
      case "summary":
        result.summary = entry.summary;
        break;
      case "verdict":
        result.verdict = entry.verdict;
        break;
      case "strength":
        result.strengths.push({ title: entry.title, description: entry.description });
        break;
      case "issue":
        result.issues.push(entry);
        break;
    }
  }
  return result;
}

// src/engine/batcher.ts
function groupIntoBatches(files, batchSize) {
  const batches = [];
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }
  return batches;
}

// src/engine/index.ts
function applyHunks(content, hunks) {
  const lines = content.split("\n");
  const sorted = [...hunks].sort((a, b) => b.startLine - a.startLine);
  for (const hunk of sorted) {
    const idx = hunk.startLine - 1;
    if (idx < 0 || idx > lines.length) continue;
    lines.splice(idx, hunk.deleteCount, ...hunk.newLines);
  }
  return lines.join("\n");
}
var Engine = class _Engine {
  constructor(config, secrets, root = process.cwd(), aiOverride) {
    this.secrets = secrets;
    this.root = root;
    this.aiOverride = aiOverride;
    this.config = config;
    this.ai = aiOverride ?? new AIHub(config, secrets);
    if (aiOverride) this.aiAvailable = true;
    this.prompts = new PromptRegistry(config);
    this.cache = new FileCache(resolve9(root, config.cache_dir));
    this.plugins = new PluginManager({ config, logger });
    this.eventBus = new EventBus();
    this.analyzer = new StaticAnalyzer(
      config.analyzer,
      resolve9(root, config.cache_dir, "analysis")
    );
    this.dismissals = new DismissalManager(resolve9(root, config.dismissalsFile));
    this.dashboard = new DashboardServer(config.dashboard.port, resolve9(root, config.dashboard.dataDir));
    for (const rule of config.analyzer.customRules) {
      this.analyzer.addCustomRule(rule);
    }
    if (config.mcp.enabled) {
      this.mcp = new MCPManager(
        config.mcp.servers.length ? config.mcp.servers : getDefaultMCPServers()
      );
    }
    if (config.learning.enabled) {
      this.learning = new LearningStore(config.learning.dbPath);
    }
    logger.info(`Configured AI model: ${config.default_model.provider}/${config.default_model.model}`);
    logger.info(`Review model: ${(config.models.review ?? config.default_model).provider}/${(config.models.review ?? config.default_model).model}`);
    this.eventBus.emit({ type: "ready", payload: { timestamp: Date.now() } });
  }
  config;
  ai;
  prompts;
  analyzer;
  scorer = new Scorer();
  cache;
  plugins;
  dismissals;
  dashboard = null;
  mcp = null;
  learning = null;
  eventBus;
  aiAvailable = true;
  /** Best-effort health check: log whether the AI provider is reachable. */
  async checkAIProvider() {
    if (this.aiOverride) return;
    const model = this.ai.modelForTask("review");
    const baseUrl = (this.secrets.opencode_base_url || "http://localhost:4096").replace(/\/v1$/, "");
    if (model.provider === "opencode") {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2e3);
        const res = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          logger.info(`OpenCode is REACHABLE at ${baseUrl}`);
        } else {
          this.aiAvailable = false;
          logger.warn(`OpenCode at ${baseUrl} returned status ${res.status} \u2014 AI review will fail`);
        }
      } catch {
        this.aiAvailable = false;
        logger.warn(`OpenCode at ${baseUrl} is NOT reachable \u2014 AI review will be skipped (this is expected unless you have opencode running locally)`);
      }
    } else {
      const keyName = `${model.provider}_api_key`;
      const hasKey = !!this.secrets[keyName];
      logger.info(`AI provider: ${model.provider}, API key ${hasKey ? "SET" : "NOT SET"}`);
    }
  }
  /** Convenience factory used by CLI / Action. */
  static fromInputs(opts) {
    const config = loadConfig({
      configPath: opts.configPath,
      overrides: opts.overrides
    });
    return new _Engine(config, opts.secrets, opts.root);
  }
  /** Load configured plugins before running. */
  async init() {
    await this.plugins.load(this.config.plugins);
    if (this.learning) await this.learning.init();
  }
  // ---------------------------------------------------------------------------
  // Entry point: dispatch to the mode-specific runner.
  // ---------------------------------------------------------------------------
  async run() {
    await this.init();
    const start = Date.now();
    logger.info(`Running mode: ${this.config.mode}`);
    await this.checkAIProvider();
    let report;
    switch (this.config.mode) {
      case "review":
        report = await this.runReview();
        break;
      case "fix":
        report = await this.runFix();
        break;
      case "audit":
        report = await this.runAudit();
        break;
      case "score":
        report = await this.runScoreMode();
        break;
      case "testgen":
        report = await this.runTestgen();
        break;
      case "gate":
        report = await this.runGate();
        break;
      case "describe":
        report = await this.runDescribe();
        break;
      case "chat":
        report = await this.runChat("(no prompt supplied; use ask())");
        break;
      case "improve":
        report = await this.runImprove();
        break;
      default:
        throw new Error(`Unsupported mode: ${this.config.mode}`);
    }
    report.metrics.durationMs = Date.now() - start;
    this.finalizeReport(report);
    if (this.config.output.writeReportFile) this.writeReportFile(report);
    return report;
  }
  // ---------------------------------------------------------------------------
  // GATE
  // ---------------------------------------------------------------------------
  async runGate() {
    const files = await this.collectedFiles();
    const findings = await this.analyzeFiles(files);
    const score = this.config.enable_scoring ? await this.computeScore(files, findings) : null;
    const gateResult = evaluateGate(findings, score, this.config.gate);
    const summary = gateResult.passed ? `[gate] PASSED \u2014 ${gateResult.reason}` : `[gate] FAILED \u2014 ${gateResult.reason}`;
    if (!gateResult.passed) {
      logger.warn(`Gate FAILED: ${gateResult.reason}`);
    }
    this.recordDashboardRun("gate", findings, score, 0);
    return {
      mode: "gate",
      summary,
      findings,
      score,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      gatePassed: gateResult.passed,
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
    };
  }
  // ---------------------------------------------------------------------------
  // DEAD CODE
  // ---------------------------------------------------------------------------
  async runDeadCode(files) {
    return detectDeadCode(files);
  }
  // ---------------------------------------------------------------------------
  // COMMITTABLE SUGGESTIONS
  // ---------------------------------------------------------------------------
  buildSuggestions(findings, fileContents) {
    return buildSuggestionsComment(findings, fileContents);
  }
  // ---------------------------------------------------------------------------
  // DISMISSAL
  // ---------------------------------------------------------------------------
  getDismissalManager() {
    return this.dismissals;
  }
  /** Dismiss by rule and record feedback in learning store. */
  async dismissByRule(ruleId, reason) {
    this.dismissals.dismissByRule(ruleId, reason);
    if (this.learning) {
      try {
        await this.learning.recordFeedback(ruleId, "false_positive", reason);
      } catch {
      }
    }
  }
  /** Dismiss by file+line and record feedback in learning store. */
  async dismissByFinding(file, line, ruleId, reason) {
    this.dismissals.dismissByFinding(file, line, ruleId, reason);
    if (this.learning) {
      try {
        await this.learning.recordFeedback(ruleId, "false_positive", reason);
      } catch {
      }
    }
  }
  // ---------------------------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------------------------
  getDashboard() {
    return this.dashboard;
  }
  recordDashboardRun(mode, findings, score, durationMs) {
    if (!this.dashboard) return;
    const bySeverity = {};
    const byCategory = {};
    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    }
    this.dashboard.recordRun({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      mode,
      totalFindings: findings.length,
      score: score?.overall ?? null,
      findingsBySeverity: bySeverity,
      findingsByCategory: byCategory,
      durationMs
    });
  }
  // ---------------------------------------------------------------------------
  // File collection helpers.
  // ---------------------------------------------------------------------------
  async collectedFiles() {
    if (this.config.mode === "review" || this.config.mode === "fix") {
      const diffs = await collectDiff(void 0, this.root);
      if (diffs.length > 0) {
        return diffs.filter((d) => d.status !== "deleted").map((d) => ({ path: d.path, content: d.content, diff: d.diff }));
      }
      logger.info("No diff found \u2014 falling back to full repo scan");
    }
    const rels = collectFiles(this.root, this.config.include, this.config.exclude);
    return rels.map((path) => ({
      path,
      content: readText(resolve9(this.root, path))
    }));
  }
  // ---------------------------------------------------------------------------
  // Shared analysis pass: static + plugins.
  // ---------------------------------------------------------------------------
  async analyzeFiles(files) {
    const allFindings = [];
    const linterResults = this.config.linters.enabled ? runLinters(this.root, { tools: this.config.linters.tools, args: this.config.linters.args }) : [];
    const scannerResults = this.config.enableSecretScanner ? runThirdPartySecrets(this.root) : [];
    for (const file of files) {
      const ch = this.cache.contentHash(file.content);
      const cacheKey = { task: "static", path: file.path, hash: ch };
      const cached = this.config.enable_cache ? this.cache.get("static", cacheKey) : null;
      if (cached) {
        allFindings.push(...cached);
        continue;
      }
      const staticFindings = this.analyzer.analyzeMany([file]);
      const pluginFindings = await this.plugins.runAnalyze([file]);
      const secretFindings = scanSecrets(file.path, file.content, this.config.secretPatterns);
      const fileFindings = [
        ...staticFindings,
        ...pluginFindings,
        ...secretFindings,
        ...linterResults,
        ...scannerResults
      ];
      if (this.config.enable_cache) {
        this.cache.set("static", cacheKey, fileFindings);
      }
      allFindings.push(...fileFindings);
    }
    const filtered = this.dismissals.filterDismissed(allFindings);
    if (this.learning && this.config.learning.enabled) {
      try {
        const highFp = await this.learning.getHighFalsePositiveRules();
        if (highFp.length) {
          const mutedRuleIds = new Set(highFp.map((r) => r.ruleId));
          const result = filtered.filter((f) => {
            const ruleId = `${f.category}:${f.comment.slice(0, 40)}`;
            return !mutedRuleIds.has(ruleId);
          });
          if (result.length < filtered.length) {
            logger.info(`analyzeFiles: auto-muted ${filtered.length - result.length} finding(s) from ${highFp.length} high-FP rule(s)`);
          }
          return result;
        }
      } catch {
      }
    }
    return filtered;
  }
  // ---------------------------------------------------------------------------
  // REVIEW
  // ---------------------------------------------------------------------------
  async runReview() {
    const files = await this.collectedFiles();
    const staticFindings = await this.analyzeFiles(files);
    const { findings: aiFindings, summaries: aiSummaries } = await this.aiReview(files);
    const findings = [...staticFindings, ...aiFindings];
    this.recordPatterns(findings).catch(() => {
    });
    let fixAttempts = [];
    if (this.config.enable_auto_fix && !this.config.dry_run) {
      const actionable = findings.filter((f) => f.category !== "praise");
      if (actionable.length > 0) {
        logger.info(`runReview: auto-fixing ${actionable.length} issue(s)`);
        const fixReport = await this.runFixLoopFor(actionable);
        fixAttempts = fixReport.fixAttempts;
        const updatedFiles = await this.collectedFiles();
        const updatedStatic = await this.analyzeFiles(updatedFiles);
        const { findings: updatedAi } = await this.aiReview(updatedFiles);
        const updatedFindings = [...updatedStatic, ...updatedAi];
        const summary2 = this.buildSummary("review", updatedFindings, fixAttempts, aiSummaries);
        return {
          mode: "review",
          summary: summary2,
          findings: updatedFindings,
          score: this.config.enable_scoring ? await this.computeScore(updatedFiles, updatedFindings) : null,
          comments: [],
          generatedTests: [],
          fixAttempts,
          metrics: { filesAnalyzed: updatedFiles.length, findingsBySeverity: {}, durationMs: 0 }
        };
      }
    }
    const comments = findings.filter((f) => f.category !== "praise" || this.config.include_positive_feedback).map((f) => ({
      file: f.file,
      line: f.line,
      body: `${f.comment}${f.suggestion ? `

Suggestion: ${f.suggestion}` : ""}`,
      severity: f.severity
    }));
    const summary = this.buildSummary("review", findings, void 0, aiSummaries);
    const report = {
      mode: "review",
      summary,
      findings,
      score: null,
      comments,
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
    };
    if (this.config.enable_scoring) {
      report.score = await this.computeScore(files, findings);
    }
    return report;
  }
  /** Ask the AI model to review each changed file (cached per file). */
  async aiReview(files) {
    if (!this.aiAvailable) {
      logger.warn("aiReview: AI provider not reachable \u2014 skipping AI review");
      return { findings: [], summaries: [] };
    }
    logger.info(`aiReview: starting AI review for ${files.length} files`);
    const batches = this.config.batch.enabled ? groupIntoBatches(files, this.config.batch.batchSize) : files.map((f) => [f]);
    const allResults = [];
    const allSummaries = [];
    for (const batch of batches) {
      logger.info(`aiReview: batch size=${batch.length}`);
      const results = await concurrentMap(batch, async (file) => {
        logger.info(`aiReview: processing ${file.path} (diff_len=${(file.diff ?? "").length}, content_len=${file.content.length})`);
        try {
          const cacheKey = { task: "review", path: file.path, content: file.content };
          const cached = this.config.enable_cache ? this.cache.get("review", cacheKey) : null;
          const parsed = cached ?? await this.callAI("review", "review", file);
          if (!cached && this.config.enable_cache) {
            this.cache.set("review", cacheKey, parsed);
          }
          if ("summary" in parsed && parsed.summary) allSummaries.push(parsed.summary);
          const fileFindings = (parsed.findings ?? []).map((f) => ({
            ...f,
            file: f.file || file.path,
            source: "ai"
          }));
          logger.info(`aiReview: ${file.path} -> ${fileFindings.length} findings (cached=${!!cached})`);
          return fileFindings;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`AI review failed for ${file.path}: ${msg}`);
          return [];
        }
      }, 5);
      allResults.push(...results.flat());
    }
    const out = allResults;
    logger.info(`aiReview: total AI findings = ${out.length}`);
    return { findings: out, summaries: allSummaries };
  }
  /** Record recurring patterns and auto-create rules. */
  async recordPatterns(findings) {
    if (!this.learning || !this.config.learning.patternDiscovery) return;
    try {
      const groups = /* @__PURE__ */ new Map();
      for (const f of findings) {
        const key = `${f.category}:${f.comment.slice(0, 60)}`;
        const existing = groups.get(key);
        if (existing) {
          existing.count++;
        } else {
          groups.set(key, { count: 1, category: f.category, comment: f.comment, suggestion: f.suggestion });
        }
      }
      for (const [, g] of groups) {
        if (g.count < 2) continue;
        await this.learning.recordPattern(g.comment, g.category);
      }
      const freqPatterns = await this.learning.getPatternsAboveThreshold(3);
      for (const p of freqPatterns) {
        const ruleName = `auto-${p.category}-${p.pattern_text.slice(0, 30).replace(/\s+/g, "_")}`;
        await this.learning.autoCreateRule(p.id, ruleName, p.pattern_text, "medium", p.category, `Auto-generated from recurring pattern (frequency: ${p.frequency})`);
        logger.info(`recordPatterns: auto-created rule "${ruleName}" from pattern ${p.id} (freq=${p.frequency})`);
      }
    } catch {
    }
  }
  // ---------------------------------------------------------------------------
  // FIX — Review-Fix Loop Engineering
  // ---------------------------------------------------------------------------
  async runFix() {
    if (!this.aiAvailable) {
      logger.warn("runFix: AI provider not available \u2014 cannot apply fixes");
      return {
        mode: "fix",
        summary: "AI provider not reachable. Cannot apply fixes without an AI provider.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 }
      };
    }
    const allFixAttempts = [];
    const allFindings = [];
    const modifiedFiles = /* @__PURE__ */ new Set();
    const maxCycles = this.config.max_iterations;
    let cycle = 0;
    while (cycle < maxCycles) {
      cycle++;
      logger.info(`runFix: === cycle ${cycle}/${maxCycles} ===`);
      const files = await this.collectedFiles();
      if (files.length === 0) {
        logger.info("runFix: no files to analyze, exiting loop");
        break;
      }
      const staticFindings = await this.analyzeFiles(files);
      let findings = staticFindings;
      if (cycle === 1 && this.aiAvailable) {
        const { findings: aiFindings } = await this.aiReview(files);
        if (aiFindings.length) findings = [...staticFindings, ...aiFindings];
      }
      allFindings.length = 0;
      allFindings.push(...findings);
      const actionable = findings.filter((f) => f.category !== "praise");
      logger.info(`runFix: cycle ${cycle} \u2014 ${actionable.length} actionable findings`);
      if (actionable.length === 0) {
        logger.info("runFix: all issues resolved, fix successful");
        break;
      }
      if (!this.config.enable_auto_fix) {
        logger.info("runFix: auto-fix disabled, exiting after review");
        break;
      }
      const MAX_FINDINGS_PER_FILE = 20;
      const fileGroups = /* @__PURE__ */ new Map();
      for (const f of actionable) {
        const list = fileGroups.get(f.file);
        if (list) {
          if (list.length >= MAX_FINDINGS_PER_FILE) continue;
          list.push(f);
        } else {
          fileGroups.set(f.file, [f]);
        }
      }
      const groups = [...fileGroups.entries()];
      const PHASE_SIZE = 5;
      for (let phase = 0; phase < groups.length; phase += PHASE_SIZE) {
        const phaseGroups = groups.slice(phase, phase + PHASE_SIZE);
        logger.info(`runFix: phase ${phase / PHASE_SIZE + 1}/${Math.ceil(groups.length / PHASE_SIZE)} (${phaseGroups.length} files)`);
        const batchResults = await concurrentMap(phaseGroups, async ([filePath, fileFindings], idx) => {
          logger.info(`runFix: batch ${phase + idx + 1}/${fileGroups.size} \u2014 ${filePath} (${fileFindings.length} issues)`);
          try {
            const attempt = await this.batchApplyFix(filePath, fileFindings, phase + idx + 1);
            logger.info(`runFix: batch result \u2014 fixed=${attempt.fixed} verified=${attempt.verified}`);
            return attempt;
          } catch (err) {
            logger.warn(`runFix: batch fix failed for ${filePath}: ${err instanceof Error ? err.message : err}`);
            return {
              iteration: phase + idx + 1,
              file: filePath,
              fixed: false,
              explanation: `Error: ${err instanceof Error ? err.message : err}`,
              verified: false,
              newIssuesIntroduced: []
            };
          }
        }, 3);
        for (const attempt of batchResults) {
          allFixAttempts.push(attempt);
          if (attempt.fixed && this.config.enable_auto_fix && !this.config.dry_run) {
            modifiedFiles.add(attempt.file);
          }
        }
        if (modifiedFiles.size > 0 && phase + PHASE_SIZE < groups.length) {
          const branch = await this.pushFixes(modifiedFiles, `[skip ci] phase ${phase / PHASE_SIZE + 1}/${Math.ceil(groups.length / PHASE_SIZE)}`);
          if (branch) await this.createFixPR(branch);
          modifiedFiles.clear();
        }
      }
    }
    if (modifiedFiles.size > 0 && !this.config.dry_run) {
      const branch = await this.pushFixes(modifiedFiles);
      if (branch) await this.createFixPR(branch);
    }
    const summary = this.buildSummary("fix", allFindings, allFixAttempts);
    return {
      mode: "fix",
      summary,
      findings: allFindings,
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: allFixAttempts,
      metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 }
    };
  }
  /** Commit and push fixed files, returning the target branch name. */
  async pushFixes(modifiedFiles, tag) {
    const { execSync: execSync3 } = await import("node:child_process");
    try {
      const files = [...modifiedFiles].join(" ");
      execSync3(`git add ${files}`, { cwd: this.root, stdio: "pipe" });
      const headRef = process.env.GITHUB_HEAD_REF || "";
      let target;
      if (headRef) {
        target = headRef;
      } else {
        target = `codesentinel/fix-${Date.now()}`;
        execSync3(`git checkout -b ${target}`, { cwd: this.root, stdio: "pipe" });
      }
      const msg = tag ? `CodeSentinel: auto-fix issues ${tag}` : "CodeSentinel: auto-fix issues [skip ci]";
      execSync3(`git commit -m "${msg}"`, { cwd: this.root, stdio: "pipe" });
      execSync3(`git push origin HEAD:${target}`, { cwd: this.root, stdio: "pipe" });
      logger.info(`pushFixes: pushed ${files.length} file(s) to ${target}`);
      return target;
    } catch (err) {
      logger.warn("pushFixes: failed to push:", err);
      return "";
    }
  }
  /** Create a PR from the fix branch and optionally enable auto-merge. */
  async createFixPR(fixBranch) {
    if (!fixBranch || !process.env.GITHUB_TOKEN) return;
    const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
    const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (!owner || !repo) return;
    const reporter = new GitHubReporter({ token: process.env.GITHUB_TOKEN, owner, repo });
    const defaultBranch = process.env.GITHUB_BASE_REF || "main";
    try {
      const prNumber = await reporter.createPR({
        title: "CodeSentinel: auto-fix issues",
        body: "This PR was automatically created by CodeSentinel AI to fix code quality issues.",
        head: fixBranch,
        base: defaultBranch
      });
      logger.info(`createFixPR: created PR #${prNumber} from ${fixBranch} to ${defaultBranch}`);
      if (this.config.autoMerge) {
        await reporter.enableAutoMerge(prNumber, "squash");
        logger.info(`createFixPR: enabled auto-merge on PR #${prNumber}`);
      }
    } catch (err) {
      logger.warn("createFixPR: failed:", err);
    }
  }
  /** Generate and (optionally) write a fix for a single finding. */
  async applyFix(finding, iteration) {
    const filePath = resolve9(this.root, finding.file);
    const content = readText(filePath);
    const prompt = this.prompts.render("fix", {
      severity: finding.severity,
      category: finding.category,
      file: finding.file,
      line: finding.line ?? "",
      comment: finding.comment,
      suggestion: finding.suggestion ?? "",
      language: finding.file.split(".").pop() ?? "text",
      code: content,
      project_context: this.config.project_context || "(none)"
    });
    logger.info(`applyFix[${iteration}]: prompt=${JSON.stringify(finding.file)} severity=${finding.severity} category=${finding.category}`);
    const res = await this.ai.complete("fix", [
      { role: "system", content: "You apply minimal, safe code fixes." },
      { role: "user", content: prompt }
    ]);
    logger.info(`applyFix[${iteration}]: AI response len=${res.content.length}`);
    const parsed = extractJson(res.content);
    if (!parsed) {
      return {
        iteration,
        file: finding.file,
        fixed: false,
        explanation: "AI returned unparseable response",
        verified: false,
        newIssuesIntroduced: []
      };
    }
    let verified = false;
    let newIssuesIntroduced = [];
    if (parsed.fixed && this.config.enable_auto_fix && !this.config.dry_run) {
      const findingsBefore = this.analyzer.analyzeMany([{ path: finding.file, content }]);
      const fixedContent = applyHunks(content, parsed.hunks ?? []);
      writeFileSync7(filePath, fixedContent, "utf8");
      verified = await this.runVerification();
      const contentAfter = readText(filePath);
      const findingsAfter = this.analyzer.analyzeMany([{ path: finding.file, content: contentAfter }]);
      const beforeIds = new Set(findingsBefore.map((f) => `${f.category}:${f.line}:${f.comment}`));
      newIssuesIntroduced = findingsAfter.filter((f) => {
        const id = `${f.category}:${f.line}:${f.comment}`;
        return !beforeIds.has(id);
      });
      if (newIssuesIntroduced.length > 0) {
        logger.warn(`applyFix[${iteration}]: fix introduced ${newIssuesIntroduced.length} new finding(s)`);
      }
    }
    return {
      iteration,
      file: finding.file,
      fixed: parsed.fixed,
      explanation: parsed.explanation,
      verified,
      newIssuesIntroduced
    };
  }
  /** Apply fixes for ALL findings in a single file in ONE AI call. */
  async batchApplyFix(filePath, findings, iteration) {
    const absPath = resolve9(this.root, filePath);
    const content = readText(absPath);
    const issuesMd = findings.map(
      (f, i) => `### Issue ${i + 1}
Severity: ${f.severity}
Category: ${f.category}
Line: ${f.line ?? "N/A"}
Feedback: ${f.comment}
Suggestion: ${f.suggestion ?? ""}`
    ).join("\n\n");
    const prompt = `You are an expert engineer fixing ${findings.length} issue(s) in ${filePath}.

## File Content
\`\`\`${filePath.split(".").pop() ?? "text"}
${content}
\`\`\`

## Issues to Fix
${issuesMd}

## Rules
- Fix ALL listed issues with minimal changes.
- Return changes as "hunks" (line-based patch), NOT the complete file.
- Set "fixed": false if you cannot safely fix any issue.
- hunks format: { startLine: <1-indexed>, deleteCount: <lines to remove>, newLines: ["replacement", "lines"] }
- Output: Markdown explanation, then \`\`\`json { "fixed": bool, "explanation": "...", "hunks": [...] } \`\`\``;
    logger.info(`batchApplyFix[${iteration}]: ${filePath} \u2014 ${findings.length} issues`);
    const res = await this.ai.complete("fix", [
      { role: "system", content: "You apply minimal, safe code fixes." },
      { role: "user", content: prompt }
    ]);
    const parsed = extractJson(res.content);
    if (!parsed) {
      return { iteration, file: filePath, fixed: false, explanation: "AI returned unparseable response", verified: false, newIssuesIntroduced: [] };
    }
    let verified = false;
    let newIssuesIntroduced = [];
    if (parsed.fixed && this.config.enable_auto_fix && !this.config.dry_run) {
      const findingsBefore = this.analyzer.analyzeMany([{ path: filePath, content }]);
      const fixedContent = applyHunks(content, parsed.hunks ?? []);
      writeFileSync7(absPath, fixedContent, "utf8");
      verified = await this.runVerification();
      const contentAfter = readText(absPath);
      const findingsAfter = this.analyzer.analyzeMany([{ path: filePath, content: contentAfter }]);
      const beforeIds = new Set(findingsBefore.map((f) => `${f.category}:${f.line}:${f.comment}`));
      newIssuesIntroduced = findingsAfter.filter((f) => !beforeIds.has(`${f.category}:${f.line}:${f.comment}`));
    }
    return { iteration, file: filePath, fixed: parsed.fixed, explanation: parsed.explanation, verified, newIssuesIntroduced };
  }
  /** Apply fixes for a batch of findings without the full re-analysis loop. */
  async runFixLoopFor(actionable) {
    const allFixAttempts = [];
    const modifiedFiles = /* @__PURE__ */ new Set();
    const maxFixesPerFinding = 3;
    for (const finding of actionable) {
      let success = false;
      for (let attempt = 1; attempt <= maxFixesPerFinding; attempt++) {
        try {
          const result = await this.applyFix(finding, attempt);
          allFixAttempts.push(result);
          if (result.fixed && result.verified) {
            modifiedFiles.add(finding.file);
            success = true;
            break;
          }
          if (result.fixed) {
            modifiedFiles.add(finding.file);
          }
        } catch (err) {
          allFixAttempts.push({
            iteration: attempt,
            file: finding.file,
            fixed: false,
            explanation: `Error: ${err instanceof Error ? err.message : err}`,
            verified: false,
            newIssuesIntroduced: []
          });
        }
      }
      if (!success) {
        logger.warn(`runFixLoopFor: failed to fix ${finding.file}:${finding.line} after ${maxFixesPerFinding} attempts`);
      }
    }
    if (modifiedFiles.size > 0) {
      await this.pushFixes(modifiedFiles);
    }
    return { fixAttempts: allFixAttempts };
  }
  /** Run lint + tests after a fix. Best-effort; returns true if both pass. */
  async runVerification() {
    const { execSync: execSync3 } = await import("node:child_process");
    let allPassed = true;
    try {
      execSync3("npx tsc --noEmit", { cwd: this.root, stdio: "ignore", timeout: 3e4 });
    } catch {
      logger.warn("runVerification: typecheck failed \u2014 fix introduced syntax/type errors");
      allPassed = false;
    }
    try {
      if (this.config.test_runner === "jest") {
        execSync3("npx jest --passWithNoTests", { cwd: this.root, stdio: "ignore" });
      } else {
        execSync3("npx vitest run", { cwd: this.root, stdio: "ignore" });
      }
    } catch {
      allPassed = false;
    }
    if (this.config.linters.enabled) {
      const linterFindings = runLinters(this.root, {
        tools: this.config.linters.tools,
        args: this.config.linters.args
      });
      if (linterFindings.length > 0) {
        logger.warn(`runVerification: linter reported ${linterFindings.length} finding(s) after fix`);
        allPassed = false;
      }
    }
    return allPassed;
  }
  // ---------------------------------------------------------------------------
  // AUDIT
  // ---------------------------------------------------------------------------
  async runAudit() {
    const files = await this.collectedFiles();
    const staticFindings = await this.analyzeFiles(files);
    const snapshot = files.map((f) => `### ${f.path}
\`\`\`
${f.content}
\`\`\``).join("\n\n").slice(0, 6e4);
    const prompt = this.prompts.render("audit", {
      project_context: this.config.project_context || "(none)",
      repository_snapshot: snapshot
    });
    const res = await this.ai.complete("audit", [
      { role: "system", content: "You are a principal engineer doing a repo audit." },
      { role: "user", content: prompt }
    ]);
    const parsed = extractJson(res.content) ?? { summary: "", findings: [] };
    const aiFindings = (parsed.findings ?? []).map((f) => ({
      severity: f.severity,
      category: f.category,
      file: f.file ?? "repo-wide",
      line: null,
      comment: `${f.title}: ${f.description}

Recommendation: ${f.recommendation}`,
      source: "ai"
    }));
    const findings = [...staticFindings, ...aiFindings];
    const summary = parsed.summary ?? this.buildSummary("audit", findings);
    return {
      mode: "audit",
      summary,
      findings,
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
    };
  }
  // ---------------------------------------------------------------------------
  // SCORE
  // ---------------------------------------------------------------------------
  async runScoreMode() {
    const files = await this.collectedFiles();
    const staticFindings = await this.analyzeFiles(files);
    const score = await this.computeScore(files, staticFindings);
    return {
      mode: "score",
      summary: `Overall code quality score: ${score.overall}/100.`,
      findings: staticFindings,
      score,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
    };
  }
  /** Combine the static baseline with an AI refinement of the sub-scores. */
  async computeScore(files, findings) {
    const baseline = this.scorer.scoreStatic(
      files.map((f) => ({ path: f.path, content: f.content })),
      findings
    );
    const cacheKey = {
      task: "score",
      paths: files.map((f) => f.path).sort()
    };
    try {
      const cached = this.config.enable_cache ? this.cache.get("score", cacheKey) : null;
      const ai = cached ?? await this.callScoreAI(files);
      if (!cached && this.config.enable_cache) this.cache.set("score", cacheKey, ai);
      return this.scorer.blendWithAI(baseline, ai, ai.rationale, this.config.securityBlendStrategy);
    } catch {
      return baseline;
    }
  }
  // ---------------------------------------------------------------------------
  // TESTGEN
  // ---------------------------------------------------------------------------
  async runTestgen() {
    if (!this.aiAvailable) {
      return {
        mode: "testgen",
        summary: "AI provider not reachable. Start opencode (`opencode`) or set another provider via `--provider`.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 }
      };
    }
    const files = await this.collectedFiles();
    const gen = new TestGenerator(this.config, this.ai, this.prompts);
    const generatedTests = await gen.generate(this.root, files);
    return {
      mode: "testgen",
      summary: `Generated ${generatedTests.length} test file(s).`,
      findings: [],
      score: null,
      comments: [],
      generatedTests,
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
    };
  }
  // ---------------------------------------------------------------------------
  // CHAT
  // ---------------------------------------------------------------------------
  async runChat(question) {
    if (!this.aiAvailable) {
      return {
        mode: "chat",
        summary: "AI provider not reachable. Start opencode (`opencode`) or set another provider via `--provider`.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 }
      };
    }
    const files = await this.collectedFiles();
    const context = files.map((f) => `### ${f.path}
${f.content}`).join("\n\n").slice(0, 4e4);
    const prompt = `Project context: ${this.config.project_context || "(none)"}

Relevant code:
${context}

Question: ${question}

Answer concisely and with references to the code where possible.`;
    const res = await this.ai.complete("chat", [
      { role: "system", content: "You are a helpful senior engineer answering questions about this codebase." },
      { role: "user", content: prompt }
    ]);
    return {
      mode: "chat",
      summary: res.content,
      findings: [],
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
    };
  }
  // ---------------------------------------------------------------------------
  // DESCRIBE
  // ---------------------------------------------------------------------------
  async runDescribe() {
    if (!this.aiAvailable) {
      return {
        mode: "describe",
        summary: "AI provider not reachable. Start opencode (`opencode`) or set another provider via `--provider`.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 }
      };
    }
    const files = await this.collectedFiles();
    const diff = files.map((f) => `### ${f.path}${f.diff ? `
\`\`\`diff
${f.diff}
\`\`\`` : ""}`).join("\n\n").slice(0, 6e4);
    const prompt = this.prompts.render("describe", {
      project_context: this.config.project_context || "(none)",
      diff
    });
    const res = await this.ai.complete("describe", [
      { role: "system", content: "You write concise, structured PR descriptions." },
      { role: "user", content: prompt }
    ]);
    const parsed = extractJson(res.content) ?? { title: "PR Description", description: "", type: "chore", breakingChanges: false, highlights: [], todo: [] };
    const summary = [
      `## ${parsed.title ?? "PR Description"}`,
      "",
      `**Type:** ${parsed.type ?? "chore"}`,
      parsed.breakingChanges ? "**\u26A0 Breaking Changes**" : "",
      "",
      parsed.description ?? "",
      "",
      parsed.highlights?.length ? "### Highlights\n- " + parsed.highlights.join("\n- ") : "",
      "",
      parsed.todo?.length ? "### TODO\n- " + parsed.todo.join("\n- ") : ""
    ].filter(Boolean).join("\n");
    return {
      mode: "describe",
      summary,
      findings: [],
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
    };
  }
  /** Public helper used by the GitHub App / Action to answer `/ask`. */
  async ask(question) {
    const report = await this.runChat(question);
    return report.summary;
  }
  // ---------------------------------------------------------------------------
  // IMPROVE — auto-improvement mode (testgen / utility gen / doc gen)
  // ---------------------------------------------------------------------------
  async runImprove() {
    const type = this.config.improve_type || "test";
    logger.info(`runImprove: type=${type}`);
    switch (type) {
      case "test":
        return this.runTestgen();
      case "util":
        return this.runGenerateUtilities();
      case "doc":
        return this.runGenerateDocs();
      default:
        return {
          mode: "improve",
          summary: `Unknown improve type: ${type}`,
          findings: [],
          score: null,
          comments: [],
          generatedTests: [],
          fixAttempts: [],
          metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 }
        };
    }
  }
  /** AI-powered utility function generation. */
  async runGenerateUtilities() {
    const files = await this.collectedFiles();
    const code = files.map((f) => `### ${f.path}
${f.content}`).join("\n\n").slice(0, 6e4);
    const prompt = this.prompts.render("generate-utils", {
      project_context: this.config.project_context || "(none)",
      code
    });
    const res = await this.ai.complete("fix", [
      { role: "system", content: "You generate utility functions for TypeScript/Node.js projects." },
      { role: "user", content: prompt }
    ]);
    const parsed = extractJson(res.content);
    if (!parsed || !parsed.files?.length) {
      return {
        mode: "improve",
        summary: "No utilities generated. AI returned no valid output.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
      };
    }
    const { writeFileSync: writeFileSync9, mkdirSync: mkdirSync6 } = await import("node:fs");
    const { dirname: dirname4, resolve: resolve10 } = await import("node:path");
    for (const f of parsed.files) {
      const abs = resolve10(this.root, f.path);
      mkdirSync6(dirname4(abs), { recursive: true });
      writeFileSync9(abs, f.content, "utf8");
      logger.info(`runGenerateUtilities: wrote ${f.path}`);
    }
    return {
      mode: "improve",
      summary: parsed.summary || `Generated ${parsed.files.length} utility file(s).`,
      findings: [],
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
    };
  }
  /** AI-powered documentation generation. */
  async runGenerateDocs() {
    const files = await this.collectedFiles();
    const code = files.map((f) => `### ${f.path}
${f.content}`).join("\n\n").slice(0, 6e4);
    const prompt = this.prompts.render("generate-docs", {
      project_context: this.config.project_context || "(none)",
      code
    });
    const res = await this.ai.complete("fix", [
      { role: "system", content: "You generate JSDoc/TSDoc documentation for TypeScript functions." },
      { role: "user", content: prompt }
    ]);
    const parsed = extractJson(res.content);
    if (!parsed || !parsed.files?.length) {
      return {
        mode: "improve",
        summary: "No documentation generated. AI returned no valid output.",
        findings: [],
        score: null,
        comments: [],
        generatedTests: [],
        fixAttempts: [],
        metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
      };
    }
    const { writeFileSync: writeFileSync9 } = await import("node:fs");
    const { resolve: resolve10 } = await import("node:path");
    for (const f of parsed.files) {
      const abs = resolve10(this.root, f.path);
      writeFileSync9(abs, f.content, "utf8");
      logger.info(`runGenerateDocs: updated ${f.path}`);
    }
    return {
      mode: "improve",
      summary: parsed.summary || `Updated ${parsed.files.length} file(s) with documentation.`,
      findings: [],
      score: null,
      comments: [],
      generatedTests: [],
      fixAttempts: [],
      metrics: { filesAnalyzed: files.length, findingsBySeverity: {}, durationMs: 0 }
    };
  }
  // ---------------------------------------------------------------------------
  // Low-level AI calls (with JSON parsing).
  // ---------------------------------------------------------------------------
  async callAI(task, promptName, file) {
    const code = file.diff && file.diff.trim() ? file.diff : file.content;
    let projectContext = this.config.project_context || "(none)";
    if (this.mcp) {
      const libs = projectContext.split(/[,;\s]+/).filter(Boolean);
      const mcpCtx = libs.length ? await this.mcp.getLibraryDocs(libs) : [];
      if (mcpCtx.length) {
        projectContext += `

### MCP Library Context
${mcpCtx.map((e) => e.content).join("\n")}`;
      }
    }
    if (this.learning) {
      try {
        const ext = file.path.split(".").pop() ?? "";
        const lessons = await this.learning.getRelevantLessons(ext);
        if (lessons.length) {
          projectContext += `

### Historical Lessons (frequent past issues in ${ext} files)
- ${lessons.join("\n- ")}`;
        }
      } catch {
      }
    }
    if (this.learning && this.config.learning.metaReview) {
      try {
        const overrides = await this.learning.getActivePromptOverrides(task);
        if (overrides.length) {
          projectContext += `

### Custom Instructions
${overrides.join("\n")}`;
        }
      } catch {
      }
    }
    const prompt = this.prompts.render(promptName, {
      project_context: projectContext,
      language: file.path.split(".").pop() ?? "text",
      code,
      positive_feedback_instruction: this.config.include_positive_feedback ? "Also include up to 2 praise findings where the code is exemplary." : "Do not include positive/praise feedback.",
      output_format: this.config.jsonl_output ? "JSONL" : "JSON"
    });
    const preview = prompt.length > 300 ? prompt.slice(0, 300) + "..." : prompt;
    logger.info(`callAI: task=${task} prompt=${promptName} file=${file.path} prompt_preview=${JSON.stringify(preview)}`);
    const res = await this.ai.complete(task, [
      { role: "system", content: "You are an expert code reviewer." },
      { role: "user", content: prompt }
    ]);
    logger.info(`callAI response: provider=${res.provider} model=${res.model} tokens_in=${res.usage?.promptTokens} tokens_out=${res.usage?.completionTokens} content_len=${res.content.length}`);
    const parsedFindings = extractJson(res.content)?.findings ?? [];
    let finalFindings = parsedFindings;
    if (this.config.jsonl_output && !parsedFindings.length) {
      const jsonlResult = parseJsonlString(res.content);
      if (jsonlResult.length) {
        const normalized = validateAndNormalize(jsonlResult);
        finalFindings = normalized.issues.map((i) => ({
          file: i.file,
          line: i.line,
          severity: i.severity,
          message: i.message,
          category: i.category,
          suggestion: i.suggestion,
          source: "ai"
        }));
      }
    }
    if (this.learning && finalFindings.length) {
      try {
        for (const f of finalFindings) {
          await this.learning.recordFinding({
            file: file.path,
            line: f.line,
            severity: f.severity || "info",
            category: f.category || f.type || "unknown",
            message: f.message || f.comment || "",
            suggestion: f.suggestion,
            source: "ai"
          });
        }
      } catch {
      }
    }
    return { findings: finalFindings };
  }
  async callScoreAI(files) {
    const code = files.map((f) => `### ${f.path}
${f.content}`).join("\n\n").slice(0, 4e4);
    const prompt = this.prompts.render("score", {
      project_context: this.config.project_context || "(none)",
      language: files[0]?.path.split(".").pop() ?? "text",
      code
    });
    const res = await this.ai.complete("score", [
      { role: "system", content: "You score code quality objectively." },
      { role: "user", content: prompt }
    ]);
    return extractJson(res.content) ?? { readability: 50, maintainability: 50, security: 50, test_coverage: 50, rationale: "fallback" };
  }
  // ---------------------------------------------------------------------------
  // Reporting helpers.
  // ---------------------------------------------------------------------------
  buildSummary(mode, findings, fixAttempts, aiSummaries) {
    const counts = this.tallySeverity(findings);
    const strengths = findings.filter((f) => f.category === "praise");
    const issues = findings.filter((f) => f.category !== "praise");
    const criticalCount = counts["critical"] ?? 0;
    const highCount = counts["high"] ?? 0;
    const readyToMerge = criticalCount === 0 && highCount === 0;
    const parts = [];
    const narrative = aiSummaries?.filter(Boolean).join(" ") ?? "";
    if (narrative) {
      parts.push(narrative);
      parts.push("");
    }
    if (findings.length === 0) {
      parts.push("No issues found. The code looks clean.");
    } else {
      parts.push(`Found **${issues.length}** issue(s) and **${strengths.length}** positive observation(s).`);
      const severityParts = Object.entries(counts).filter(([k]) => k !== "praise").map(([k, v]) => `**${k}**: ${v}`);
      if (severityParts.length) {
        parts.push(`Severity breakdown: ${severityParts.join(", ")}.`);
      }
    }
    parts.push("");
    parts.push(`**Ready to merge?** ${readyToMerge}`);
    if (issues.length > 0) {
      const top = issues.slice(0, 3);
      const reasons = top.map(
        (i) => `${i.file}${i.line ? `:${i.line}` : ""} \u2014 ${i.comment}`
      );
      parts.push(`
**Reasoning:** ${reasons.join("; ")}`);
    }
    if (strengths.length > 0) {
      parts.push(`
### Strengths
`);
      for (const s of strengths) {
        parts.push(
          `- **${s.file}${s.line ? `:${s.line}` : ""}** \u2014 ${s.comment}`
        );
      }
    }
    if (issues.length > 0) {
      const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      const MAX_VISIBLE = 5;
      const sorted = [...issues].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
      );
      const visible = sorted.slice(0, MAX_VISIBLE);
      const hidden = sorted.length - MAX_VISIBLE;
      parts.push(`
### Issues (showing ${visible.length} of ${sorted.length})
`);
      for (const i of visible) {
        const label = i.severity === "critical" || i.severity === "high" ? `**[${i.severity.toUpperCase()}]** ` : "";
        parts.push(
          `- ${label}**${i.file}${i.line ? `:${i.line}` : ""}** \u2014 ${i.comment}${i.suggestion ? `
  > Suggestion: ${i.suggestion}` : ""}`
        );
      }
      if (hidden > 0) {
        parts.push(`
_\u2026 and ${hidden} more issues. Check the report file for the full list._`);
      }
    }
    if (fixAttempts && fixAttempts.length > 0) {
      const success = fixAttempts.filter((a) => a.fixed && a.verified).length;
      const MAX_ATTEMPTS = 10;
      const show = fixAttempts.slice(-MAX_ATTEMPTS);
      const hidden = fixAttempts.length - MAX_ATTEMPTS;
      parts.push(`
### Fix Attempts
`);
      parts.push(`Fixes applied & verified: **${success}/${fixAttempts.length}**`);
      for (const a of show) {
        parts.push(
          `- ${a.fixed ? "\u2705" : "\u274C"} **${a.file}** \u2014 ${a.explanation}`
        );
      }
      if (hidden > 0) {
        parts.push(`
_\u2026 and ${hidden} earlier attempts omitted._`);
      }
    }
    return parts.join("\n");
  }
  tallySeverity(findings) {
    const counts = {};
    for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    return counts;
  }
  finalizeReport(report) {
    report.metrics.findingsBySeverity = this.tallySeverity(report.findings);
  }
  writeReportFile(report) {
    ensureDir(resolve9(this.root, this.config.output.reportDir));
    const name = report.mode === "score" && report.score ? "score.json" : `codesentinel-${report.mode}.json`;
    const path = resolve9(this.root, this.config.output.reportDir, name);
    writeFileSync7(path, JSON.stringify(report, null, 2), "utf8");
    logger.info(`Wrote report: ${path}`);
    if (this.config.output.writeHtmlReport) {
      const htmlName = name.replace(".json", ".html");
      const htmlPath = resolve9(this.root, this.config.output.reportDir, htmlName);
      writeFileSync7(htmlPath, renderHtmlReport(report), "utf8");
      logger.info(`Wrote HTML report: ${htmlPath}`);
    }
  }
  // ---------------------------------------------------------------------------
  // Enhanced analysis features.
  // ---------------------------------------------------------------------------
  /**
   * Perform progressive analysis (quick scan → deep analysis).
   */
  async analyzeProgressive() {
    const files = await this.collectedFiles();
    const results = await this.analyzer.analyzeProgressive(files);
    const findings = results.flatMap((r) => r.findings);
    return { results, findings };
  }
  /**
   * Perform multi-file analysis with cross-file insights.
   */
  async analyzeMultiFile() {
    const files = await this.collectedFiles();
    return this.analyzer.analyzeMultiFile(files);
  }
  /**
   * Compare analysis results between two runs.
   */
  compareAnalyses(previousFindings, currentFindings) {
    return this.analyzer.compareAnalyses(previousFindings, currentFindings);
  }
  /**
   * Add a custom analysis rule.
   */
  addCustomRule(rule) {
    this.analyzer.addCustomRule(rule);
  }
  /**
   * Remove a custom analysis rule.
   */
  removeCustomRule(ruleId) {
    this.analyzer.removeCustomRule(ruleId);
  }
  /**
   * Update confidence thresholds for analysis.
   */
  updateConfidenceThresholds(thresholds) {
    this.analyzer.updateConfidenceThresholds(thresholds);
  }
  /**
   * Update severity adjustment configuration.
   */
  updateSeverityConfig(config) {
    this.analyzer.updateSeverityConfig(config);
  }
  /**
   * Get analyzer configuration.
   */
  getAnalyzerConfig() {
    return this.analyzer.getConfig();
  }
  /**
   * Get analysis cache statistics.
   */
  getAnalysisCacheStats() {
    return this.analyzer.getCacheStats();
  }
  /**
   * Clear analysis cache.
   */
  clearAnalysisCache() {
    this.analyzer.clearCache();
  }
};

// src/github/action.ts
async function runAction() {
  const get = (k) => process.env[`INPUT_${k.replace(/-/g, "_").toUpperCase()}`];
  const inputs = {
    mode: get("mode"),
    max_iterations: get("max_iterations"),
    enable_auto_fix: get("enable_auto_fix"),
    enable_scoring: get("enable_scoring"),
    enable_test_generation: get("enable_test_generation"),
    project_context: get("project_context"),
    test_runner: get("test_runner"),
    provider: get("provider"),
    auto_merge: get("auto_merge")
  };
  const configOverrides = configFromInputs(inputs);
  const secrets = {
    github_token: process.env.GITHUB_TOKEN,
    openai_api_key: process.env.OPENAI_API_KEY || get("openai_api_key"),
    anthropic_api_key: process.env.ANTHROPIC_API_KEY || get("anthropic_api_key"),
    gemini_api_key: process.env.GEMINI_API_KEY || get("gemini_api_key"),
    opencode_api_key: process.env.OPENCODE_API_KEY || get("opencode_api_key"),
    opencode_base_url: process.env.OPENCODE_BASE_URL || get("opencode_base_url")
  };
  const engine = Engine.fromInputs({
    configPath: get("config_path") || void 0,
    overrides: { ...configOverrides, enable_auto_fix: configOverrides.enable_auto_fix ?? false },
    secrets
  });
  const report = await engine.run();
  const autoMerge = configOverrides.autoMerge ?? false;
  await publishOutputs(report, secrets, autoMerge);
}
async function publishOutputs(report, secrets, autoMerge = false) {
  const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const pullNumber = process.env.GITHUB_PR_NUMBER ? Number(process.env.GITHUB_PR_NUMBER) : void 0;
  const headSha = process.env.GITHUB_SHA;
  if (secrets.github_token && owner && repo) {
    const reporter = new GitHubReporter({ token: secrets.github_token, owner, repo, pullNumber });
    for (const c of report.comments) {
      await reporter.postReviewComment({
        body: c.body,
        file: c.file,
        line: c.line
      });
    }
    if (report.mode === "audit") {
      for (const f of report.findings) {
        await reporter.createIssue(
          `[${f.severity}] ${f.file}`,
          f.comment
        );
      }
    }
    if (report.mode === "gate" && headSha) {
      const annotations = report.findings.slice(0, 50).map((f) => ({
        path: f.file,
        start_line: f.line ?? 1,
        end_line: f.line ?? 1,
        annotation_level: f.severity === "critical" || f.severity === "high" ? "failure" : "warning",
        message: f.comment
      }));
      await reporter.createCheckRun({
        name: "CodeSentinel Gate",
        headSha,
        status: "completed",
        conclusion: report.gatePassed ? "success" : "failure",
        output: {
          title: report.gatePassed ? "Quality Gate Passed" : "Quality Gate Failed",
          summary: report.summary,
          annotations
        }
      });
      await reporter.setCommitStatus({
        sha: headSha,
        state: report.gatePassed ? "success" : "failure",
        description: report.gatePassed ? "All gate checks passed" : "Gate checks failed",
        context: "codesentinel/gate"
      });
      if (report.gatePassed && autoMerge && pullNumber) {
        await reporter.enableAutoMerge(pullNumber, "squash");
        logger.info(`publishOutputs: enabled auto-merge on PR #${pullNumber}`);
      }
    }
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    writeFileSync8(summaryPath, renderSummary(report), "utf8");
  }
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const { appendFileSync } = await import("node:fs");
    const score = report.score?.overall ?? "n/a";
    const findings = String(report.findings.length);
    appendFileSync(outputPath, `score=${score}
`);
    appendFileSync(outputPath, `findings=${findings}
`);
  }
}
function renderSummary(report) {
  const lines = [`# CodeSentinel \u2014 ${report.mode}`, "", report.summary, ""];
  if (report.score) {
    lines.push(
      `**Score:** ${report.score.overall}/100 (readability ${report.score.readability}, maintainability ${report.score.maintainability}, security ${report.score.security}, coverage ${report.score.test_coverage})`
    );
  }
  if (report.gatePassed !== void 0) {
    lines.push(`**Gate:** ${report.gatePassed ? "PASSED" : "FAILED"}`);
  }
  return lines.join("\n");
}
runAction().catch((err) => {
  logger.error("Action failed:", err);
  process.exit(1);
});
export {
  runAction
};
