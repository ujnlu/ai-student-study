import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const book = await db.comicBook.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      pages: { orderBy: { pageNo: "asc" } },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(book);
}
