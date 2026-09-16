"use client";

import { useState } from "react";
import type { Lecture } from "@/lib/topics";
import { useSfx } from "./fx";

/**
 * 专题「讲一讲」：课前故事 → 知识导引 → 方法口诀 → 典题精讲（一例一练）→ 名师点拨。
 * 有缓存直接展示，没有则点按钮让 AI 生成一次。
 */
export function TopicLectureBox({ code, initial, accent = "brand", essay = false }: { code: string; initial: Lecture | null; accent?: "brand" | "grape" | "sky" | "leaf"; essay?: boolean }) {
  const [lecture, setLecture] = useState<Lecture | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<number, number>>({});
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const play = useSfx();

  async function gen() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/topic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, what: "lecture" }) });
      const j = (await r.json()) as { lecture?: Lecture; error?: string };
      if (!r.ok || !j.lecture) throw new Error(j.error ?? "生成失败");
      setLecture(j.lecture);
      play("win");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const soft = accent === "grape" ? "bg-grape-soft" : accent === "sky" ? "bg-sky-soft" : accent === "leaf" ? "bg-leaf-soft" : "bg-brand-soft";
  const text = accent === "grape" ? "text-grape" : accent === "sky" ? "text-sky-dark" : accent === "leaf" ? "text-leaf-dark" : "text-brand-dark";
  const btn = accent === "grape" ? "btn bg-grape text-white shadow-[0_4px_0_0_#7c3aed] active:translate-y-[4px] active:shadow-none" : accent === "sky" ? "btn-sky" : accent === "leaf" ? "btn-leaf" : "btn-primary";

  if (!lecture) {
    return (
      <div className="text-center py-4">
        <button type="button" className={btn} disabled={busy} onClick={gen}>{busy ? "橙橙正在备课，约 30 秒…" : "📖 让橙橙讲一讲"}</button>
        <p className="text-xs font-bold text-muted mt-2">第一次需要生成，之后直接看</p>
        {err && <p className="text-berry text-sm font-bold mt-2">{err}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {lecture.story && (
        <div className="rounded-2xl bg-bee-soft/60 p-4">
          <p className="text-xs font-extrabold text-bee-dark mb-1">📖 课前故事</p>
          <p className="font-bold leading-relaxed">{lecture.story}</p>
        </div>
      )}
      <div>
        <p className="text-xs font-extrabold text-muted mb-1">🧭 知识导引</p>
        <p className="font-bold leading-relaxed text-lg">{lecture.intro}</p>
      </div>
      <div className={`rounded-2xl ${soft} p-4`}>
        <p className={`text-xs font-extrabold ${text} mb-2`}>🧠 方法口诀</p>
        <ol className="space-y-1.5">
          {lecture.methods.map((m, i) => (
            <li key={i} className="flex gap-2 font-bold"><span className={`w-6 h-6 rounded-full bg-white ${text} flex items-center justify-center text-xs shrink-0`}>{i + 1}</span><span>{m}</span></li>
          ))}
        </ol>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-extrabold text-muted">✏️ 典题精讲 · 一例一练</p>
        {lecture.examples.map((ex, i) => {
          const shown = reveal[i] ?? 0;
          const finished = shown >= ex.steps.length;
          return (
            <div key={i} className="card-flat space-y-2">
              <p className="font-extrabold whitespace-pre-wrap">例 {i + 1}：{ex.q}</p>
              <ol className="space-y-1">
                {ex.steps.slice(0, shown).map((st, k) => (
                  <li key={k} className="flex gap-2 text-sm font-bold text-gray-700 anim-pop"><span className="text-muted shrink-0">第 {k + 1} 步</span><span className="flex-1">{st}</span></li>
                ))}
              </ol>
              {!finished ? (
                <button type="button" className="btn-secondary text-sm py-2" onClick={() => { play("tap"); setReveal((r) => ({ ...r, [i]: shown + 1 })); }}>
                  {shown === 0 ? "👀 一步一步看" : "下一步 ➡️"}
                </button>
              ) : (
                <p className="font-black text-leaf-dark anim-pop">{essay ? "点评" : "答案"}：{ex.answer}</p>
              )}
              {finished && ex.practice && (
                <div className={`rounded-2xl ${soft} p-3 mt-1`}>
                  <p className={`text-xs font-extrabold ${text} mb-1`}>{essay ? "✍️ 你来写一写" : "🙋 你来试一试"}</p>
                  <p className="font-bold whitespace-pre-wrap">{ex.practice.q}</p>
                  {tried[i] ? (
                    <p className="text-sm font-black text-leaf-dark mt-1 anim-pop">{essay ? "要点" : "答案"}：{ex.practice.answer}</p>
                  ) : (
                    <button type="button" className="btn-ghost text-sm mt-1" onClick={() => { play("tap"); setTried((t) => ({ ...t, [i]: true })); }}>{essay ? "看要点提示" : "先自己算，再看答案"}</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-sm font-bold"><span className="badge bg-bee-soft text-bee-dark mr-1">名师点拨</span>{lecture.tips}</p>
    </div>
  );
}
