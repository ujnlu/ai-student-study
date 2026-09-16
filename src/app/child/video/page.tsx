import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { currentChapter, currentTextbook, lessonChapters } from "@/lib/sync";
import { LessonVideoButton } from "@/components/lesson-video-button";
import { MascotSays } from "@/components/mascot";
import { THEME } from "@/components/subject-ui";

const SUBJECTS = ["math", "chinese", "english"] as const;

export default async function VideoPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { child } = await requireChild();
  const { subject: s } = await searchParams;
  const subject = (SUBJECTS as readonly string[]).includes(s ?? "") ? (s as (typeof SUBJECTS)[number]) : "math";
  const T = THEME[subject];
  const has = child.textbooks.map((t) => t.subjectId);
  const tb = has.includes(subject) ? await currentTextbook(child.id, subject) : null;
  const cur = tb ? await currentChapter(child.id, subject) : null;
  const lessons = tb ? lessonChapters(tb.chapters) : [];
  const guides = lessons.length ? await db.lessonGuide.findMany({ where: { chapterId: { in: lessons.map((l) => l.id) } }, select: { chapterId: true, videoUrl: true, explanationId: true } }) : [];
  const guideOf = new Map(guides.map((g) => [g.chapterId, g]));
  // 按单元分组
  const unitOf = (c: { parentId: string | null }) => {
    let x = tb?.chapters.find((o) => o.id === c.parentId);
    while (x?.parentId && x.level > 0) {
      const p = tb?.chapters.find((o) => o.id === x!.parentId);
      if (!p) break;
      x = p;
    }
    return x?.title ?? "";
  };
  const groups: { unit: string; items: typeof lessons }[] = [];
  for (const l of lessons) {
    const u = unitOf(l);
    const g = groups[groups.length - 1];
    if (g && g.unit === u) g.items.push(l);
    else groups.push({ unit: u, items: [l] });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">📺 视频教学</h1>
        <Link href={`/child?s=${subject}`} className="btn-ghost text-sm">‹ 回首页</Link>
      </div>
      <div className="flex gap-2">
        {SUBJECTS.filter((k) => has.includes(k)).map((k) => (
          <Link key={k} href={`/child/video?subject=${k}`} className={k === subject ? `chip-on ${THEME[k].ring} ${THEME[k].soft} ${THEME[k].text}` : "chip"}>{THEME[k].emoji} {THEME[k].name}</Link>
        ))}
      </div>
      {!tb ? (
        <MascotSays mood="think">这个学科的课本还没导入，让爸爸妈妈到家长端「教材」页导入后，这里就会列出每一课的老师讲课视频。</MascotSays>
      ) : (
        <>
          <MascotSays mood="happy" size={72}>
            <p className="font-extrabold">{tb.title}</p>
            <p className="text-xs text-muted mt-1">每一课都有国家中小学智慧教育平台的老师讲课（新窗口播放），还有橙橙的微课动画。</p>
          </MascotSays>
          {groups.map((g) => (
            <section key={g.unit}>
              <h2 className={`font-black text-base mb-2 ${T.text}`}>{g.unit}</h2>
              <ul className="space-y-2">
                {g.items.map((l) => {
                  const gd = guideOf.get(l.id);
                  const isCur = cur?.id === l.id;
                  return (
                    <li key={l.id} className={`tile py-2.5 ${isCur ? `${T.ring} ${T.soft}` : "border-line"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold truncate">{l.title}{isCur && <span className={`badge ml-2 ${T.solid} text-white`}>学到这</span>}</p>
                        <p className="text-xs font-bold text-muted">书上第 {Math.max(1, (l.pageStart ?? 1) - tb.frontPage)} 页{gd?.explanationId ? " · 微课已生成" : ""}</p>
                      </div>
                      <Link href={`/child/lesson?subject=${subject}&chapter=${l.id}`} className="btn-secondary text-sm py-2 px-3">🎬 微课</Link>
                      <LessonVideoButton chapterId={l.id} url={gd?.videoUrl} className={`${T.btn} text-sm py-2 px-3`} label="▶️ 讲课" />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
