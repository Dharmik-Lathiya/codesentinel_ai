export async function connectDb(url) {
    if (url?.startsWith("postgres://") || url?.startsWith("postgresql://")) {
        let pg;
        try {
            pg = (await import("pg")).default;
        }
        catch {
            throw new Error("pg is not installed. Run: npm install pg");
        }
        const pool = new pg.Pool({ connectionString: url });
        return {
            run: (sql, params) => pool.query(sql, params).then(() => { }),
            get: (sql, params) => pool.query(sql, params).then((r) => r.rows[0]),
            all: (sql, params) => pool.query(sql, params).then((r) => r.rows),
            close: () => pool.end(),
        };
    }
    if (url?.startsWith("mysql://")) {
        try {
            const mod = await Function('return import("mysql2/promise")')();
            const conn = await mod.createConnection(url);
            const getMysql = async (sql, params) => {
                const [rows] = await conn.execute(sql, params);
                return rows[0];
            };
            const allMysql = async (sql, params) => {
                const [rows] = await conn.execute(sql, params);
                return rows;
            };
            return {
                run: (sql, params) => conn.execute(sql, params).then(() => { }),
                get: getMysql,
                all: allMysql,
                close: () => conn.end(),
            };
        }
        catch {
            throw new Error("mysql2 is not installed. Run: npm install mysql2");
        }
    }
    let BetterSqlite3;
    try {
        BetterSqlite3 = (await import("better-sqlite3")).default;
    }
    catch {
        throw new Error("better-sqlite3 is not installed. Run: npm install better-sqlite3");
    }
    const db = new BetterSqlite3(url ?? ":memory:");
    db.pragma("journal_mode = WAL");
    const closeDb = () => { db.close(); };
    return {
        run: (sql, params) => { db.prepare(sql).run(...(params ?? [])); return Promise.resolve(); },
        get: (sql, params) => Promise.resolve(db.prepare(sql).get(...(params ?? []))),
        all: (sql, params) => Promise.resolve(db.prepare(sql).all(...(params ?? []))),
        close: () => { closeDb(); return Promise.resolve(); },
    };
}
//# sourceMappingURL=db.js.map