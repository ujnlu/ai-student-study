import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { chapterPath, currentChapter, currentTextbook, lessonChapters } from "@/lib/sync";
import { getGuide, type PreviewCard } from "@/lib/lesson-guide";
import { resolveLessonVideo } from "@/lib/lesson-video";
import { MicroLessonButton, PreviewCardBox } from "@/components/lesson-actions";
import { StartPracticeButton } from "@/components/start-practice-button";
import { MascotSays } from "@/components/mascot";

const SUBJ: Record<string, string> = { math: "数学", chinese: "语文", english: "英语" };

export default async function LessonPage({ searchParams }: { searchParams: Promise<{ subject?: string; chapter?: string }> }) {
  const { child } = await requireChild();
  const { subject = "math", chapter } = await searchParams;
  const tb = await currentTextbook(child.id, subject);
  const picked = chapter ? { id: chapter } : await currentChapter(child.id, subject);
  const cur = picked ? await db.textbookChapter.findUnique({ where: { id: picked.id } }) : null;
  const subjects = child.textbooks.map((t) => t.subjectId);

  if (!tb || !cur) {
    return (
      <div className="space-y-4">
        <h1 className="h-display text-2xl">📚 今天这一课</h1>
        <MascotSays mood="think">这个学科的课本还没导入，让爸爸妈妈到家长端「教材」页导入后再来。</MascotSays>
      </div>
    );
  }
  const path = await chapterPath(cur.id);
  const [guide, video, pages] = await Promise.all([
    getGuide(cur.id),
    resolveLessonVideo(cur.id),
    db.textbookPage.findMany({ where: { textbookId: cur.textbookId, pageNo: { gte: cur.pageStart ?? 1, lte: Math.min(cur.pageEnd ?? cur.pageStart ?? 1, (cur.pageStart ?? 1) + 1) } }, orderBy: { pageNo: "asc" } }),
  ]);
  const preview = guide?.previewJson ? (JSON.parse(guide.previewJson) as PreviewCard) : null;
  const micro = guide?.explanationId ? await db.explanation.findUnique({ where: { id: guide.explanationId } }) : null;
  const lessons = lessonChapters(tb.chapters);
  const idx = lessons.findIndex((l) => l.id === cur.id);
  const prev = idx > 0 ? lessons[idx - 1] : null;
  const next = idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">📚 今天这一课</h1>
        <div className="flex gap-2">
          {subjects.map((s) => (
            <Link key={s} href={`/child/lesson?subject=${s}`} className={s === subject ? "chip-on" : "chip"}>{SUBJ[s] ?? s}</Link>
          ))}
        </div>
      </div>

      <section className="card bg-gradient-to-br from-brand-soft to-white border-brand/30">
        <p className="text-xs font-extrabold text-muted">{tb.title}</p>
        <h2 className="h-display text-2xl mt-1">{cur.title}</h2>
        <p className="text-sm font-bold text-muted">{path}{cur.pageStart ? ` · 书上第 ${Math.max(1, cur.pageStart - tb.frontPage)} 页` : ""}</p>
        <div className="mt-3 flex gap-2 flex-wrap">
          {prev && <Link href={`/child/lesson?subject=${subject}&chapter=${prev.id}`} className="btn-secondary text-sm py-2">← {prev.title}</Link>}
          {next && <Link href={`/child/lesson?subject=${subject}&chapter=${next.id}`} className="btn-secondary text-sm py-2">{next.title} →</Link>}
          <Link href={`/child/progress?subject=${subject}`} className="btn-ghost text-sm">换一课</Link>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 gap-3">
        {video && (
          <div className="card border-sky/30">
            <div className="flex items-center gap-2 mb-2"><span className="text-3xl">📺</span><h3 className="font-black text-lg">看老师讲课</h3></div>
            <p className="text-sm font-bold text-muted mb-3">国家中小学智慧教育平台的官方课：{video.title}</p>
            <a href={video.url} target="_blank" rel="noopener" className="btn-sky w-full">▶️ 去平台看课（新窗口）</a>
          </div>
        )}
        <div className="card border-brand/30">
          <div className="flex items-center gap-2 mb-2"><span className="text-3xl">🎬</span><h3 className="font-black text-lg">橙橙微课</h3></div>
          <p className="text-sm font-bold text-muted mb-3">4-6 步动画讲清楚这一课的方法，{micro ? "已经准备好了。" : "第一次需要生成。"}</p>
          <MicroLessonButton chapterId={cur.id} existingId={micro?.status === "ready" ? micro.id : null} />
        </div>
      </section>

      <section className="card">
        <div className="flex items-center gap-2 mb-2"><span className="text-3xl">📖</span><h3 className="font-black text-lg">预习卡</h3></div>
        <PreviewCardBox chapterId={cur.id} initial={preview} />
      </section>

      <section className="card border-leaf/30 bg-leaf-soft/40">
        <div className="flex items-center gap-3">
          <span className="text-3xl">✏️</span>
          <div className="flex-1">
            <h3 className="font-black text-lg">学完练一练</h3>
            <p className="text-sm font-bold text-muted">这一课的同步练习，8 题。</p>
          </div>
          <StartPracticeButton kind="sync" subjectId={subject} label="开始" className="btn-leaf" />
        </div>
      </section>

      {pages.some((p) => p.imagePath) && (
        <section>
          <h3 className="font-black text-lg mb-2">📕 课本这几页</h3>
          <div className="grid grid-cols-2 gap-2">
            {pages.filter((p) => p.imagePath).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={`/api/textbook-files/${p.imagePath}`} alt={`第 ${p.pageNo} 页`} className="w-full rounded-2xl border-2 border-line" loading="lazy" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
