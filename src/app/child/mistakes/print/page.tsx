import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { MathText } from "@/components/math-text";

/** 最近 N 天的起点；0 表示不限 */
function sinceDate(days: number) {
  if (!(days > 0)) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_OPTIONS = [
  { v: "7", label: "最近 7 天" },
  { v: "30", label: "最近 30 天" },
  { v: "", label: "全部" },
];

export default async function MistakesPrintPage({ searchParams }: { searchParams: Promise<{ subject?: string; days?: string }> }) {
  const { child } = await requireChild();
  const { subject, days } = await searchParams;
  const since = sinceDate(days ? Number(days) : 0);

  const [subjects, list] = await Promise.all([
    db.subject.findMany({ orderBy: { sortOrder: "asc" } }),
    db.mistakeEntry.findMany({
      where: {
        childId: child.id,
        status: { not: "cleared" },
        ...(subject ? { problem: { subjectId: subject } } : {}),
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      include: { problem: { include: { subject: true, knowledgePoint: true } } },
      orderBy: [{ problem: { subjectId: "asc" } }, { createdAt: "asc" }],
    }),
  ]);

  const query = (patch: { subject?: string; days?: string }) => {
    const p = new URLSearchParams();
    const sub = patch.subject ?? subject ?? "";
    const d = patch.days ?? days ?? "";
    if (sub) p.set("subject", sub);
    if (d) p.set("days", d);
    const q = p.toString();
    return `/child/mistakes/print${q ? `?${q}` : ""}`;
  };
  const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  const subjectName = subject ? (subjects.find((s) => s.id === subject)?.name ?? "") : "全部学科";

  return (
    <div className="print-root space-y-4">
      <style>{`
        @media print {
          header, nav, .no-print { display: none !important; }
          main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
          body { background: #fff !important; color: #000 !important; }
          .print-root { color: #000; }
          .print-problem { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print card space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">🖨️ 打印错题</h1>
          <Link href="/child/mistakes" className="text-sm text-gray-500 underline">返回错题本</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={query({ subject: "" })} className={!subject ? "chip-on" : "chip"}>全部学科</Link>
          {subjects.map((s) => (
            <Link key={s.id} href={query({ subject: s.id })} className={subject === s.id ? "chip-on" : "chip"}>{s.name}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((o) => (
            <Link key={o.v} href={query({ days: o.v })} className={(days ?? "") === o.v ? "chip-on" : "chip"}>{o.label}</Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <PrintButton />
          <span className="text-sm text-gray-500">共 {list.length} 道题，答案在最后一页</span>
        </div>
      </div>

      <div className="bg-white text-black rounded-3xl border-2 border-line p-6 print:border-0 print:p-0 print:rounded-none">
        <div className="border-b-2 border-black pb-3 mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-bold">{child.name} 的错题重做</h2>
          <p className="text-sm">
            {subjectName} · {today} · 共 {list.length} 题
          </p>
        </div>

        {list.length === 0 && <p className="py-10 text-center text-gray-500">这段时间没有错题，太棒了！🎉</p>}

        <ol className="space-y-2">
          {list.map((m, i) => (
            <li key={m.id} className="print-problem border-b border-dashed border-gray-300 pb-3">
              <div className="flex gap-3">
                <span className="font-bold text-lg w-8 shrink-0">{i + 1}.</span>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1">
                    {m.problem.subject?.name ?? ""}
                    {m.problem.knowledgePoint ? ` · ${m.problem.knowledgePoint.name}` : ""}
                  </p>
                  <MathText as="p" className="text-lg whitespace-pre-wrap leading-relaxed" text={m.problem.stem} />
                </div>
              </div>
              <div className="ml-11 min-h-36" aria-hidden="true" />
            </li>
          ))}
        </ol>

        {list.length > 0 && (
          <div style={{ breakBefore: "page" }} className="mt-10 pt-4 border-t-2 border-black">
            <h2 className="text-xl font-bold mb-3">答案</h2>
            <ol className="space-y-2">
              {list.map((m, i) => (
                <li key={m.id} className="flex gap-3">
                  <span className="font-bold w-8 shrink-0">{i + 1}.</span>
                  <div className="flex-1">
                    <p className="font-semibold whitespace-pre-wrap">{m.problem.answer?.trim() || "（暂无答案）"}</p>
                    {m.problem.solution && <p className="text-sm text-gray-600 whitespace-pre-wrap mt-0.5">{m.problem.solution}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="no-print flex justify-center">
        <PrintButton className="btn-secondary" />
      </div>
    </div>
  );
}
