"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExplainButton } from "./explain-button";

type Item = { index: number; stem: string };
type Feedback = { isCorrect: boolean; correctAnswer: string; solution: string | null; problemId: string };

export function PracticePlayer({ setId, items, timeLimitSec, title }: { setId: string; items: Item[]; timeLimitSec: number | null; title: string }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const elapsedRef = useRef(0);
  const submitRef = useRef<() => Promise<void>>(async () => {});
  const advanceTimer = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (timeLimitSec && elapsedRef.current >= timeLimitSec) void submitRef.current();
    }, 1000);
    return () => window.clearInterval(t);
  }, [timeLimitSec]);
  useEffect(() => {
    inputRef.current?.focus();
  }, [i, feedback]);
  useEffect(() => () => { if (advanceTimer.current) window.clearTimeout(advanceTimer.current); }, []);

  const left = timeLimitSec ? timeLimitSec - elapsed : null;
  const item = items[i];
  const isLast = i === items.length - 1;
  const answeredCount = Object.keys(results).length;
  const correctCount = Object.values(results).filter(Boolean).length;

  /** 交卷：未答的题按错处理 */
  async function submit() {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    try {
      const r = await fetch(`/api/practice/${setId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ durationSec: elapsedRef.current }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "提交失败");
      router.push(`/child/practice/${setId}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
      submitted.current = false;
    }
  }
  useEffect(() => {
    submitRef.current = submit;
  });

  function goNext() {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    setFeedback(null);
    setInput("");
    if (isLast) void submit();
    else setI(i + 1);
  }

  /** 答完一题：立即判对错 */
  async function check() {
    if (busy || feedback) return;
    const answer = input.trim();
    if (!answer) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/practice/${setId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index: item.index, answer }),
      });
      const j = (await r.json()) as Feedback & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "判分失败");
      setFeedback(j);
      setResults((m) => ({ ...m, [item.index]: j.isCorrect }));
      // 答对了：1 秒后自动下一题；答错了：停下来看答案和讲解
      if (j.isCorrect && !isLast) advanceTimer.current = window.setTimeout(() => { setFeedback(null); setInput(""); setI((x) => x + 1); }, 1000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function tap(ch: string) {
    if (feedback) return;
    setInput((v) => v + ch);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>{title}</span>
        <span>
          第 {i + 1}/{items.length} 题 · 对 <b className="text-green-600">{correctCount}</b> 错 <b className="text-red-600">{answeredCount - correctCount}</b>
          {left !== null && <b className={`ml-3 ${left < 30 ? "text-red-600" : ""}`}>⏱ {Math.max(0, left)}s</b>}
        </span>
      </div>

      <div className={`card text-center py-8 transition-colors ${feedback ? (feedback.isCorrect ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200") : ""}`}>
        <p className="text-4xl font-bold tracking-wide whitespace-pre-wrap">{item.stem}</p>
        <div className="mt-6 mx-auto max-w-xs">
          <input
            ref={inputRef}
            className={`input text-center text-3xl font-semibold ${feedback ? (feedback.isCorrect ? "border-green-400 text-green-700" : "border-red-400 text-red-600 line-through") : ""}`}
            value={input}
            inputMode="decimal"
            readOnly={!!feedback}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (feedback) goNext();
                else void check();
              }
            }}
            placeholder="答案"
          />
        </div>

        {feedback && (
          <div className="mt-4 space-y-2">
            {feedback.isCorrect ? (
              <p className="text-2xl text-green-600 font-bold">✓ 答对啦！</p>
            ) : (
              <>
                <p className="text-2xl text-red-600 font-bold">✗ 不对哦</p>
                <p className="text-lg">正确答案是 <b className="text-green-700 text-2xl">{feedback.correctAnswer}</b></p>
                {feedback.solution && <p className="text-sm text-gray-600">{feedback.solution}</p>}
                <div className="flex justify-center gap-2 pt-1">
                  <ExplainButton problemId={feedback.problemId} label="🎬 看动画讲解" className="btn-secondary text-sm" />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 sm:hidden">
        {["7", "8", "9", "⌫", "4", "5", "6", "/", "1", "2", "3", ".", "0", "……", "-", "✓"].map((k) => (
          <button
            key={k}
            type="button"
            className={`btn-secondary text-xl py-3 ${k === "✓" ? "bg-brand text-white border-none" : ""}`}
            disabled={!!feedback && k !== "✓"}
            onClick={() => (k === "⌫" ? setInput((v) => v.slice(0, -1)) : k === "✓" ? (feedback ? goNext() : void check()) : tap(k))}
          >
            {k === "✓" ? (feedback ? (isLast ? "交卷" : "下一题") : "确定") : k}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {feedback ? (
          <button type="button" className="btn-primary flex-1 text-lg" disabled={busy} onClick={goNext}>
            {isLast ? (busy ? "提交中…" : "看成绩 🏁") : "下一题 ➡️"}
          </button>
        ) : (
          <button type="button" className="btn-primary flex-1 text-lg" disabled={busy || !input.trim()} onClick={() => void check()}>
            {busy ? "判分中…" : "确定 ✓"}
          </button>
        )}
        {!feedback && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => { if (confirm("还有题没做，确定交卷吗？")) void submit(); }}>
            提前交卷
          </button>
        )}
      </div>
      {err && <p className="text-red-600 text-sm">{err}</p>}
    </div>
  );
}
