"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * 动画讲解入口。已有讲解时（existingId）直接跳转，不再请求模型；
 * 否则调用接口（接口内部也会按题目内容复用已生成的讲解），只有真的没有时才生成。
 */
export function ExplainButton({
  problemId,
  childId,
  existingId,
  label = "🎬 动画讲解",
  className = "btn-primary text-sm",
  force = false,
}: {
  problemId: string;
  childId?: string;
  existingId?: string | null;
  label?: string;
  className?: string;
  force?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (existingId && !force) {
    return (
      <Link href={`/explain/${existingId}`} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await fetch(`/api/problems/${problemId}/explain`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ childId, force }),
            });
            const j = (await r.json()) as { id?: string; error?: string; cached?: boolean };
            if (!r.ok || !j.id) throw new Error(j.error ?? "生成失败");
            router.push(`/explain/${j.id}`);
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
      >
        {busy ? "老师正在画图，约 30-60 秒…" : label}
      </button>
      {err && <span className="text-xs text-red-600 mt-1">{err}</span>}
    </span>
  );
}
