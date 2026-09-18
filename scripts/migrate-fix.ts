import Database from "better-sqlite3";
import mysql from "mysql2/promise";

const SQLITE_PATH = "/opt/ai-student-study/data/dev.db";
const MYSQL_URL = "mysql://ai_study:AiStudy2026_Secure@localhost:3306/ai_study";
const BATCH_SIZE = 500;

// Only re-migrate tables with discrepancies
const TABLES = ["KnowledgePoint", "Problem", "PracticeItem", "MistakeEntry", "Attempt", "Explanation", "Conversation", "Message"];

function escapeId(name: string) { return `\`${name}\``; }

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const conn = await mysql.createConnection(MYSQL_URL);

  // Disable FK checks for bulk insert
  await conn.execute("SET FOREIGN_KEY_CHECKS=0");
  await conn.execute("SET UNIQUE_CHECKS=0");
  await conn.execute("SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO'");

  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
    if (rows.length === 0) { console.log(`⏭️ ${table}: 0 rows`); continue; }

    // Truncate first
    await conn.execute(`DELETE FROM ${escapeId(table)}`);

    const cols = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as {name:string,type:string}[];
    const boolCols = new Set(cols.filter(c => c.type === "BOOLEAN").map(c => c.name));
    const colNames = cols.map(c => c.name);

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const escapedCols = colNames.map(escapeId).join(",");
      const placeholders = batch.map(() => `(${colNames.map(() => "?").join(",")})`).join(",");
      const values: unknown[] = [];
      for (const row of batch) {
        for (const col of colNames) {
          let v = row[col];
          if (boolCols.has(col) && v !== null && v !== undefined) v = Boolean(v);
          values.push(v ?? null);
        }
      }
      const sql = `INSERT INTO ${escapeId(table)} (${escapedCols}) VALUES ${placeholders}`;
      await conn.execute(sql, values);
      inserted += batch.length;
    }
    console.log(`✅ ${table}: ${inserted}/${rows.length} rows`);
  }

  await conn.execute("SET FOREIGN_KEY_CHECKS=1");
  await conn.execute("SET UNIQUE_CHECKS=1");
  sqlite.close();
  await conn.end();
  console.log("\n🎉 Fix complete!");
}

main().catch(e => { console.error(e); process.exit(1); });
