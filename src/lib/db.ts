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

/**
 * SQLite 文件被别的进程整体替换（部署 --db）或被大批量导入脚本重写 WAL 时，
 * 站点里这条长连接会一直报 SQLITE_IOERR_SHORT_READ（disk I/O error）直到重启。
 * 这里遇到该错误就丢弃旧连接、新建一条并把这次查询重放一遍，不用人工 pm2 restart。
 */
function isSqliteIoError(e: unknown) {
  const err = e as { code?: string; message?: string } | null;
  return !!err && err.code === "P2039" && /disk I\/O error|SHORT_READ|IOERR|disk image is malformed|SQLITE_CORRUPT/i.test(err.message ?? "");
}

type Base = ReturnType<typeof makeClient>;
let base: Base = makeClient();

function withReconnect(c: Base) {
  return c.$extends({
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        try {
          return await query(args);
        } catch (e) {
          if (!isSqliteIoError(e) || url.startsWith("postgres")) throw e;
          console.warn(`[db] SQLite I/O error on ${model ?? ""}.${operation}，重新连接后重试一次`);
          const old = base;
          base = makeClient();
          void old.$disconnect().catch(() => {});
          const fresh = base as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>;
          if (model && fresh[lowerFirst(model)]?.[operation]) return fresh[lowerFirst(model)][operation](args);
          throw e;
        }
      },
    },
  });
}
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

type Extended = ReturnType<typeof withReconnect>;
let current: Extended = withReconnect(base);

// 通过 Proxy 转发，重连后所有调用方自动用到新连接
const g = globalThis as unknown as { __prisma?: Extended };
export const db: Extended = g.__prisma ?? (new Proxy({} as Extended, {
  get(_t, p) {
    if (current !== undefined && (current as unknown as { $__base?: Base }).$__base !== base) current = withReconnect(base);
    return (current as unknown as Record<string | symbol, unknown>)[p];
  },
}) as Extended);
if (process.env.NODE_ENV !== "production") g.__prisma = db;
