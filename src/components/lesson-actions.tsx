"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PreviewCard } from "@/lib/lesson-guide";
import { useSfx } from "./fx";

/** 预习卡：有缓存直接展示，没有则点按钮生成 */
export function PreviewCardBox({ chapterId, initial }: { chapterId: string; initial: PreviewCard | null }) {
  const [card, setCard] = useState<PreviewCard | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const play = useSfx();

  async function gen() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/lesson", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chapterId, what: "preview" }) });
      const j = (await r.json()) as { preview?: PreviewCard; error?: string };
      if (!r.ok || !j.preview) throw new Error(j.error ?? "生成失败");
      setCard(j.preview);
      play("win");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!card) {
    return (
      <div className="text-center py-4">
        <button type="button" className="btn-sky" disabled={busy} onClick={gen}>{busy ? "橙橙正在翻课本，约 20 秒…" : "📖 生成预习卡"}</button>
        {err && <p className="text-berry text-sm font-bold mt-2">{err}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="font-bold leading-relaxed">{card.summary}</p>
      <div>
        <p className="text-xs font-extrabold text-muted mb-1">关键点</p>
        <ul className="space-y-1">
          {card.keyPoints.map((k, i) => <li key={i} className="flex gap-2 font-bold"><span className="text-sky">●</span><span>{k}</span></li>)}
        </ul>
      </div>
      <div className="rounded-2xl bg-sky-soft p-3">
        <p className="text-xs font-extrabold text-sky-dark mb-1">课本例题</p>
        <p className="font-bold whitespace-pre-wrap">{card.example}</p>
      </div>
      <p className="text-sm font-bold"><span className="badge bg-bee-soft text-bee-dark mr-1">小窍门</span>{card.tips}</p>
      <div>
        <p className="text-xs font-extrabold text-muted mb-1">先想一想</p>
        <ul className="space-y-2">
          {card.questions.map((q, i) => (
            <li key={i} className="card-flat">
              <p className="font-bold">{i + 1}. {q.q}</p>
              {reveal[i] ? <p className="text-leaf-dark font-bold mt-1">答：{q.a}</p> : <button type="button" className="btn-ghost text-sm mt-1" onClick={() => setReveal((r) => ({ ...r, [i]: true }))}>看答案</button>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 微课动画：有缓存直接跳转，否则生成后跳转 */
export function MicroLessonButton({ chapterId, existingId }: { chapterId: string; existingId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (existingId) {
    return <a href={`/explain/${existingId}`} className="btn-primary">🎬 看微课动画</a>;
  }
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await fetch("/api/lesson", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chapterId, what: "micro" }) });
            const j = (await r.json()) as { explanationId?: string; error?: string };
            if (!r.ok || !j.explanationId) throw new Error(j.error ?? "生成失败");
            router.push(`/explain/${j.explanationId}`);
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
      >
        {busy ? "橙橙正在画微课，约 1 分钟…" : "🎬 生成微课动画"}
      </button>
      {err && <span className="text-berry text-xs font-bold mt-1">{err}</span>}
    </span>
  );
}
