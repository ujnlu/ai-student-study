import path from "node:path";
import fs from "node:fs";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import Database from "better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./data/dev.db";

function makeClient() {
  if (url.startsWith("postgres")) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }
  const file = url.replace(/^file:/, "");
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  // WAL 模式写入不阻塞读取（孩子端、家长端、AI 后台任务并发时不再互相等锁）；journal_mode 会持久保存在库文件里
  try {
    const raw = new Database(abs);
    raw.pragma("journal_mode = WAL");
    raw.close();
  } catch {}
  // timeout：遇到写锁最多等 5 秒，而不是立刻报 SQLITE_BUSY
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: abs, timeout: 5000 }) });
}

const g = globalThis as unknown as { __prisma?: ReturnType<typeof makeClient> };
export const db = g.__prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") g.__prisma = db;
