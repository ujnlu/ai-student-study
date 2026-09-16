import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { deleteSetAction, generateAiSetAction } from "@/app/actions/practice";
import { KpPicker } from "@/components/kp-picker";

export default async function ParentPracticePage({ searchParams }: { searchParams: Promise<{ error?: string; child?: string }> }) {
  const s = await requireParent();
  const { error, child: childParam } = await searchParams;
  const children = await db.child.findMany({ where: { familyId: s.familyId }, include: { textbooks: true }, orderBy: { createdAt: "asc" } });
  const child = children.find((c) => c.id === childParam) ?? children[0];
  // 不按孩子年级截断：英语等教材从三年级起，家长也可能想提前出题；默认仍选孩子当前年级
  const kps = child
    ? await db.knowledgePoint.findMany({
        where: { textbookVersionId: { in: child.textbooks.map((t) => t.textbookVersionId) } },
        orderBy: [{ grade: "asc" }, { semester: "asc" }, { sortOrder: "asc" }],
        include: { subject: true },
      })
    : [];
  const subjectRows = await db.subject.findMany({ where: { id: { in: child?.textbooks.map((t) => t.subjectId) ?? [] } }, orderBy: { sortOrder: "asc" } });
  const versionRows = await db.textbookVersion.findMany({ where: { id: { in: child?.textbooks.map((t) => t.textbookVersionId) ?? [] } } });
  // 各学科哪些版本已经有知识点，用于孩子教材版本选错时给出准确提示
  const kpVersions = await db.knowledgePoint.groupBy({ by: ["subjectId", "textbookVersionId"] });
  const allVersions = await db.textbookVersion.findMany({ where: { id: { in: kpVersions.map((v) => v.textbookVersionId) } } });
  const subjectOptions = subjectRows.map((sub) => {
    const chosenId = child?.textbooks.find((t) => t.subjectId === sub.id)?.textbookVersionId;
    const chosen = versionRows.find((v) => v.id === chosenId);
    const hasKp = kps.some((k) => k.subjectId === sub.id);
    const others = kpVersions.filter((v) => v.subjectId === sub.id && v.textbookVersionId !== chosenId).map((v) => allVersions.find((a) => a.id === v.textbookVersionId)?.name).filter(Boolean);
    let hint: string | undefined;
    if (!hasKp) {
      hint = `${child?.name ?? "孩子"}的${sub.name}教材是「${chosen?.name ?? "未设置"}」，这个版本还没有导入知识点。`
        + (others.length ? `已导入知识点的${sub.name}版本：${others.join("、")}。可到「孩子」页把教材版本改成其中之一，` : "")
        + "或到「教材」页导入这个版本（图片版教材需先用 AI 识别文字）。";
    }
    return { id: sub.id, name: sub.name, versionName: chosen?.name, hint };
  });
  const sets = await db.practiceSet.findMany({
    where: { child: { familyId: s.familyId } },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { child: true, knowledgePoint: true },
  });
  const KIND: Record<string, string> = { oral: "口算", sync: "同步练", variant: "变式题", review: "复习", ai: "AI 出题" };
  const STATUS: Record<string, [string, string]> = { pending_review: ["待审核", "bg-yellow-100 text-yellow-800"], ready: ["待完成", "bg-blue-50 text-blue-700"], done: ["已完成", "bg-green-50 text-green-700"] };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">出题与练习</h1>
      {error && <p className="card bg-red-50 border-red-200 text-red-700">{error}</p>}

      <section className="card space-y-4">
        <h2 className="font-semibold">AI 按知识点出题（生成后需你审核再发给孩子）</h2>
        {children.length === 0 ? <p className="text-sm text-gray-500">先添加孩子</p> : (
          <form action={generateAiSetAction} className="grid sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="label">孩子</label>
              <select name="childId" defaultValue={child?.id} className="input">
                {children.map((c) => <option key={c.id} value={c.id}>{c.avatar} {c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">题数</label><input name="count" type="number" min={1} max={20} defaultValue={5} className="input" /></div>
              <div><label className="label">难度 1-5</label><input name="difficulty" type="number" min={1} max={5} defaultValue={2} className="input" /></div>
            </div>
            <KpPicker
              kps={kps.map((k) => ({ id: k.id, name: k.name, unit: k.unit, grade: k.grade, semester: k.semester, subjectId: k.subjectId, subjectName: k.subject.name }))}
              allSubjects={subjectOptions}
              defaultSubject="math"
              defaultGrade={child?.grade}
              defaultSemester={child?.semester}
            />
            <button className="btn-primary sm:col-span-2">生成（约 20 秒）</button>
          </form>
        )}
        {children.length > 1 && (
          <p className="text-xs text-gray-500">切换孩子以加载对应教材的知识点：{children.map((c) => <Link key={c.id} href={`/parent/practice?child=${c.id}`} className="underline mr-2">{c.name}</Link>)}</p>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-2">所有练习</h2>
        <ul className="space-y-2">
          {sets.map((st) => {
            const [label, cls] = STATUS[st.status] ?? [st.status, "bg-gray-100"];
            return (
              <li key={st.id} className="card py-3 flex items-center gap-3">
                <span className={`badge ${cls}`}>{label}</span>
                <span className="badge bg-gray-100 text-gray-600">{KIND[st.kind] ?? st.kind}</span>
                <div className="flex-1 min-w-0">
                  <Link href={`/parent/practice/${st.id}`} className="hover:underline truncate block">{st.child.avatar} {st.child.name} · {st.title}</Link>
                  <p className="text-xs text-gray-500">{st.createdAt.toLocaleString("zh-CN")} · {st.total} 题{st.status === "done" ? ` · 得分 ${st.score}/${st.total}` : ""}</p>
                </div>
                <form action={deleteSetAction}><input type="hidden" name="id" value={st.id} /><button className="btn-danger text-xs py-1">删除</button></form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
