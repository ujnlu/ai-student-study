import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { currentChapter, currentTextbook, lessonChapters } from "@/lib/sync";
import { CONSOLIDATE_SIZE } from "@/lib/consolidate";
import { MascotSays } from "@/components/mascot";
import { StartFlowButton } from "@/components/start-flow-button";
import { THEME } from "@/components/subject-ui";

const SUBJECTS = ["math", "chinese", "english"] as const;

/** 知识图谱（参考学而思精准学）：本册每一课按掌握度着色，只练没掌握的 */
export default async function MapPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { child } = await requireChild();
  const { subject: s } = await searchParams;
  const subject = (SUBJECTS as readonly string[]).includes(s ?? "") ? (s as (typeof SUBJECTS)[number]) : "math";
  const T = THEME[subject];
  const has = child.textbooks.map((t) => t.subjectId);
  const tb = has.includes(subject) ? await currentTextbook(child.id, subject) : null;
  const cur = tb ? await currentChapter(child.id, subject) : null;
  const lessons = tb ? lessonChapters(tb.chapters) : [];
  const curIdx = cur ? lessons.findIndex((l) => l.id === cur.id) : -1;
  const ids = lessons.map((l) => l.id);
  const [masteries, attempts] = await Promise.all([
    ids.length ? db.mastery.findMany({ where: { childId: child.id, knowledgePoint: { chapterId: { in: ids } } }, include: { knowledgePoint: { select: { chapterId: true } } } }) : [],
    ids.length ? db.attempt.findMany({ where: { childId: child.id, problem: { chapterId: { in: ids } } }, select: { isCorrect: true, problem: { select: { chapterId: true } } } }) : [],
  ]);
  const score = new Map<string, { s: number; n: number; att: number; ok: number }>();
  for (const m of masteries) {
    const k = m.knowledgePoint.chapterId!;
    const c = score.get(k) ?? { s: 0, n: 0, att: 0, ok: 0 };
    c.s += m.score;
    c.n++;
    score.set(k, c);
  }
  for (const a of attempts) {
    const k = a.problem.chapterId!;
    const c = score.get(k) ?? { s: 0, n: 0, att: 0, ok: 0 };
    c.att++;
    if (a.isCorrect) c.ok++;
    score.set(k, c);
  }
  const level = (id: string) => {
    const c = score.get(id);
    if (!c || (c.n === 0 && c.att === 0)) return null;
    const pct = c.att > 0 ? Math.round((c.ok / c.att) * 100) : Math.round(c.s / c.n);
    return pct;
  };
  const unitOf = (c: { parentId: string | null }) => {
    let x = tb?.chapters.find((o) => o.id === c.parentId);
    while (x?.parentId) {
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
  const learned = curIdx >= 0 ? lessons.slice(0, curIdx + 1) : [];
  const weak = learned.filter((l) => (level(l.id) ?? 100) < 70).length;
  const untested = learned.filter((l) => level(l.id) === null).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">🗺️ 知识图谱</h1>
        <Link href={`/child?s=${subject}`} className="btn-ghost text-sm">‹ 回首页</Link>
      </div>
      <div className="flex gap-2">
        {SUBJECTS.filter((k) => has.includes(k)).map((k) => (
          <Link key={k} href={`/child/map?subject=${k}`} className={k === subject ? `chip-on ${THEME[k].ring} ${THEME[k].soft} ${THEME[k].text}` : "chip"}>{THEME[k].emoji} {THEME[k].name}</Link>
        ))}
      </div>
      {!tb ? (
        <MascotSays mood="think">这个学科的课本还没导入，让爸爸妈妈到家长端「教材」页导入后再来。</MascotSays>
      ) : (
        <>
          <MascotSays mood={weak > 0 ? "think" : "happy"} size={72}>
            <p className="font-extrabold">{weak > 0 ? `学过的课里有 ${weak} 课还不太熟，橙橙帮你只练这些。` : untested > 0 ? `还有 ${untested} 课没练过，做一组同步练就能点亮。` : "学过的每一课都点亮了，真棒！"}</p>
            <p className="text-xs text-muted mt-1">绿 ≥ 90% · 黄 70-89% · 红 &lt; 70% · 灰 还没练</p>
          </MascotSays>
          <div className={`card ${T.border} flex items-center gap-3`}>
            <span className="text-3xl">🎯</span>
            <div className="flex-1">
              <p className="font-black">过滤练：只练没掌握的</p>
              <p className="text-xs font-bold text-muted">{CONSOLIDATE_SIZE} 题，从红色和黄色的课里出</p>
            </div>
            <StartFlowButton url="/api/consolidate" body={{ kind: "consolidate", subjectId: subject }} redirect="/child/practice/{id}" label="开始" busyLabel="出题中…" className={`${T.btn} text-sm`} />
          </div>
          {groups.map((g) => (
            <section key={g.unit}>
              <h2 className={`font-black text-base mb-2 ${T.text}`}>{g.unit}</h2>
              <div className="flex flex-wrap gap-2">
                {g.items.map((l) => {
                  const i = lessons.findIndex((x) => x.id === l.id);
                  const future = curIdx >= 0 && i > curIdx;
                  const pct = level(l.id);
                  const cls = future ? "border-dashed border-line text-muted/60 bg-white" : pct === null ? "border-line bg-gray-100 text-muted" : pct >= 90 ? "border-leaf bg-leaf-soft text-leaf-dark" : pct >= 70 ? "border-bee bg-bee-soft text-bee-dark" : "border-berry bg-berry-soft text-berry";
                  return (
                    <Link key={l.id} href={`/child/lesson?subject=${subject}&chapter=${l.id}`} className={`rounded-xl border-2 px-3 py-1.5 text-sm font-extrabold ${cls} ${l.id === cur?.id ? "ring-4 ring-brand/30" : ""}`}>
                      {l.title}{pct !== null && !future ? <span className="ml-1 text-xs opacity-80">{pct}%</span> : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
