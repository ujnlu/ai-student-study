import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { decrypt, maskKey } from "@/lib/crypto";
import { ROLE_LABELS } from "@/lib/ai/prompts";
import { deleteAssistantAction, deleteProviderAction } from "@/app/actions/ai";
import { ProviderTestButton } from "@/components/provider-test";

export default async function AiSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requireParent();
  const { error } = await searchParams;
  const [providers, assistants] = await Promise.all([
    db.aiProvider.findMany({ where: { familyId: s.familyId }, orderBy: { createdAt: "asc" } }),
    db.aiAssistant.findMany({ where: { familyId: s.familyId }, include: { provider: true }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
  ]);
  return (
    <div className="space-y-8">
      {error && <p className="card bg-red-50 border-red-200 text-red-700">{error}</p>}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold">AI 服务（Provider）</h1>
          <Link href="/parent/ai/providers/new" className="btn-primary">+ 添加服务</Link>
        </div>
        {providers.length === 0 && <p className="text-gray-500 text-sm">先添加一个服务：Anthropic Claude，或任何 OpenAI 兼容接口（DeepSeek、通义、智谱、Ollama…）。</p>}
        <div className="grid md:grid-cols-2 gap-3">
          {providers.map((p) => (
            <div key={p.id} className="card">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{p.name}</p>
                {p.isDefault && <span className="badge bg-orange-100 text-orange-800">默认</span>}
                <span className="badge bg-gray-100 text-gray-600">{p.kind}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">模型：{p.defaultModel}</p>
              <p className="text-xs text-gray-500">Key：{maskKey(safeDecrypt(p.apiKeyEnc))} {p.baseUrl ? `· ${p.baseUrl}` : ""}</p>
              <div className="mt-3 flex gap-2 flex-wrap items-center">
                <ProviderTestButton providerId={p.id} />
                <Link href={`/parent/ai/providers/${p.id}`} className="btn-secondary text-sm">编辑</Link>
                <form action={deleteProviderAction}><input type="hidden" name="id" value={p.id} /><button className="btn-danger text-sm">删除</button></form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold">助手（角色 + 提示词 + 模型）</h2>
          <Link href="/parent/ai/assistants/new" className="btn-primary" aria-disabled={providers.length === 0}>+ 添加助手</Link>
        </div>
        <div className="space-y-3">
          {assistants.map((a) => (
            <div key={a.id} className="card flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge bg-blue-50 text-blue-700">{ROLE_LABELS[a.role as keyof typeof ROLE_LABELS] ?? a.role}</span>
                  <p className="font-semibold">{a.name}</p>
                  {a.isDefault && <span className="badge bg-orange-100 text-orange-800">该角色默认</span>}
                </div>
                <p className="text-sm text-gray-600 mt-1">{a.provider.name} · {a.model || a.provider.defaultModel} · temp {a.temperature}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{a.systemPrompt}</p>
              </div>
              <Link href={`/parent/ai/assistants/${a.id}`} className="btn-secondary text-sm">编辑</Link>
              <form action={deleteAssistantAction}><input type="hidden" name="id" value={a.id} /><button className="btn-danger text-sm">删除</button></form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function safeDecrypt(v: string) {
  try {
    return decrypt(v);
  } catch {
    return "********";
  }
}
