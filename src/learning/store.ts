import { connectDb, type DbAdapter } from "./db.js";
import { SCHEMA_SQL, generateId } from "./schema.js";
import { logger } from "../utils/logger.js";

const DEFAULT_FINDINGS_LIMIT = 100;
const MAX_RELEVANT_LESSONS = 10;

export interface FindingRecord {
  id: string;
  file: string;
  line: number | null;
  severity: string;
  category: string;
  message: string;
  suggestion: string | null;
  source: string;
  created_at: string;
}

export interface PatternRecord {
  id: string;
  pattern_text: string;
  category: string;
  frequency: number;
  auto_rule_id: string | null;
}

export interface CustomRuleRecord {
  id: string;
  name: string;
  pattern: string;
  severity: string;
  category: string;
  comment: string | null;
  suggestion: string | null;
  status: string;
}

export class LearningStore {
  private db: DbAdapter | null = null;
  private dbPath: string;
  private ready = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? ".codesentinel/learning.db";
  }

  async init(): Promise<void> {
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

  async recordFinding(finding: {
    file: string;
    line?: number | null;
    severity: string;
    category: string;
    message: string;
    suggestion?: string | null;
    source?: string;
  }): Promise<string> {
    if (!this.ready) return "";
    try {
      const id = generateId();
      await this.db!.run(
        `INSERT INTO findings (id, file, line, severity, category, message, suggestion, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, finding.file, finding.line ?? null, finding.severity, finding.category, finding.message, finding.suggestion ?? null, finding.source ?? "ai"],
      );
      return id;
    } catch (err) {
      logger.warn(`recordFinding failed: ${err}`);
      return "";
    }
  }

  async getFindings(limit = DEFAULT_FINDINGS_LIMIT): Promise<FindingRecord[]> {
    if (!this.ready) return [];
    try {
      return this.db!.all("SELECT * FROM findings ORDER BY created_at DESC LIMIT ?", [limit]);
    } catch (err) {
      logger.warn(`getFindings failed: ${err}`);
      return [];
    }
  }

  async recordFeedback(findingId: string, feedbackType: string, comment?: string): Promise<void> {
    if (!this.ready) return;
    try {
      await this.db!.run(
        "INSERT INTO feedback (id, finding_id, feedback_type, comment) VALUES (?, ?, ?, ?)",
        [generateId(), findingId, feedbackType, comment ?? null],
      );
    } catch (err) {
      logger.warn(`recordFeedback failed: ${err}`);
    }
  }

  async getRelevantLessons(fileExtension: string): Promise<string[]> {
    if (!this.ready) return [];
    try {
      const rows = await this.db!.all<{ message: string; frequency: number }>(
        `SELECT f.message, COUNT(*) as frequency
         FROM findings f
         WHERE f.file LIKE ?
         GROUP BY f.message
         ORDER BY frequency DESC
         LIMIT ?`,
        [`%.${fileExtension}`, MAX_RELEVANT_LESSONS],
      );
      return rows.map((r) => r.message);
    } catch (err) {
      logger.warn(`getRelevantLessons failed: ${err}`);
      return [];
    }
  }

  async recordPattern(patternText: string, category: string): Promise<void> {
    if (!this.ready) return;
    try {
      const existing = await this.db!.get<PatternRecord>(
        "SELECT * FROM patterns WHERE pattern_text = ?",
        [patternText],
      );
      if (existing) {
        await this.db!.run("UPDATE patterns SET frequency = frequency + 1, updated_at = datetime('now') WHERE id = ?", [existing.id]);
      } else {
        await this.db!.run(
          "INSERT INTO patterns (id, pattern_text, category) VALUES (?, ?, ?)",
          [generateId(), patternText, category],
        );
      }
    } catch (err) {
      logger.warn(`recordPattern failed: ${err}`);
    }
  }

  async getPendingRules(): Promise<CustomRuleRecord[]> {
    if (!this.ready) return [];
    try {
      return this.db!.all("SELECT * FROM custom_rules WHERE status = 'pending' ORDER BY created_at DESC");
    } catch (err) {
      logger.warn(`getPendingRules failed: ${err}`);
      return [];
    }
  }

  async approveRule(ruleId: string): Promise<void> {
    if (!this.ready) return;
    try {
      await this.db!.run("UPDATE custom_rules SET status = 'approved' WHERE id = ?", [ruleId]);
    } catch (err) {
      logger.warn(`approveRule failed: ${err}`);
    }
  }

  async declineRule(ruleId: string): Promise<void> {
    if (!this.ready) return;
    try {
      await this.db!.run("UPDATE custom_rules SET status = 'declined' WHERE id = ?", [ruleId]);
    } catch (err) {
      logger.warn(`declineRule failed: ${err}`);
    }
  }

  async getFalsePositiveRate(): Promise<number> {
    if (!this.ready) return 0;
    try {
      const total = await this.db!.get<{ count: number }>("SELECT COUNT(*) as count FROM feedback");
      const fp = await this.db!.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM feedback WHERE feedback_type = 'false_positive'",
      );
      if (!total || total.count === 0) return 0;
      return (fp?.count ?? 0) / total.count;
    } catch (err) {
      logger.warn(`getFalsePositiveRate failed: ${err}`);
      return 0;
    }
  }

  /** Get rules with high false-positive rate (>= threshold) and minimum feedback count. */
  async getHighFalsePositiveRules(minFeedback = 3, fpThreshold = 0.8): Promise<{ ruleId: string; fpRate: number; total: number }[]> {
    if (!this.ready) return [];
    try {
      const rows = await this.db!.all<{ finding_id: string; total: number; fp_count: number }>(
        `SELECT finding_id, COUNT(*) as total, SUM(CASE WHEN feedback_type = 'false_positive' THEN 1 ELSE 0 END) as fp_count
         FROM feedback GROUP BY finding_id HAVING total >= ? AND (CAST(SUM(CASE WHEN feedback_type = 'false_positive' THEN 1 ELSE 0 END) AS REAL) / COUNT(*)) >= ?`,
        [minFeedback, fpThreshold],
      );
      return rows.map((r) => ({ ruleId: r.finding_id, fpRate: r.fp_count / r.total, total: r.total }));
    } catch (err) {
      logger.warn(`getHighFalsePositiveRules failed: ${err}`);
      return [];
    }
  }

  async getActivePromptOverrides(taskType: string): Promise<string[]> {
    if (!this.ready) return [];
    try {
      const rows = await this.db!.all<{ override_text: string }>(
        "SELECT override_text FROM prompt_overrides WHERE task_type = ? AND active = 1 ORDER BY created_at DESC",
        [taskType],
      );
      return rows.map((r) => r.override_text);
    } catch (err) {
      logger.warn(`getActivePromptOverrides failed: ${err}`);
      return [];
    }
  }

  async createPromptOverride(taskType: string, overrideText: string, reason?: string): Promise<void> {
    if (!this.ready) return;
    try {
      await this.db!.run(
        "INSERT INTO prompt_overrides (id, task_type, override_text, reason) VALUES (?, ?, ?, ?)",
        [generateId(), taskType, overrideText, reason ?? null],
      );
    } catch (err) {
      logger.warn(`createPromptOverride failed: ${err}`);
    }
  }

  async autoCreateRule(patternId: string, name: string, pattern: string, severity: string, category: string, comment?: string, suggestion?: string): Promise<string | null> {
    if (!this.ready) return null;
    try {
      const existing = await this.db!.get<CustomRuleRecord>(
        "SELECT * FROM custom_rules WHERE pattern = ? AND status IN ('pending', 'approved')",
        [pattern],
      );
      if (existing) return null;
      const id = generateId();
      await this.db!.run(
        "INSERT INTO custom_rules (id, name, pattern, severity, category, comment, suggestion) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, name, pattern, severity, category, comment ?? null, suggestion ?? null],
      );
      await this.db!.run("UPDATE patterns SET auto_rule_id = ? WHERE id = ?", [id, patternId]);
      return id;
    } catch (err) {
      logger.warn(`autoCreateRule failed: ${err}`);
      return null;
    }
  }

  async getPatternsAboveThreshold(minFrequency: number): Promise<PatternRecord[]> {
    if (!this.ready) return [];
    try {
      return this.db!.all(
        "SELECT * FROM patterns WHERE frequency >= ? AND auto_rule_id IS NULL ORDER BY frequency DESC",
        [minFrequency],
      );
    } catch (err) {
      logger.warn(`getPatternsAboveThreshold failed: ${err}`);
      return [];
    }
  }

  async close(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.close();
    } catch (err) {
      logger.warn(`close failed: ${err}`);
    }
  }
}
