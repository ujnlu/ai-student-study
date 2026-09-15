import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentTextbook, lessonChapters } from "@/lib/sync";
import { ProgressPicker } from "@/components/progress-picker";

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { child } = await requireChild();
  const { subject = "math" } = await searchParams;
  const subjects = await db.subject.findMany({ orderBy: { sortOrder: "asc" } });
  const tb = await currentTextbook(child.id, subject);
  const cur = await db.childProgress.findUnique({ where: { childId_subjectId: { childId: child.id, subjectId: subject } } });
  const chapters = tb?.chapters ?? [];
  const lessons = lessonChapters(chapters);
  const unitOf = (c: { id: string; parentId: string | null; title: string }) => {
    let x: { id: string; parentId: string | null; title: string } | undefined = c;
    while (x?.parentId) x = chapters.find((o) => o.id === x!.parentId);
    return x?.title ?? "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">学校学到哪了？</h1>
      </div>
      <div className="flex gap-2">
        {subjects.map((s) => (
          <Link key={s.id} href={`/child/progress?subject=${s.id}`} className={`px-4 py-1.5 rounded-full text-sm ${s.id === subject ? "bg-brand text-white" : "bg-white border"}`}>{s.name}</Link>
        ))}
      </div>
      {!tb ? (
        <div className="card text-gray-600">这个学科的教材还没有导入，请爸爸妈妈到家长端「教材」页导入后再来设置。</div>
      ) : (
        <>
          <p className="text-sm text-gray-500">{tb.title}，点一下今天学到的那一课，同步练习就会跟着出题。</p>
          <ProgressPicker
            subjectId={subject}
            currentId={cur?.chapterId ?? lessons[0]?.id ?? null}
            lessons={lessons.map((l) => ({ id: l.id, title: l.title, unit: unitOf(l), page: (l.pageStart ?? 0) - tb.frontPage }))}
          />
        </>
      )}
    </div>
  );
}
