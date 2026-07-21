import { connectDb, type DbAdapter } from "./db.js";
import { SCHEMA_SQL, generateId } from "./schema.js";
import { logger } from "../utils/logger.js";

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
    const id = generateId();
    await this.db!.run(
      `INSERT INTO findings (id, file, line, severity, category, message, suggestion, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, finding.file, finding.line ?? null, finding.severity, finding.category, finding.message, finding.suggestion ?? null, finding.source ?? "ai"],
    );
    return id;
  }

  async getFindings(limit = 100): Promise<FindingRecord[]> {
    if (!this.ready) return [];
    return this.db!.all("SELECT * FROM findings ORDER BY created_at DESC LIMIT ?", [limit]);
  }

  async recordFeedback(findingId: string, feedbackType: string, comment?: string): Promise<void> {
    if (!this.ready) return;
    await this.db!.run(
      "INSERT INTO feedback (id, finding_id, feedback_type, comment) VALUES (?, ?, ?, ?)",
      [generateId(), findingId, feedbackType, comment ?? null],
    );
  }

  async getRelevantLessons(fileExtension: string): Promise<string[]> {
    if (!this.ready) return [];
    const rows = await this.db!.all<{ message: string; frequency: number }>(
      `SELECT f.message, COUNT(*) as frequency
       FROM findings f
       WHERE f.file LIKE ?
       GROUP BY f.message
       ORDER BY frequency DESC
       LIMIT 10`,
      [`%.${fileExtension}`],
    );
    return rows.map((r) => r.message);
  }

  async recordPattern(patternText: string, category: string): Promise<void> {
    if (!this.ready) return;
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
  }

  async getPendingRules(): Promise<CustomRuleRecord[]> {
    if (!this.ready) return [];
    return this.db!.all("SELECT * FROM custom_rules WHERE status = 'pending' ORDER BY created_at DESC");
  }

  async approveRule(ruleId: string): Promise<void> {
    if (!this.ready) return;
    await this.db!.run("UPDATE custom_rules SET status = 'approved' WHERE id = ?", [ruleId]);
  }

  async declineRule(ruleId: string): Promise<void> {
    if (!this.ready) return;
    await this.db!.run("UPDATE custom_rules SET status = 'declined' WHERE id = ?", [ruleId]);
  }

  async getFalsePositiveRate(): Promise<number> {
    if (!this.ready) return 0;
    const total = await this.db!.get<{ count: number }>("SELECT COUNT(*) as count FROM feedback");
    const fp = await this.db!.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM feedback WHERE feedback_type = 'false_positive'",
    );
    if (!total || total.count === 0) return 0;
    return (fp?.count ?? 0) / total.count;
  }

  async close(): Promise<void> {
    if (this.db) await this.db.close();
  }
}
