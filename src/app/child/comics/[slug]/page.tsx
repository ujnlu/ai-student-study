import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";

export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await db.comicBook.findFirst({ where: { OR: [{ slug }, { id: slug }] } });
  return { title: book ? `${book.title} · 漫画绘本` : "漫画阅读" };
}

export default async function ComicReaderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireChild();

  const book = await db.comicBook.findFirst({
    where: { OR: [{ slug }, { id: slug }], status: "ready" },
    include: { pages: { orderBy: { pageNo: "asc" } } },
  });

  if (!book) notFound();

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 bg-gray-900/95 backdrop-blur border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <Link href="/child/comics" className="text-xl hover:text-sky transition-colors">←</Link>
        <h1 className="text-sm font-bold truncate flex-1">{book.title}</h1>
        <span className="text-xs text-gray-400">{book.pageCount} 页</span>
      </header>

      {/* 图片流式阅读 */}
      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-2 max-w-2xl mx-auto w-full">
        {book.pages.map((p) => (
          <div key={p.id} className="relative rounded-lg overflow-hidden bg-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${p.imagePath}`}
              alt={`第 ${p.pageNo} 页`}
              className="w-full h-auto block"
              loading="lazy"
            />
            <span className="absolute bottom-1 right-2 text-[10px] text-white/50 font-mono">{p.pageNo}/{book.pageCount}</span>
          </div>
        ))}

        {book.pages.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <span className="text-4xl block mb-3">📭</span>
            <p>这本书还没有页面内容</p>
          </div>
        )}
      </div>

      {/* 底部版权 */}
      {book.attribution && (
        <footer className="bg-gray-900 border-t border-gray-800 px-4 py-3 text-center">
          <p className="text-[10px] text-gray-500">📜 {book.attribution}</p>
        </footer>
      )}
    </main>
  );
}
