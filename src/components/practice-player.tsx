"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExplainButton } from "./explain-button";
import { Mascot } from "./mascot";
import { useSfx } from "./fx";

type Item = { index: number; stem: string };
type Feedback = { isCorrect: boolean; correctAnswer: string; solution: string | null; problemId: string };

export function PracticePlayer({ setId, items, timeLimitSec, title }: { setId: string; items: Item[]; timeLimitSec: number | null; title: string }) {
  const router = useRouter();
  const play = useSfx();
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
  const pct = Math.round((answeredCount / items.length) * 100);

  async function submit() {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    try {
      const r = await fetch(`/api/practice/${setId}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ durationSec: elapsedRef.current }) });
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

  async function check() {
    if (busy || feedback) return;
    const answer = input.trim();
    if (!answer) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/practice/${setId}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index: item.index, answer }) });
      const j = (await r.json()) as Feedback & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "判分失败");
      setFeedback(j);
      setResults((m) => ({ ...m, [item.index]: j.isCorrect }));
      play(j.isCorrect ? "correct" : "wrong");
      if (j.isCorrect && !isLast) advanceTimer.current = window.setTimeout(() => { setFeedback(null); setInput(""); setI((x) => x + 1); }, 1000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function tap(ch: string) {
    if (feedback) return;
    play("tap");
    setInput((v) => v + ch);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex justify-between text-xs font-extrabold text-muted mb-1">
            <span>{title}</span>
            <span>{i + 1} / {items.length}</span>
          </div>
          <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
        </div>
        {left !== null && <span className={`badge text-sm py-1 normal-case tracking-normal ${left < 30 ? "bg-berry-soft text-berry" : "bg-gray-100 text-muted"}`}>⏱ {Math.max(0, left)}s</span>}
      </div>
      <div className="flex gap-2 text-xs font-extrabold">
        <span className="badge bg-leaf-soft text-leaf-dark">✓ {correctCount}</span>
        <span className="badge bg-berry-soft text-berry">✗ {answeredCount - correctCount}</span>
      </div>

      <div className={`card text-center py-8 transition-colors border-b-8 ${feedback ? (feedback.isCorrect ? "bg-leaf-soft border-leaf border-b-leaf-dark anim-pop" : "bg-berry-soft border-berry border-b-berry-dark anim-shake") : "border-b-line"}`}>
        <p className="h-display text-5xl tracking-wide whitespace-pre-wrap leading-tight">{item.stem}</p>
        <div className="mt-6 mx-auto max-w-xs">
          <input
            ref={inputRef}
            className={`input text-center text-4xl font-black py-3 ${feedback ? (feedback.isCorrect ? "border-leaf text-leaf-dark" : "border-berry text-berry line-through") : ""}`}
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
            placeholder="?"
          />
        </div>

        {feedback && (
          <div className="mt-4 flex items-center justify-center gap-4">
            <Mascot mood={feedback.isCorrect ? "cheer" : "think"} size={72} />
            <div className="text-left">
              {feedback.isCorrect ? (
                <p className="h-display text-2xl text-leaf-dark">答对啦！+1 ⭐</p>
              ) : (
                <>
                  <p className="h-display text-2xl text-berry">不对哦</p>
                  <p className="font-bold">正确答案 <b className="text-leaf-dark text-2xl">{feedback.correctAnswer}</b></p>
                  {feedback.solution && <p className="text-xs font-bold text-muted mt-1 max-w-xs">{feedback.solution}</p>}
                  <div className="mt-2"><ExplainButton problemId={feedback.problemId} label="🎬 看动画讲解" className="btn-secondary text-sm py-2" /></div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 sm:hidden">
        {["7", "8", "9", "⌫", "4", "5", "6", "/", "1", "2", "3", ".", "0", "……", "-", "✓"].map((k) => (
          <button
            key={k}
            type="button"
            className={`${k === "✓" ? "btn-leaf" : "btn-secondary"} text-2xl py-3`}
            disabled={!!feedback && k !== "✓"}
            onClick={() => (k === "⌫" ? setInput((v) => v.slice(0, -1)) : k === "✓" ? (feedback ? goNext() : void check()) : tap(k))}
          >
            {k === "✓" ? (feedback ? (isLast ? "交卷" : "下一题") : "确定") : k}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {feedback ? (
          <button type="button" className="btn-primary flex-1 text-lg py-4" disabled={busy} onClick={goNext}>
            {isLast ? (busy ? "提交中…" : "看成绩 🏁") : "下一题 ➡️"}
          </button>
        ) : (
          <button type="button" className="btn-leaf flex-1 text-lg py-4" disabled={busy || !input.trim()} onClick={() => void check()}>
            {busy ? "判分中…" : "确定 ✓"}
          </button>
        )}
        {!feedback && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (confirm("还有题没做，确定交卷吗？")) void submit(); }}>提前交卷</button>
        )}
      </div>
      {err && <p className="text-berry text-sm font-bold">{err}</p>}
    </div>
  );
}
