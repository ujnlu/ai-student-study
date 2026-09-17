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

  // WAL + busy_timeout：减少锁竞争和 IO 错误概率
  try {
    const raw = new Database(abs);
    raw.pragma("journal_mode = WAL");
    raw.pragma("busy_timeout = 10000");       // 写锁等待 10s（原 timeout:5000 仅作用于连接级）
    raw.pragma("synchronous = NORMAL");       // WAL 模式下 NORMAL 足够安全，减少 fsync 次数
    raw.pragma("cache_size = -64000");        // 64MB 缓存，减少磁盘读取
    raw.close();
  } catch {}

  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: abs, timeout: 10000 }),
  });
}

/**
 * 判断是否为 SQLite IO 错误或 BUSY 错误
 */
function isSqliteRetryable(e: unknown) {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  const msg = err.message ?? "";
  // P2039 = driver adapter error; SQLITE_BUSY = 写锁超时
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
            if (!isSqliteRetryable(e) || url.startsWith("postgres")) throw e;

            if (attempt < MAX_RETRIES) {
              const delay = BASE_DELAY_MS * Math.pow(2, attempt);
              console.warn(
                `[db] SQLite error on ${model ?? ""}.${operation} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retry in ${delay}ms`
              );
              await new Promise((r) => setTimeout(r, delay));

              // IO 错误时重建连接（BUSY 错误不需要重建，等退避后重试即可）
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

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

type Extended = ReturnType<typeof withReconnect>;
let current: Extended = withReconnect(base);

// Proxy 转发，重连后所有调用方自动用到新连接
const g = globalThis as unknown as { __prisma?: Extended };
export const db: Extended = g.__prisma ?? (new Proxy({} as Extended, {
  get(_t, p) {
    if (current !== undefined && (current as unknown as { $__base?: Base }).$__base !== base)
      current = withReconnect(base);
    return (current as unknown as Record<string | symbol, unknown>)[p];
  },
}) as Extended);

if (process.env.NODE_ENV !== "production") g.__prisma = db;
