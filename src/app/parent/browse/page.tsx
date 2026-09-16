import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { GRADE_NAMES, STAGE_GRADES, STAGE_NAME, stageOf, type Stage } from "@/lib/grade";
import { groupByModule, lecturesOfLevel, topicsFor, SUBJECT_NAME, type TopicSubject, type Topic } from "@/lib/topics";
import { STAGE_EXAMS, STAGE_EXAM_NAME, STAGE_SUBJECTS, type ExamStage, type SecondarySubject } from "@/lib/secondary-catalog";
import { PAPER_STAGES } from "@/lib/papers";
import { bookLabel } from "@/app/parent/textbooks/page";

const PRIMARY_SUBJECTS = ["math", "chinese", "english"] as const;

/** 家长内容总览：按学段 / 年级 / 科目看教材、专题讲义、考试内容、历年真题 */
export default async function BrowsePage({ searchParams }: { searchParams: Promise<{ g?: string; subject?: string }> }) {
  const s = await requireParent();
  const { g, subject: sb } = await searchParams;
  const kids = await db.child.findMany({ where: { familyId: s.familyId, kind: "child" }, orderBy: { createdAt: "asc" }, select: { name: true, grade: true } });
  const grade = Math.min(12, Math.max(1, Number(g) || kids[0]?.grade || 2));
  const stage: Stage = stageOf(grade);
  const subjects: string[] = stage === "primary" ? [...PRIMARY_SUBJECTS] : STAGE_SUBJECTS[stage];
  const subject = subjects.includes(sb ?? "") ? (sb as string) : "math";
  const subjectName = SUBJECT_NAME[subject as TopicSubject] ?? subject;
  const examStage: ExamStage | null = stage === "primary" ? null : stage === "senior" ? "gaokao" : "zhongkao";

  const [books, papers, lecturedRows] = await Promise.all([
    db.textbook.findMany({ where: { status: "ready", grade, subjectId: subject }, include: { textbookVersion: true, _count: { select: { chapters: true, pages: true } } }, orderBy: [{ semester: "asc" }] }),
    db.paper.findMany({ where: { familyId: s.familyId, subject, ...(examStage ? { stage: examStage } : {}) }, orderBy: { createdAt: "desc" } }),
    db.topicLecture.findMany({ select: { code: true } }),
  ]);
  const lectured = new Set(lecturedRows.map((r) => r.code));

  const special = topicsFor("special", subject as TopicSubject, grade);
  const olympiad = stage === "primary" && subject === "math" ? [...lecturesOfLevel(grade * 2 - 1), ...lecturesOfLevel(grade * 2)] : [];
  const quality = stage === "primary" ? (["science", "coding", "culture"] as const).flatMap((q) => topicsFor("quality", q, grade)) : [];
  const examTopics = examStage ? topicsFor(examStage, subject as SecondarySubject, examStage === "gaokao" ? 12 : 9) : [];
  const examCfg = examStage ? STAGE_EXAMS[examStage][subject as SecondarySubject] : null;

  const Tile = ({ t }: { t: Topic }) => (
    <Link href={`/parent/study/topic/${t.code}`} className="card-flat hover:shadow-md flex flex-col gap-0.5">
      <span className="font-semibold text-sm truncate">{t.emoji} {t.name}{lectured.has(t.code) && <span className="badge bg-leaf-soft text-leaf-dark ml-1">讲义已生成</span>}</span>
      <span className="text-xs text-gray-500 line-clamp-1">{t.desc}</span>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📚 内容总览</h1>
        <p className="text-sm text-gray-500">按年级和科目看孩子会学到什么、考什么：教材原文、每个专题的讲义（点进去可以生成 / 阅读 / 自己做题）、考试结构和你导入的历年真题。</p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {(["primary", "junior", "senior"] as Stage[]).map((st) => (
          <Link key={st} href={`/parent/browse?g=${STAGE_GRADES[st][0]}&subject=math`} className={`px-3 py-1.5 rounded-full text-sm font-bold border ${st === stage ? "bg-gray-900 text-white border-gray-900" : "bg-white border-line hover:bg-gray-50"}`}>{STAGE_NAME[st]}</Link>
        ))}
        <span className="text-gray-300">|</span>
        {STAGE_GRADES[stage].map((x) => (
          <Link key={x} href={`/parent/browse?g=${x}&subject=${subject}`} className={`px-3 py-1.5 rounded-full text-sm font-bold border ${x === grade ? "bg-brand text-white border-brand" : "bg-white border-line hover:bg-gray-50"}`}>{GRADE_NAMES[x]}{kids.some((k) => k.grade === x) ? ` · ${kids.filter((k) => k.grade === x).map((k) => k.name).join("、")}` : ""}</Link>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        {subjects.map((k) => (
          <Link key={k} href={`/parent/browse?g=${grade}&subject=${k}`} className={`px-3 py-1.5 rounded-full text-sm font-bold border ${k === subject ? "bg-sky text-white border-sky" : "bg-white border-line hover:bg-gray-50"}`}>{SUBJECT_NAME[k as TopicSubject] ?? k}</Link>
        ))}
      </div>

      <section className="card">
        <div className="flex items-center justify-between mb-2"><h2 className="font-bold">📖 教材（{GRADE_NAMES[grade]}{subjectName}）</h2><Link href={`/parent/textbooks?stage=${stage}&subject=${subject}`} className="text-sm text-sky hover:underline">导入更多版本 ›</Link></div>
        {books.length === 0 ? (
          <p className="text-sm text-gray-500">还没导入这个年级的{subjectName}教材，去「教材」页导入后这里可以逐课看原文。</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((b) => (
              <li key={b.id}>
                <Link href={`/parent/textbooks/book/${b.id}`} className="card-flat hover:shadow-md block">
                  <p className="font-semibold text-sm">{b.textbookVersion.name} · {bookLabel(b)}</p>
                  <p className="text-xs text-gray-500">{b._count.chapters} 课时 · {b._count.pages} 页{b.contentSource === "images" ? " · 图片版" : b.contentSource === "none" ? " · 仅章节" : " · 有文字"}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="font-bold mb-2">🎯 专项讲义与练习（{special.length} 个专题）</h2>
        <p className="text-xs text-gray-500 mb-3">每个专题：课前故事 → 知识导引 → 方法 → 一例一练 → 名师点拨，附三档练习。第一次点进去需要 AI 生成一次，之后所有人直接看。</p>
        {groupByModule(special).map((gp) => (
          <div key={gp.module} className="mb-3">
            <p className="text-xs font-bold text-gray-500 mb-1">{gp.emoji} {gp.name}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{gp.topics.map((t) => <Tile key={t.code} t={t} />)}</div>
          </div>
        ))}
      </section>

      {olympiad.length > 0 && (
        <section className="card">
          <h2 className="font-bold mb-2">🧠 奥数（{GRADE_NAMES[grade]}上下两级，各 20 讲）</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{olympiad.map((t) => <Tile key={t.code} t={t} />)}</div>
        </section>
      )}

      {quality.length > 0 && subject === "math" && (
        <section className="card">
          <h2 className="font-bold mb-2">🔬 素养（科学 / 编程思维 / 国学人文）</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{quality.map((t) => <Tile key={t.code} t={t} />)}</div>
        </section>
      )}

      <section className="card">
        <h2 className="font-bold mb-2">📝 考试内容</h2>
        {stage === "primary" ? (
          <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
            <li>单元测：按当前单元 15 题 20 分钟，跨课时抽题（孩子端「单元测」）。</li>
            <li>期中 / 期末模拟卷：20 题 30 分钟，从学过的课里抽（孩子端「真题演练」）。</li>
            <li>奥数级末定级测：每级 20 讲学完，20 题 40 分钟，70% 通关。</li>
            <li>同步练每批含 2 题新课标「新题新考法」情境题。</li>
          </ul>
        ) : (
          <>
            {examCfg && (
              <p className="text-sm text-gray-700 mb-2"><b>{STAGE_EXAM_NAME[examStage!]}{subjectName}模拟卷结构：</b>{examCfg.parts.map(([p, c]) => `${p.replace(/（.*?）/g, "")} ${c} 题`).join(" · ")}，共 {examCfg.parts.reduce((a, [, c]) => a + c, 0)} 题 {examCfg.minutes} 分钟。<Link href={`/parent/study?exam=${examStage}&subject=${subject}`} className="text-sky hover:underline ml-1">去做一套 ›</Link></p>
            )}
            <p className="text-xs font-bold text-gray-500 mb-1">{STAGE_EXAM_NAME[examStage!]}真题题型专讲（{examTopics.length}）</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{examTopics.map((t) => <Tile key={t.code} t={t} />)}</div>
          </>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-2"><h2 className="font-bold">📄 历年真题（你导入的）</h2><Link href="/parent/papers" className="text-sm text-sky hover:underline">上传真题 ›</Link></div>
        {papers.length === 0 ? (
          <p className="text-sm text-gray-500">还没有{examStage ? STAGE_EXAM_NAME[examStage] : ""}{subjectName}的真题卷。真实历年试卷受版权保护，站内不预置；你把 PDF / 文本传到「真题卷」，AI 会拆题入库，孩子和你都能整卷做、逐题看讲解。</p>
        ) : (
          <ul className="space-y-1.5">
            {papers.map((p) => (
              <li key={p.id}>
                <Link href={`/parent/papers/${p.id}`} className="card-flat flex items-center gap-3 hover:shadow-md text-sm">
                  <span className="flex-1 font-semibold truncate">{p.title}</span>
                  <span className="text-gray-500">{PAPER_STAGES[p.stage]}{p.year ? ` · ${p.year}` : ""} · {p.total} 题</span>
                  <span className={`badge ${p.status === "ready" ? "bg-leaf-soft text-leaf-dark" : "bg-bee-soft text-bee-dark"}`}>{p.status === "ready" ? "可做" : p.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
