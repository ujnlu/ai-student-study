import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { OcrButton } from "@/components/ocr-button";

export default async function TextbookBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chapter?: string; page?: string }>;
}) {
  await requireParent();
  const { id } = await params;
  const { chapter, page } = await searchParams;
  const tb = await db.textbook.findUnique({
    where: { id },
    include: {
      textbookVersion: true,
      subject: true,
      chapters: { orderBy: { sortOrder: "asc" }, include: { knowledgePoints: true } },
    },
  });
  if (!tb) notFound();
  const ch = chapter ? tb.chapters.find((c) => c.id === chapter) : null;
  const pageNo = page ? Number(page) : (ch?.pageStart ?? 1);
  const from = ch?.pageStart ?? pageNo;
  const to = ch ? (ch.pageEnd ?? ch.pageStart ?? pageNo) : pageNo;
  const last = Math.min(to, from + 5);
  const pages = await db.textbookPage.findMany({
    where: { textbookId: tb.id, pageNo: { gte: from, lte: last } },
    orderBy: { pageNo: "asc" },
  });
  const bookPage = (n: number) => Math.max(1, n - tb.frontPage);
  const ocrDone = tb.contentSource === "images" ? await db.textbookPage.count({ where: { textbookId: tb.id, ocrStatus: "ocr" } }) : 0;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <aside className="card lg:col-span-1 max-h-[80vh] overflow-y-auto">
        <p className="text-xs text-gray-500">{tb.subject.name} · {tb.textbookVersion.name}</p>
        <h1 className="font-bold mb-3">{tb.title}</h1>
        {tb.contentSource === "images" && (
          <div className="mb-3 text-xs text-gray-600 space-y-1">
            <p>这本书是图片版（PDF 需登录）。已识别文字 {ocrDone}/{tb.pageCount} 页。</p>
            <OcrButton textbookId={tb.id} running={tb.status === "ocr"} progress={tb.progress} />
          </div>
        )}
        {tb.grade >= 7 && tb.contentSource === "pdf" && (
          <p className="mb-3 text-xs text-gray-500">初高中教材只保存 PDF 文字和章节目录，不保存页面图片。</p>
        )}
        {tb.contentSource === "none" && (
          <p className="mb-3 text-xs text-yellow-800 bg-yellow-50 rounded-lg p-2">
            这本书的 PDF 需要平台登录才能下载，目前只有章节目录。到「教材」页配置平台登录凭据后点「重新导入」即可补上正文。
          </p>
        )}
        <ul className="space-y-1 text-sm">
          {tb.chapters.map((c) => (
            <li key={c.id} style={{ paddingLeft: c.level * 12 }}>
              <Link
                href={`/parent/textbooks/book/${tb.id}?chapter=${c.id}`}
                className={`hover:underline ${c.id === ch?.id ? "text-orange-600 font-semibold" : ""}`}
              >
                {c.title}
              </Link>
              {c.pageStart && <span className="text-xs text-gray-400 ml-1">p{bookPage(c.pageStart)}</span>}
              {c.knowledgePoints.length > 0 && (
                <span className="ml-1 text-xs text-blue-600" title={c.knowledgePoints.map((k) => k.name).join("、")}>
                  ·{c.knowledgePoints.length}个知识点
                </span>
              )}
            </li>
          ))}
        </ul>
      </aside>
      <main className="lg:col-span-2 space-y-3">
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <Link href="/parent/textbooks" className="text-gray-500 hover:underline">← 教材</Link>
          {ch && <span className="font-semibold">{ch.title}</span>}
          <span className="text-gray-400">
            PDF 第 {from}{last > from ? `–${last}` : ""} 页 / 共 {tb.pageCount} 页
          </span>
          <span className="ml-auto flex gap-2">
            <Link href={`/parent/textbooks/book/${tb.id}?page=${Math.max(1, from - 1)}`} className="btn-secondary text-xs py-1">上一页</Link>
            <Link href={`/parent/textbooks/book/${tb.id}?page=${Math.min(tb.pageCount, last + 1)}`} className="btn-secondary text-xs py-1">下一页</Link>
          </span>
        </div>
        {pages.map((p) => (
          <div key={p.id} className="card p-3">
            <p className="text-xs text-gray-400 mb-2">书上第 {bookPage(p.pageNo)} 页（PDF 第 {p.pageNo} 页）{p.ocrStatus === "ocr" && " · 文字为 AI 识别"}</p>
            {p.imagePath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/textbook-files/${p.imagePath}`} alt={`第 ${p.pageNo} 页`} className="w-full rounded-lg border" loading="lazy" />
            ) : tb.grade <= 6 ? (
              <p className="text-sm text-gray-500">（这本书导入时没有页面图片，重新导入一次即可补上）</p>
            ) : null}
            {/* 没有页面图片时文字就是正文，默认展开；有图片时折叠 */}
            <details className="mt-2" open={!p.imagePath}>
              <summary className="text-xs text-gray-500 cursor-pointer">{p.imagePath ? "提取的文字（供 AI 参考，排版可能不准）" : "PDF 提取的文字（排版可能不准）"}</summary>
              <p className="whitespace-pre-wrap leading-relaxed text-sm mt-1">{p.text || (p.imagePath ? "（还没有识别文字）" : "（本页无文字）")}</p>
            </details>
          </div>
        ))}
        {pages.length === 0 && (
          <p className="text-gray-500">
            {tb.contentSource === "none" ? "这本书还没有正文：PDF 需要平台登录才能下载。到「教材」页配置平台登录凭据后重新导入即可。" : "没有内容"}
          </p>
        )}
      </main>
    </div>
  );
}
