export interface DbAdapter {
  run(sql: string, params?: any[]): Promise<void>;
  get<T>(sql: string, params?: any[]): Promise<T | undefined>;
  all<T>(sql: string, params?: any[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function connectDb(url?: string): Promise<DbAdapter> {
  if (url?.startsWith("postgres://") || url?.startsWith("postgresql://")) {
    let pg: any;
    try {
      pg = (await import("pg")).default;
    } catch {
      throw new Error("pg is not installed. Run: npm install pg");
    }
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
      async function mysqlGet(sql: string, params?: any[]) {
        const [rows] = await conn.execute(sql, params);
        return (rows as any[])[0];
      }
      async function mysqlAll(sql: string, params?: any[]) {
        const [rows] = await conn.execute(sql, params);
        return rows as any[];
      }
      return {
        run: (sql: string, params?: any[]) => conn.execute(sql, params).then(() => {}),
        get: (sql: string, params?: any[]) => mysqlGet(sql, params),
        all: (sql: string, params?: any[]) => mysqlAll(sql, params),
        close: () => conn.end(),
      };
    } catch {
      throw new Error("mysql2 is not installed. Run: npm install mysql2");
    }
  }
  let BetterSqlite3: any;
  try {
    BetterSqlite3 = (await import("better-sqlite3")).default;
  } catch {
    throw new Error("better-sqlite3 is not installed. Run: npm install better-sqlite3");
  }
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
