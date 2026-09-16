import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { ROLE_LABELS, type AssistantRole } from "@/lib/ai/prompts";
import { buildReport } from "@/lib/report";
import { screenTimeStatus } from "@/lib/screen-time";

export default async function ParentHome() {
  const s = await requireParent();
  const [children, providers, assistants, uploads, pendingRedemptions] = await Promise.all([
    db.child.findMany({ where: { familyId: s.familyId, kind: "child" }, orderBy: { createdAt: "asc" } }),
    db.aiProvider.count({ where: { familyId: s.familyId } }),
    db.aiAssistant.findMany({ where: { familyId: s.familyId } }),
    db.upload.findMany({ where: { child: { familyId: s.familyId } }, orderBy: { createdAt: "desc" }, take: 6, include: { child: true, subject: true, problems: { include: { attempts: { take: 1, orderBy: { createdAt: "desc" } } } } } }),
    db.redemption.count({ where: { status: "pending", child: { familyId: s.familyId } } }),
  ]);
  const missingRoles = (Object.keys(ROLE_LABELS) as AssistantRole[]).filter((r) => !assistants.some((a) => a.role === r));
  const reports = await Promise.all(children.map(async (c) => ({ child: c, r: await buildReport(c.id), st: await screenTimeStatus(c.id, s.familyId) })));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="h-display text-2xl">概览</h1>
          <p className="text-sm font-bold text-muted">{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</p>
        </div>
        {pendingRedemptions > 0 && <Link href="/parent/rewards" className="btn-primary text-sm py-2">🎁 {pendingRedemptions} 个兑换待处理</Link>}
      </div>

      {(providers === 0 || children.length === 0) && (
        <div className="card border-brand/40 bg-brand-soft">
          <h2 className="font-black mb-2">开始前还差几步</h2>
          <ol className="list-decimal ml-5 space-y-1 text-sm font-bold">
            {children.length === 0 && <li><Link className="underline" href="/parent/children/new">添加孩子</Link>，选年级和教材版本</li>}
            {providers === 0 && <li><Link className="underline" href="/parent/ai/providers/new">配置一个 AI 服务</Link>（填 API Key，会自动生成默认助手）</li>}
          </ol>
        </div>
      )}
      {providers > 0 && missingRoles.length > 0 && (
        <div className="card-flat border-bee bg-bee-soft text-sm font-bold">
          还没有配置这些角色的助手：{missingRoles.map((r) => ROLE_LABELS[r]).join("、")}。<Link className="underline" href="/parent/ai">去 AI 设置</Link>
        </div>
      )}

      {reports.map(({ child: c, r, st }) => {
        const rate = r.week.attempts ? Math.round((r.week.correct / r.week.attempts) * 100) : null;
        const activeThisWeek = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - i * 86400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
        const daysDone = activeThisWeek.filter((k) => r.daily.some((d) => d.total > 0 && k.endsWith(d.day))).length;
        const narrative = r.week.attempts === 0
          ? `${c.name} 这周还没有开始学习。`
          : `${c.name} 这周有 ${daysDone} 天在学习，做了 ${r.week.attempts} 题，正确率 ${rate}%${rate !== null && rate >= 80 ? "，状态不错" : rate !== null && rate >= 60 ? "，中等" : "，需要多陪一陪"}；新增 ${r.week.newMistakes} 道错题，消灭了 ${r.week.cleared} 道${r.weak.length ? `。最需要关注的是「${r.weak[0].name}」` : ""}。`;
        return (
          <section key={c.id} className="card">
            <div className="flex items-start gap-4 flex-wrap">
              <span className="text-5xl">{c.avatar}</span>
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-black text-xl">{c.name}</h2>
                  <span className="badge bg-gray-100 text-muted normal-case tracking-normal">{c.grade}年级{c.semester === 1 ? "上" : "下"}</span>
                  <span className="badge bg-berry-soft text-berry normal-case tracking-normal">🔥 连续 {r.streak} 天</span>
                  <span className="badge bg-bee-soft text-bee-dark normal-case tracking-normal">⭐ {r.stars}</span>
                </div>
                <p className="mt-2 font-bold leading-relaxed">{narrative}</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/parent/report/${c.id}`} className="btn-primary text-sm py-2">📊 学情报告</Link>
                <Link href={`/parent/children/${c.id}`} className="btn-secondary text-sm py-2">档案</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
              {[
                ["本周作答", `${r.week.attempts}`, "题"],
                ["正确率", rate === null ? "-" : `${rate}`, rate === null ? "" : "%"],
                ["练习", `${r.week.sets}`, "组"],
                ["拍作业", `${r.week.uploads}`, "次"],
                ["待消灭错题", `${r.mistakesOpen}`, "道"],
                ["今日学习", `${st.minutes}`, st.limit ? `/${st.limit} 分钟` : "分钟"],
              ].map(([k, v, u]) => (
                <div key={k} className="rounded-2xl bg-background px-3 py-3">
                  <p className="text-[11px] font-extrabold text-muted">{k}</p>
                  <p className="h-display text-2xl">{v}<span className="text-xs text-muted ml-1">{u}</span></p>
                </div>
              ))}
            </div>
            {r.weak.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="font-extrabold text-muted">薄弱：</span>
                {r.weak.slice(0, 4).map((w) => <span key={w.name} className="badge bg-berry-soft text-berry normal-case tracking-normal">{w.name} {w.score}</span>)}
              </div>
            )}
          </section>
        );
      })}

      <section>
        <h2 className="font-black text-lg mb-3">最近作业</h2>
        {uploads.length === 0 ? (
          <p className="text-muted text-sm font-bold">还没有上传过作业</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {uploads.map((u) => {
              const wrong = u.problems.filter((p) => p.attempts[0]?.isCorrect === false).length;
              return (
                <Link key={u.id} href={`/parent/uploads/${u.id}`} className="card-flat flex items-center gap-3 hover:border-brand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${u.filePath}`} alt="" className="w-14 h-14 rounded-xl object-cover border border-line" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold truncate">{u.child.avatar} {u.child.name} · {u.subject?.name ?? "未分类"}</p>
                    <p className="text-xs font-bold text-muted">{u.createdAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p className={`text-xs font-extrabold ${u.status === "failed" ? "text-berry" : wrong ? "text-berry" : "text-leaf-dark"}`}>{u.status === "graded" ? `${u.problems.length} 题，错 ${wrong} 题` : u.status === "failed" ? "批改失败" : "批改中"}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
