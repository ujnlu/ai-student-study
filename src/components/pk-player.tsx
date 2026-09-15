"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { Confetti, useSfx } from "@/components/fx";
import { StartFlowButton } from "@/components/start-flow-button";

type Item = { index: number; stem: string };
type Feedback = { isCorrect: boolean; correctAnswer: string };
type Phase = "ready" | "countdown" | "play" | "finishing" | "result";
type Result = { win: boolean; correct: number; total: number; oppReached: number; childFinished: boolean; stars: number; durationSec: number };

const KEYS = ["7", "8", "9", "⌫", "4", "5", "6", "/", "1", "2", "3", ".", "0", "……", "-", "✓"];

/**
 * 口算 PK：左边是我，右边是橙橙。橙橙按固定节奏"答题"，我每答一题立即判分。
 * 我先做完（正确率 ≥ 70%）或答对数超过橙橙已做的题数就算赢。
 */
export function PkPlayer({ setId, items, opponentSpeedSec, childName, childAvatar }: { setId: string; items: Item[]; opponentSpeedSec: number; childName: string; childAvatar: string }) {
  const play = useSfx();
  const total = items.length;

  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(3);
  const [i, setI] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [opp, setOpp] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const endedRef = useRef(false);
  const oppRef = useRef(0);
  const resultsRef = useRef<Record<number, boolean>>({});
  const elapsedRef = useRef(0);
  const inflight = useRef<Promise<unknown> | null>(null);
  const timers = useRef<{ opp: number | null; advance: number | null; tick: number | null }>({ opp: null, advance: null, tick: null });
  const finishRef = useRef<(who: "child" | "opponent") => Promise<void>>(async () => {});

  function clearTimers() {
    const t = timers.current;
    if (t.opp) window.clearTimeout(t.opp);
    if (t.advance) window.clearTimeout(t.advance);
    if (t.tick) window.clearInterval(t.tick);
    timers.current = { opp: null, advance: null, tick: null };
  }
  useEffect(() => () => clearTimers(), []);
  useEffect(() => {
    if (phase === "play") inputRef.current?.focus();
  }, [phase, i, feedback]);

  /** 橙橙做下一题：每题 opponentSpeedSec 秒，偶尔"卡壳"多想 1~2 秒 */
  function scheduleOpponent() {
    const jitter = Math.random() < 0.3 ? 1000 + Math.random() * 1000 : 0;
    timers.current.opp = window.setTimeout(() => {
      if (endedRef.current) return;
      oppRef.current += 1;
      setOpp(oppRef.current);
      if (oppRef.current >= total) void finishRef.current("opponent");
      else scheduleOpponent();
    }, opponentSpeedSec * 1000 + jitter);
  }

  function start() {
    play("tap");
    setPhase("countdown");
    setCount(3);
    let n = 3;
    timers.current.tick = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (timers.current.tick) window.clearInterval(timers.current.tick);
        setPhase("play");
        timers.current.tick = window.setInterval(() => {
          elapsedRef.current += 1;
          setElapsed(elapsedRef.current);
        }, 1000);
        scheduleOpponent();
      } else {
        setCount(n);
        play("tap");
      }
    }, 900);
  }

  /** 结束：交卷、判胜负、赢了加星 */
  async function finish(who: "child" | "opponent") {
    if (endedRef.current) return;
    endedRef.current = true;
    clearTimers();
    setPhase("finishing");
    setFeedback(null);
    try {
      await inflight.current?.catch(() => {});
      const correct = Object.values(resultsRef.current).filter(Boolean).length;
      const oppReached = who === "opponent" ? total : oppRef.current;
      const childFinished = who === "child";
      const win = (childFinished && oppReached < total && correct >= Math.ceil(total * 0.7)) || correct > oppReached;
      const durationSec = elapsedRef.current;
      const r = await fetch(`/api/practice/${setId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: {}, durationSec }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "提交失败");
      let bonus = 0;
      if (win) {
        const w = await fetch(`/api/pk/${setId}/win`, { method: "POST" });
        if (w.ok) bonus = ((await w.json()) as { awarded?: number }).awarded ?? 0;
      }
      const stars = correct + (correct === total && total > 0 ? 10 : 0) + bonus;
      setResult({ win, correct, total, oppReached, childFinished, stars, durationSec });
      setPhase("result");
      play(win ? "win" : "wrong");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("result");
    }
  }
  useEffect(() => {
    finishRef.current = finish;
  });

  function goNext(cur: number) {
    timers.current.advance = null;
    if (endedRef.current) return;
    setFeedback(null);
    setInput("");
    if (cur >= total - 1) void finish("child");
    else setI(cur + 1);
  }

  /** 答一题：立即判分；对了很快下一题，错了看 1.5 秒答案再走 */
  async function check() {
    if (busy || feedback || phase !== "play" || endedRef.current) return;
    const answer = input.trim();
    if (!answer) return;
    const cur = i;
    setBusy(true);
    setErr(null);
    const p = (async () => {
      const r = await fetch(`/api/practice/${setId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index: items[cur].index, answer }),
      });
      const j = (await r.json()) as Feedback & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "判分失败");
      resultsRef.current = { ...resultsRef.current, [items[cur].index]: j.isCorrect };
      setResults(resultsRef.current);
      return j;
    })();
    inflight.current = p;
    try {
      const j = await p;
      if (endedRef.current) return;
      setFeedback(j);
      play(j.isCorrect ? "correct" : "wrong");
      timers.current.advance = window.setTimeout(() => goNext(cur), j.isCorrect ? 600 : 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      inflight.current = null;
    }
  }

  const answered = Object.keys(results).length;
  const correct = Object.values(results).filter(Boolean).length;
  const item = items[i];
  const oppAhead = opp > answered;

  // ---------- 结果 ----------
  if (phase === "result") {
    if (!result) {
      return (
        <div className="card text-center py-8 space-y-3">
          <Mascot mood="think" size={110} />
          <p className="text-xl font-bold">哎呀，出了点小问题</p>
          {err && <p className="text-berry text-sm">{err}</p>}
          <Link href="/child/pk" className="btn-secondary">回到 PK</Link>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Confetti trigger={result.win} />
        <div className={`card text-center py-8 anim-pop ${result.win ? "bg-bee-soft border-bee" : "bg-sky-soft border-sky/40"}`}>
          <Mascot mood={result.win ? "cheer" : "sad"} size={120} className="anim-float" />
          <p className="text-4xl h-display mt-3">{result.win ? "🏆 你赢啦！" : "😿 橙橙赢了"}</p>
          <p className="text-muted mt-2 font-bold">
            {result.win
              ? result.childFinished && result.oppReached < total
                ? "比橙橙先做完，太快了！"
                : "答对的比橙橙做的还多，厉害！"
              : result.childFinished
                ? "做完了，但对的题还不够多，再练练！"
                : "橙橙先做完了，下次要更快哦！"}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-5 max-w-sm mx-auto">
            <div className="card-flat">
              <p className="text-3xl">{childAvatar}</p>
              <p className="text-sm font-bold text-muted">我</p>
              <p className="text-2xl h-display text-leaf">对 {result.correct} / {total}</p>
            </div>
            <div className="card-flat">
              <Mascot mood="happy" size={36} />
              <p className="text-sm font-bold text-muted">橙橙</p>
              <p className="text-2xl h-display text-sky">做了 {result.oppReached} 题</p>
            </div>
          </div>
          <p className="mt-4 text-lg font-extrabold text-brand-dark">⭐ +{result.stars} 颗星星 · 用时 {result.durationSec} 秒</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-center">
          <StartFlowButton url="/api/pk" body={{ count: total }} redirect="/child/pk/{id}" label="再来一局 🔁" busyLabel="出题中…" className="btn-primary text-lg" />
          <Link href="/child/practice" className="btn-secondary">去练习</Link>
          <Link href="/child" className="btn-secondary">回首页</Link>
        </div>
      </div>
    );
  }

  // ---------- 准备 / 倒计时 ----------
  if (phase === "ready" || phase === "countdown") {
    return (
      <div className="card text-center py-10 space-y-4">
        <Mascot mood={phase === "ready" ? "think" : "cheer"} size={130} className="anim-float" />
        {phase === "ready" ? (
          <>
            <p className="text-2xl h-display">{total} 道口算，看谁先做完！</p>
            <p className="text-muted font-bold">橙橙大约 {opponentSpeedSec} 秒做一题，你能追上它吗？</p>
            <button type="button" className="btn-primary text-2xl px-10 py-4" onClick={start}>
              开始！🚀
            </button>
          </>
        ) : (
          <p key={count} className="text-8xl h-display text-brand anim-pop">{count}</p>
        )}
      </div>
    );
  }

  // ---------- 比赛中 ----------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-bold text-muted">
        <span>🏁 口算 PK</span>
        <span>⏱ {elapsed}s</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={`card-flat ${!oppAhead ? "border-leaf bg-leaf-soft/40" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="text-3xl">{childAvatar}</span>
            <div className="min-w-0">
              <p className="font-extrabold truncate">{childName}</p>
              <p className="text-xs text-muted">对 <b className="text-leaf">{correct}</b> · 已做 {answered}/{total}</p>
            </div>
          </div>
          <div className="bar mt-2"><div className="bar-fill bg-leaf" style={{ width: `${(answered / total) * 100}%` }} /></div>
        </div>
        <div className={`card-flat ${oppAhead ? "border-sky bg-sky-soft/60" : ""}`}>
          <div className="flex items-center gap-2">
            <Mascot mood={oppAhead ? "cheer" : "think"} size={40} />
            <div className="min-w-0">
              <p className="font-extrabold">橙橙</p>
              <p className="text-xs text-muted">已做 {opp}/{total}</p>
            </div>
          </div>
          <div className="bar mt-2"><div className="bar-fill bg-sky" style={{ width: `${(opp / total) * 100}%` }} /></div>
        </div>
      </div>

      <div className={`card text-center py-6 transition-colors ${feedback ? (feedback.isCorrect ? "bg-leaf-soft border-leaf" : "bg-berry-soft border-berry anim-shake") : ""}`}>
        <p className="text-sm font-bold text-muted">第 {i + 1} / {total} 题</p>
        <p className="text-5xl h-display tracking-wide mt-2 whitespace-pre-wrap">{item.stem}</p>
        <div className="mt-5 mx-auto max-w-xs">
          <input
            ref={inputRef}
            className={`input text-center text-3xl ${feedback ? (feedback.isCorrect ? "border-leaf text-leaf-dark" : "border-berry text-berry line-through") : ""}`}
            value={input}
            inputMode="decimal"
            readOnly={!!feedback || phase !== "play"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void check();
              }
            }}
            placeholder="答案"
          />
        </div>
        <div className="h-9 mt-3">
          {feedback && (feedback.isCorrect ? <p className="text-2xl font-extrabold text-leaf-dark anim-pop">✓ 对啦！</p> : <p className="text-xl font-extrabold text-berry anim-pop">✗ 答案是 <span className="text-2xl text-leaf-dark">{feedback.correctAnswer}</span></p>)}
          {!feedback && phase === "finishing" && <p className="text-muted font-bold">结算中…</p>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:hidden">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn-secondary text-xl py-3 ${k === "✓" ? "bg-brand text-white border-none shadow-[0_4px_0_0_var(--brand-dark)]" : ""}`}
            disabled={!!feedback || phase !== "play"}
            onClick={() => (k === "⌫" ? setInput((v) => v.slice(0, -1)) : k === "✓" ? void check() : setInput((v) => v + k))}
          >
            {k === "✓" ? "确定" : k}
          </button>
        ))}
      </div>

      <button type="button" className="btn-primary w-full text-lg hidden sm:inline-flex" disabled={busy || !!feedback || !input.trim() || phase !== "play"} onClick={() => void check()}>
        {busy ? "判分中…" : "确定 ✓"}
      </button>
      {err && <p className="text-berry text-sm font-bold">{err}</p>}
    </div>
  );
}
