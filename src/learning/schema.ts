export const SCHEMA_SQL = `
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

export function generateId(): string {
  return `cs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
