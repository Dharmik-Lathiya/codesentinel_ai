export interface DbAdapter {
  run(sql: string, params?: any[]): Promise<void>;
  get<T>(sql: string, params?: any[]): Promise<T | undefined>;
  all<T>(sql: string, params?: any[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function connectDb(url?: string): Promise<DbAdapter> {
  if (url?.startsWith("postgres://") || url?.startsWith("postgresql://")) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url });
    return {
      run: (sql, params) => pool.query(sql, params).then(() => {}),
      get: (sql, params) => pool.query(sql, params).then((r) => r.rows[0]),
      all: (sql, params) => pool.query(sql, params).then((r) => r.rows),
      close: () => pool.end(),
    };
  }
  if (url?.startsWith("mysql://")) {
    try {
      const mod = await Function('return import("mysql2/promise")')() as any;
      const conn = await mod.createConnection(url);
      return {
        run: (sql: string, params?: any[]) => conn.execute(sql, params).then(() => {}),
        get: async (sql: string, params?: any[]) => {
          const [rows] = await conn.execute(sql, params);
          return (rows as any[])[0];
        },
        all: async (sql: string, params?: any[]) => {
          const [rows] = await conn.execute(sql, params);
          return rows as any[];
        },
        close: () => conn.end(),
      };
    } catch {
      throw new Error("mysql2 is not installed. Run: npm install mysql2");
    }
  }
  const { default: BetterSqlite3 } = await import("better-sqlite3");
  const db = new BetterSqlite3(url ?? ":memory:");
  db.pragma("journal_mode = WAL");
  const closeDb = (): void => { db.close(); };
  return {
    run: (sql, params) => { db.prepare(sql).run(...(params ?? [])); return Promise.resolve(); },
    get: (sql, params) => Promise.resolve(db.prepare(sql).get(...(params ?? [])) as any),
    all: (sql, params) => Promise.resolve(db.prepare(sql).all(...(params ?? [])) as any[]),
    close: () => { closeDb(); return Promise.resolve(); },
  };
}
