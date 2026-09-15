import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { saveProviderAction } from "@/app/actions/ai";

const PRESETS = [
  { label: "Anthropic Claude（官方）", kind: "anthropic", baseUrl: "", model: "claude-opus-5" },
  { label: "DeepSeek", kind: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { label: "通义千问（DashScope）", kind: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-vl-max" },
  { label: "智谱 GLM", kind: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4v-plus" },
  { label: "Moonshot Kimi", kind: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k-vision-preview" },
  { label: "Ollama 本地", kind: "openai-compatible", baseUrl: "http://localhost:11434/v1", model: "qwen2.5vl" },
];

export default async function ProviderEditPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireParent();
  const { id } = await params;
  const p = id === "new" ? null : await db.aiProvider.findFirst({ where: { id, familyId: s.familyId } });
  return (
    <form action={saveProviderAction} className="card max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{p ? "编辑 AI 服务" : "添加 AI 服务"}</h1>
      {p && <input type="hidden" name="id" value={p.id} />}

      {!p && (
        <div className="text-sm text-gray-600">
          <p className="mb-1">常用配置参考（手动填到下面）：</p>
          <ul className="grid sm:grid-cols-2 gap-1 text-xs">
            {PRESETS.map((x) => (
              <li key={x.label} className="bg-gray-50 rounded-lg px-2 py-1">
                <b>{x.label}</b>：{x.kind} · {x.baseUrl || "默认地址"} · {x.model}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div><label className="label">名称</label><input name="name" defaultValue={p?.name ?? ""} className="input" placeholder="如：Claude 官方" required /></div>
      <div>
        <label className="label">接口类型</label>
        <select name="kind" defaultValue={p?.kind ?? "anthropic"} className="input">
          <option value="anthropic">Anthropic（Claude 官方 SDK）</option>
          <option value="openai-compatible">OpenAI 兼容（DeepSeek / 通义 / 智谱 / Kimi / Ollama …）</option>
        </select>
      </div>
      <div>
        <label className="label">Base URL（Anthropic 官方可留空；OpenAI 兼容填到 /v1）</label>
        <input name="baseUrl" defaultValue={p?.baseUrl ?? ""} className="input" placeholder="https://api.deepseek.com/v1" />
      </div>
      <div>
        <label className="label">API Key {p && <span className="text-gray-400">（留空表示不修改）</span>}</label>
        <input name="apiKey" type="password" className="input" autoComplete="off" />
      </div>
      <div>
        <label className="label">默认模型（批改作业需要支持图片的模型）</label>
        <input name="defaultModel" defaultValue={p?.defaultModel ?? "claude-opus-5"} className="input" required />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" defaultChecked={p?.isDefault ?? false} /> 设为默认服务</label>
      <button className="btn-primary">保存</button>
      <p className="text-xs text-gray-500">Key 用 AES-256-GCM 加密后存入数据库，只在服务端解密。保存后可在列表里点「测试连通」。</p>
    </form>
  );
}
