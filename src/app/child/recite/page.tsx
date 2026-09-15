import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentChapter, currentTextbook, lessonChapters } from "@/lib/sync";
import { chapterText } from "@/lib/dictation";
import { getCachedReciteText } from "@/lib/recite";
import { RecitePlayer } from "@/components/recite-player";

export default async function RecitePage({ searchParams }: { searchParams: Promise<{ chapter?: string }> }) {
  const { child } = await requireChild();
  const { chapter: chapterParam } = await searchParams;
  const subjectId = "chinese";

  const tb = await currentTextbook(child.id, subjectId);
  const chapters = tb?.chapters ?? [];
  const lessons = lessonChapters(chapters);
  const cur = await currentChapter(child.id, subjectId);
  const picked = chapterParam ? lessons.find((l) => l.id === chapterParam) : null;
  const chapterId = picked?.id ?? cur?.id ?? lessons[0]?.id ?? null;
  // 取完整的章节行（含 textbookId / pageEnd）；当前课可能属于另一册
  const chapter = chapterId ? (chapters.find((c) => c.id === chapterId) ?? (await db.textbookChapter.findUnique({ where: { id: chapterId } }))) : null;

  const hasText = chapter ? (await chapterText(chapter)).replace(/[^一-龥]/g, "").length >= 20 : false;
  const cached = chapter ? getCachedReciteText(chapter.id) : null;
  const best = chapter
    ? await db.recitation.aggregate({ where: { childId: child.id, chapterId: chapter.id }, _max: { accuracy: true }, _count: true })
    : null;

  const unitOf = (c: { parentId: string | null }) => {
    let x: { id: string; parentId: string | null; title: string } | undefined = chapters.find((o) => o.id === c.parentId);
    while (x?.parentId) x = chapters.find((o) => o.id === x!.parentId);
    return x?.title ?? "";
  };
  const units = [...new Set(lessons.map(unitOf))];

  return (
    <div className="space-y-5">
      <section className="card bg-gradient-to-br from-grape-soft to-white border-grape/30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl h-display">📖 古诗 · 课文背诵</h1>
          <Link href={`/child/progress?subject=${subjectId}`} className="btn-ghost text-sm">
            调整学到哪一课 ›
          </Link>
        </div>
        {chapter ? (
          <p className="mt-2 text-lg font-bold text-grape">
            这一课：{chapter.title}
            {!picked && cur && <span className="ml-2 badge bg-grape text-white">当前学到</span>}
            {best && best._count > 0 && (
              <span className="ml-2 badge bg-bee-soft text-bee-dark">
                背过 {best._count} 次 · 最高 {best._max.accuracy}%
              </span>
            )}
          </p>
        ) : (
          <p className="mt-2 text-gray-600">语文教材还没有导入，请爸爸妈妈到家长端「教材」页导入后再来。</p>
        )}
      </section>

      {chapter &&
        (hasText ? (
          <RecitePlayer chapterId={chapter.id} chapterTitle={chapter.title} initial={cached} />
        ) : (
          <div className="card text-lg text-gray-700">这一课的课文还没有文字内容，暂时不能背诵。可以在下面换一课试试～</div>
        ))}

      {lessons.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-700">换一课背</h2>
          {units.map((u) => (
            <div key={u} className="card-flat">
              {u && <p className="text-sm font-bold text-muted mb-2">{u}</p>}
              <div className="flex flex-wrap gap-2">
                {lessons
                  .filter((l) => unitOf(l) === u)
                  .map((l) => (
                    <Link key={l.id} href={`/child/recite?chapter=${l.id}`} className={l.id === chapter?.id ? "chip-on border-grape bg-grape-soft text-grape" : "chip"}>
                      {l.title}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
