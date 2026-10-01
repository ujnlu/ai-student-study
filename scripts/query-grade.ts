import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as mariadb from "mariadb";

const url = process.env.DATABASE_URL!.replace(/^mysql:/, "mariadb:");
const pool = mariadb.createPool(url);
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(pool) });

async function main() {
  const children = await prisma.child.findMany({ select: { id: true, name: true, grade: true, kind: true } });
  console.log(JSON.stringify(children, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
