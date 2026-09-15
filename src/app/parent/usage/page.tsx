import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";

export default async function UsagePage() {
  const s = await requireParent();
  const since = daysAgo(30);
  const rows = await db.aiUsage.findMany({
    where: { provider: { familyId: s.familyId }, createdAt: { gte: since } },
    include: { provider: true, assistant: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const agg = new Map<string, { calls: number; input: number; output: number; fails: number }>();
  for (const r of rows) {
    const k = `${r.provider.name} / ${r.model}`;
    const a = agg.get(k) ?? { calls: 0, input: 0, output: 0, fails: 0 };
    a.calls++;
    a.input += r.inputTokens;
    a.output += r.outputTokens;
    if (!r.ok) a.fails++;
    agg.set(k, a);
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">最近 30 天用量</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1">服务 / 模型</th><th>调用</th><th>输入 tokens</th><th>输出 tokens</th><th>失败</th></tr></thead>
          <tbody>
            {[...agg.entries()].map(([k, v]) => (
              <tr key={k} className="border-t"><td className="py-1">{k}</td><td>{v.calls}</td><td>{v.input}</td><td>{v.output}</td><td className={v.fails ? "text-red-600" : ""}>{v.fails}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-2">最近调用</h2>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-gray-500"><th>时间</th><th>助手</th><th>模型</th><th>耗时</th><th>结果</th></tr></thead>
          <tbody>
            {rows.slice(0, 50).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1">{r.createdAt.toLocaleString("zh-CN")}</td><td>{r.assistant?.name ?? "-"}</td><td>{r.model}</td><td>{(r.latencyMs / 1000).toFixed(1)}s</td>
                <td className={r.ok ? "text-green-700" : "text-red-600"}>{r.ok ? "成功" : r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400_000);
}
