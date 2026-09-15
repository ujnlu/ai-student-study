import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { ROLE_LABELS, type AssistantRole } from "@/lib/ai/prompts";

export default async function ParentHome() {
  const s = await requireParent();
  const [children, providers, assistants, uploads] = await Promise.all([
    db.child.findMany({ where: { familyId: s.familyId }, include: { _count: { select: { mistakes: { where: { status: { not: "cleared" } } }, uploads: true } } } }),
    db.aiProvider.count({ where: { familyId: s.familyId } }),
    db.aiAssistant.findMany({ where: { familyId: s.familyId } }),
    db.upload.findMany({ where: { child: { familyId: s.familyId } }, orderBy: { createdAt: "desc" }, take: 10, include: { child: true, subject: true, problems: { include: { attempts: { take: 1, orderBy: { createdAt: "desc" } } } } } }),
  ]);
  const missingRoles = (Object.keys(ROLE_LABELS) as AssistantRole[]).filter((r) => !assistants.some((a) => a.role === r));

  return (
    <div className="space-y-6">
      {(providers === 0 || children.length === 0) && (
        <div className="card bg-orange-50 border-orange-200">
          <h2 className="font-semibold mb-2">开始前还差几步</h2>
          <ol className="list-decimal ml-5 space-y-1 text-sm">
            {children.length === 0 && <li><Link className="underline" href="/parent/children/new">添加孩子</Link>，选年级和教材版本</li>}
            {providers === 0 && <li><Link className="underline" href="/parent/ai/providers/new">配置一个 AI 服务</Link>（填 API Key，会自动生成 4 个默认助手）</li>}
          </ol>
        </div>
      )}
      {providers > 0 && missingRoles.length > 0 && (
        <div className="card bg-yellow-50 border-yellow-200 text-sm">
          还没有配置这些角色的助手：{missingRoles.map((r) => ROLE_LABELS[r]).join("、")}。<Link className="underline" href="/parent/ai">去 AI 设置</Link>
        </div>
      )}

      <section>
        <h2 className="text-xl font-bold mb-3">孩子</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((c) => (
            <Link key={c.id} href={`/parent/children/${c.id}`} className="card hover:shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{c.avatar}</span>
                <div>
                  <p className="font-semibold text-lg">{c.name}</p>
                  <p className="text-sm text-gray-500">{c.grade}年级 {c.semester === 1 ? "上" : "下"}学期 {c.region ? `· ${c.region}` : ""}</p>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600 flex gap-4">
                <span>作业 {c._count.uploads} 次</span>
                <span>待消灭错题 <b className="text-red-600">{c._count.mistakes}</b></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">最近作业</h2>
        {uploads.length === 0 ? (
          <p className="text-gray-500 text-sm">还没有上传过作业</p>
        ) : (
          <ul className="space-y-2">
            {uploads.map((u) => {
              const wrong = u.problems.filter((p) => p.attempts[0]?.isCorrect === false).length;
              return (
                <li key={u.id}>
                  <Link href={`/parent/uploads/${u.id}`} className="card flex items-center gap-3 py-3 hover:shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${u.filePath}`} alt="" className="w-12 h-12 rounded-lg object-cover border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{u.child.avatar} {u.child.name} · {u.subject?.name ?? "未分类"} · {u.createdAt.toLocaleString("zh-CN")}</p>
                      <p className="text-xs text-gray-500 truncate">{u.status === "graded" ? `${u.problems.length} 题，错 ${wrong} 题` : u.status === "failed" ? `失败：${u.error}` : u.status}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
