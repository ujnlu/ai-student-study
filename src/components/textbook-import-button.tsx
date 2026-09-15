"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type St = { status: string; progress?: number; error?: string | null; pageCount?: number };

export function TextbookImportButton({ smarteduId, initial }: { smarteduId: string; initial: St }) {
  const router = useRouter();
  const [st, setSt] = useState<St>(initial);
  const busy = st.status === "downloading" || st.status === "extracting";

  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(async () => {
      const r = await fetch(`/api/textbooks/${smarteduId}/status`);
      const j = (await r.json()) as St;
      setSt(j);
      if (j.status === "ready" || j.status === "failed") {
        window.clearInterval(t);
        router.refresh();
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [busy, smarteduId, router]);

  async function start() {
    setSt({ status: "downloading", progress: 0 });
    await fetch("/api/textbooks/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ smarteduId }),
    });
  }

  if (busy) {
    return (
      <span className="text-xs text-blue-700">
        {st.status === "downloading" ? "下载中" : "提取文字中"} {st.progress ?? 0}%
      </span>
    );
  }
  if (st.status === "ready") {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="badge bg-green-100 text-green-700">已导入 {st.pageCount} 页</span>
        <button type="button" onClick={start} className="text-gray-500 underline">重新导入</button>
      </span>
    );
  }
  if (st.status === "failed") {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="text-red-600" title={st.error ?? ""}>失败</span>
        <button type="button" onClick={start} className="btn-secondary text-xs py-1">重试</button>
      </span>
    );
  }
  return (
    <button type="button" onClick={start} className="btn-primary text-xs py-1">
      ⬇️ 导入
    </button>
  );
}
