import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { deleteChildAction } from "@/app/actions/children";

export default async function ChildrenPage() {
  const s = await requireParent();
  const children = await db.child.findMany({
    where: { familyId: s.familyId },
    include: { textbooks: { include: { subject: true, textbookVersion: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">孩子</h1>
        <Link href="/parent/children/new" className="btn-primary">+ 添加孩子</Link>
      </div>
      {children.map((c) => (
        <div key={c.id} className="card flex items-center gap-4">
          <span className="text-4xl">{c.avatar}</span>
          <div className="flex-1">
            <p className="font-semibold text-lg">{c.name} <span className="text-sm text-gray-500 font-normal">{c.grade}年级{c.semester === 1 ? "上" : "下"}学期 {c.region ?? ""}</span></p>
            <p className="text-sm text-gray-600">
              {c.textbooks.map((t) => `${t.subject.name}：${t.textbookVersion.name}`).join(" · ") || "未设置教材"}
            </p>
          </div>
          <Link href={`/parent/children/${c.id}`} className="btn-secondary text-sm">编辑</Link>
          <form action={deleteChildAction}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn-danger text-sm">删除</button>
          </form>
        </div>
      ))}
    </div>
  );
}
