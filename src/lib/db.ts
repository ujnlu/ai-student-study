import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as mariadb from "mariadb";
import Database from "better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./data/dev.db";
const isBuild = process.env.NEXT_PHASE === "phase-production-build" || process.env.CI === "true";

function makeClient() {
  // 构建阶段不连接真实数据库，返回默认 PrismaClient（不会实际查询）
  if (isBuild) {
    // 构建时使用无连接的 PrismaClient，仅用于类型满足
    return new PrismaClient({ adapter: new PrismaMariaDb(mariadb.createPool("mariadb://localhost/dummy")) });
  }

  if (url.startsWith("mysql://") || url.startsWith("mariadb://")) {
    // mariadb 库要求协议头必须是 mariadb://
    const mariaUrl = url.replace(/^mysql:/, "mariadb:");
    const pool = mariadb.createPool(mariaUrl);
    return new PrismaClient({ adapter: new PrismaMariaDb(pool) });
  }

  if (url.startsWith("postgres")) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }

  // SQLite fallback
  const file = url.replace(/^file:/, "");
  const abs = path.isAbsolute(file) ? file : path.join(/*turbopackIgnore: true*/ process.cwd(), file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  try {
    const raw = new Database(abs);
    raw.pragma("journal_mode = WAL");
    raw.pragma("busy_timeout = 10000");
    raw.pragma("synchronous = NORMAL");
    raw.pragma("cache_size = -64000");
    raw.close();
  } catch {}
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: abs, timeout: 10000 }),
  });
}

function isSqliteRetryable(e: unknown) {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  const msg = err.message ?? "";
  if (err.code === "P2039" && /disk I\/O error|SHORT_READ|IOERR|disk image is malformed|SQLITE_CORRUPT/i.test(msg)) return true;
  if (/SQLITE_BUSY|database is locked/i.test(msg)) return true;
  return false;
}

type Base = ReturnType<typeof makeClient>;
let base: Base = makeClient();
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;

function withReconnect(c: Base) {
  return c.$extends({
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        let lastErr: unknown;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            return await query(args);
          } catch (e) {
            lastErr = e;
            if (!isSqliteRetryable(e) || !url.startsWith("file:")) throw e;
            if (attempt < MAX_RETRIES) {
              const delay = BASE_DELAY_MS * Math.pow(2, attempt);
              console.warn(
                `[db] SQLite error on ${model ?? ""}.${operation} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retry in ${delay}ms`
              );
              await new Promise((r) => setTimeout(r, delay));
              const msg = (e as { message?: string }).message ?? "";
              if (/disk I\/O error|SHORT_READ|IOERR|CORRUPT/i.test(msg)) {
                const old = base;
                base = makeClient();
                void old.$disconnect().catch(() => {});
              }
            }
          }
        }
        throw lastErr;
      },
    },
  });
}

let current = withReconnect(base);
const g = globalThis as unknown as { __prisma?: typeof current };
export const db = g.__prisma ?? (new Proxy({} as typeof current, {
  get(_t, p) {
    if (current !== undefined && (current as unknown as { $__base?: Base }).$__base !== base)
      current = withReconnect(base);
    return (current as unknown as Record<string | symbol, unknown>)[p];
  },
}) as typeof current);

if (process.env.NODE_ENV !== "production") g.__prisma = db;
