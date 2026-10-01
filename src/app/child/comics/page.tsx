import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";

export const runtime = "nodejs";
export const metadata = { title: "漫画绘本 · 卡通书屋" };

export default async function ComicsPage() {
  const { child } = await requireChild();
  const books = await db.comicBook.findMany({
    where: {
      status: "ready",
      gradeMin: { lte: child.grade },
      gradeMax: { gte: child.grade },
    },
    orderBy: { title: "asc" },
  });

  return (
    <main className="min-h-screen bg-brand-soft/30 pb-24">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-line px-4 py-3 flex items-center gap-3">
        <Link href="/child" className="text-xl">←</Link>
        <h1 className="text-xl font-black">📚 漫画绘本</h1>
        <span className="ml-auto text-xs font-bold text-muted">{books.length} 本</span>
      </header>

      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted">
          <span className="text-5xl mb-4">📭</span>
          <p className="font-bold">暂无适合你年级的漫画</p>
          <p className="text-sm mt-1">试试切换年级或联系爸爸妈妈添加</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-4">
          {books.map((b) => (
            <Link
              key={b.id}
              href={`/child/comics/${b.slug}`}
              className="group flex flex-col rounded-2xl overflow-hidden bg-white border-2 border-line hover:border-sky hover:-translate-y-1 transition-all"
            >
              <div className="aspect-[3/4] bg-gray-100 relative overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${b.coverPath ?? ""}`}
                  alt={b.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
                {b.lang === "en" && (
                  <span className="absolute top-1 right-1 bg-sky text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">EN</span>
                )}
              </div>
              <div className="p-2 flex-1 flex flex-col">
                <p className="text-xs font-black leading-tight line-clamp-2 flex-1">{b.title}</p>
                <p className="text-[10px] text-muted mt-1">{b.pageCount} 页</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
