import Database from "better-sqlite3";
import mysql from "mysql2/promise";

const SQLITE_PATH = process.env.SQLITE_PATH || "/opt/ai-student-study/data/dev.db";
const MYSQL_URL = process.env.DATABASE_URL || "mysql://ai_study:AiStudy2026_Secure@localhost:3306/ai_study";
const BATCH_SIZE = 500;

// Tables in dependency order (parents before children)
const TABLES = [
  "Family", "Subject", "AiProvider", "AiAssistant", "AiPromptVersion",
  "Child", "FamilySetting", "TextbookVersion", "ChildTextbook",
  "KnowledgePoint", "KnowledgePrereq", "Textbook", "TextbookChapter", "TextbookPage",
  "TopicLecture", "SpeakingLesson", "LessonGuide", "ReadingPiece", "ReciteText",
  "Paper", "Problem", "Explanation", "PracticeSet", "PracticeItem",
  "Attempt", "Mastery", "ChildProgress", "StarEvent", "Reward", "Redemption",
  "WordList", "Upload", "Message", "Conversation", "AiUsage",
  "MistakeEntry", "StudySession", "Recitation",
];

function escapeId(name: string) { return `\`${name}\``; }

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const conn = await mysql.createConnection(MYSQL_URL);

  const sqliteTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%'").all() as {name:string}[];
  const existingTables = new Set(sqliteTables.map(t => t.name));

  for (const table of TABLES) {
    if (!existingTables.has(table)) {
      console.log(`⏭️  ${table}: not in SQLite, skip`);
      continue;
    }
    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
    if (rows.length === 0) {
      console.log(`⏭️  ${table}: 0 rows`);
      continue;
    }

    // Get column info for boolean conversion
    const cols = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as {name:string,type:string}[];
    const boolCols = new Set(cols.filter(c => c.type === "BOOLEAN").map(c => c.name));
    const colNames = cols.map(c => c.name);

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      // Build multi-row INSERT IGNORE
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
      const sql = `INSERT IGNORE INTO ${escapeId(table)} (${escapedCols}) VALUES ${placeholders}`;
      await conn.execute(sql, values);
      inserted += batch.length;
    }
    console.log(`✅ ${table}: ${inserted}/${rows.length} rows`);
  }

  sqlite.close();
  await conn.end();
  console.log("\n🎉 Migration complete!");
}

main().catch(e => { console.error(e); process.exit(1); });
