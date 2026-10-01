import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") || undefined;
  const grade = searchParams.get("grade");

  const where: any = { status: "ready" };
  if (lang) where.lang = lang;
  if (grade) {
    const g = parseInt(grade);
    where.gradeMin = { lte: g };
    where.gradeMax = { gte: g };
  }

  const books = await db.comicBook.findMany({
    where,
    select: {
      id: true,
      title: true,
      slug: true,
      coverPath: true,
      description: true,
      attribution: true,
      lang: true,
      gradeMin: true,
      gradeMax: true,
      pageCount: true,
    },
    orderBy: { title: "asc" },
  });

  return NextResponse.json(books);
}
