import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { DEFAULT_PROMPTS, ROLE_LABELS, type AssistantRole } from "@/lib/ai/prompts";
import { restorePromptVersionAction, saveAssistantAction } from "@/app/actions/ai";

export default async function AssistantEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ role?: string }> }) {
  const s = await requireParent();
  const { id } = await params;
  const { role: roleParam } = await searchParams;
  const a = id === "new" ? null : await db.aiAssistant.findFirst({ where: { id, familyId: s.familyId }, include: { versions: { orderBy: { createdAt: "desc" } } } });
  const providers = await db.aiProvider.findMany({ where: { familyId: s.familyId } });
  const role = (a?.role ?? roleParam ?? "tutor") as AssistantRole;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <form action={saveAssistantAction} className="card lg:col-span-2 space-y-4">
        <h1 className="text-2xl font-bold">{a ? "编辑助手" : "添加助手"}</h1>
        {a && <input type="hidden" name="id" value={a.id} />}
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">名称</label><input name="name" defaultValue={a?.name ?? ""} className="input" required /></div>
          <div>
            <label className="label">角色</label>
            <select name="role" defaultValue={role} className="input">
              {(Object.keys(ROLE_LABELS) as AssistantRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">AI 服务</label>
            <select name="providerId" defaultValue={a?.providerId ?? providers.find((p) => p.isDefault)?.id} className="input" required>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.defaultModel}）</option>)}
            </select>
          </div>
          <div><label className="label">模型（留空用服务默认）</label><input name="model" defaultValue={a?.model ?? ""} className="input" /></div>
          <div><label className="label">temperature（Claude 5 系列忽略）</label><input name="temperature" type="number" step="0.1" min="0" max="2" defaultValue={a?.temperature ?? 0.3} className="input" /></div>
          <div><label className="label">最大输出 tokens</label><input name="maxTokens" type="number" defaultValue={a?.maxTokens ?? 8000} className="input" /></div>
        </div>
        <div>
          <label className="label">系统提示词（可用变量：{"{childName} {grade} {gradeText} {semester} {subject} {textbook} {region} {problem} {childAnswer} {correctAnswer} {solution}"}）</label>
          <textarea name="systemPrompt" rows={18} defaultValue={a?.systemPrompt ?? DEFAULT_PROMPTS[role]} className="input font-mono text-sm" />
        </div>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="isDefault" defaultChecked={a?.isDefault ?? true} /> 设为该角色默认</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="supportVision" defaultChecked={a?.supportVision ?? true} /> 模型支持图片</label>
        </div>
        <button className="btn-primary">保存</button>
      </form>

      <aside className="space-y-4">
        <div className="card">
          <h2 className="font-semibold mb-2">默认模板</h2>
          <p className="text-xs text-gray-500 mb-2">想恢复默认提示词，复制下面内容即可。</p>
          <details><summary className="text-sm cursor-pointer">查看「{ROLE_LABELS[role]}」默认模板</summary><pre className="text-xs whitespace-pre-wrap mt-2 bg-gray-50 p-2 rounded-lg">{DEFAULT_PROMPTS[role]}</pre></details>
        </div>
        {a && a.versions.length > 0 && (
          <div className="card">
            <h2 className="font-semibold mb-2">历史版本</h2>
            <ul className="space-y-2">
              {a.versions.map((v) => (
                <li key={v.id} className="text-xs border rounded-lg p-2">
                  <p className="text-gray-500">{v.createdAt.toLocaleString("zh-CN")} {v.note}</p>
                  <details><summary className="cursor-pointer">内容</summary><pre className="whitespace-pre-wrap mt-1">{v.systemPrompt}</pre></details>
                  <form action={restorePromptVersionAction} className="mt-1"><input type="hidden" name="versionId" value={v.id} /><button className="btn-secondary text-xs py-1">回滚到这个版本</button></form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
