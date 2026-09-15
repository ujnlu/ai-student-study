import path from "node:path";
import fs from "node:fs";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL ?? "file:./data/dev.db";

function makeClient() {
  if (url.startsWith("postgres")) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }
  const file = url.replace(/^file:/, "");
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: abs }) });
}

const g = globalThis as unknown as { __prisma?: ReturnType<typeof makeClient> };
export const db = g.__prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") g.__prisma = db;
