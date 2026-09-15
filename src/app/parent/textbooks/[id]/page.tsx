import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { addKnowledgePointAction } from "@/app/actions/children";

export default async function TextbookDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireParent();
  const { id } = await params;
  const tv = await db.textbookVersion.findUniqueOrThrow({
    where: { id },
    include: { subject: true, knowledgePoints: { orderBy: [{ grade: "asc" }, { semester: "asc" }, { sortOrder: "asc" }] } },
  });
  const groups = new Map<string, typeof tv.knowledgePoints>();
  for (const kp of tv.knowledgePoints) {
    const key = `${kp.grade}年级${kp.semester === 1 ? "上" : "下"} · ${kp.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), kp]);
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tv.subject.name} · {tv.name} 知识点</h1>
      <form action={addKnowledgePointAction} className="card grid sm:grid-cols-4 gap-3 items-end">
        <input type="hidden" name="textbookVersionId" value={tv.id} />
        <div><label className="label">年级</label><select name="grade" className="input">{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
        <div><label className="label">学期</label><select name="semester" className="input"><option value={1}>上</option><option value={2}>下</option></select></div>
        <div><label className="label">单元</label><input name="unit" className="input" placeholder="如：小数乘法" /></div>
        <div className="sm:col-span-4"><label className="label">知识点（逗号或换行分隔，可一次多个）</label><textarea name="names" className="input" rows={2} required /></div>
        <button className="btn-primary">批量添加</button>
      </form>
      {groups.size === 0 && <p className="text-gray-500">这个版本还没有知识点，AI 批改时会用它自己识别的知识点名称，但无法统计掌握度。</p>}
      {[...groups.entries()].map(([k, list]) => (
        <section key={k} className="card">
          <h2 className="font-semibold mb-2">{k}</h2>
          <div className="flex flex-wrap gap-2">{list.map((kp) => <span key={kp.id} className="badge bg-blue-50 text-blue-700">{kp.name}</span>)}</div>
        </section>
      ))}
    </div>
  );
}
