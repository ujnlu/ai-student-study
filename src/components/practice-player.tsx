"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExplainButton } from "./explain-button";
import { Mascot } from "./mascot";
import { useSfx } from "./fx";

type Item = { index: number; stem: string; kind?: string | null; answer?: string | null; multi?: boolean };
type Feedback = { isCorrect: boolean; correctAnswer: string; solution: string | null; problemId: string };

/** 题干开头的 🔊{{English sentence}} → 听力题：朗读但不显示 */
function parseAudio(stem: string): { audio: string | null; rest: string } {
  const m = /🔊\s*\{\{([\s\S]+?)\}\}/.exec(stem);
  if (!m) return { audio: null, rest: stem };
  return { audio: m[1].trim(), rest: stem.replace(m[0], "").replace(/^[\s，,。.]+/, "").trim() };
}

function speakEn(text: string, rate = 0.85) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find((x) => /en[-_]US/i.test(x.lang)) ?? voices.find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

/** 题干末尾的 "A. xx / B. xx" 选项行 → 选择题 */
function parseChoices(stem: string): { body: string; options: { key: string; text: string }[] } {
  const lines = stem.split("\n");
  const options: { key: string; text: string }[] = [];
  const bodyLines: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const m = /^([A-D])[.、．:：)）]\s*(.+)$/.exec(line);
    if (m && options.length === (m[1].charCodeAt(0) - 65)) options.push({ key: m[1], text: m[2] });
    else if (options.length === 0) bodyLines.push(raw);
    else {
      // 选项后面又出现普通行：当作题干的一部分（少见），放弃选项解析
      const inline = /(?:^|\s)A[.、．]\s*.+?\s+B[.、．]/.test(line);
      if (!inline) bodyLines.push(raw);
    }
  }
  if (options.length >= 2) return { body: bodyLines.join("\n").trim(), options };
  // 同一行里的 "A. xx B. xx C. xx"
  const inline = /(?:^|\s)(A[.、．]\s*.+?)\s+(B[.、．]\s*.+?)(?:\s+(C[.、．]\s*.+?))?(?:\s+(D[.、．]\s*.+?))?\s*$/.exec(stem.replace(/\n/g, " "));
  if (inline) {
    const opts = [inline[1], inline[2], inline[3], inline[4]].filter(Boolean).map((x) => ({ key: x![0], text: x!.replace(/^[A-D][.、．]\s*/, "") }));
    const body = stem.replace(/\n/g, " ").slice(0, stem.replace(/\n/g, " ").indexOf(inline[1])).trim();
    if (opts.length >= 2) return { body, options: opts };
  }
  return { body: stem, options: [] };
}

export function PracticePlayer({ setId, items, timeLimitSec, title, subjectId = "math", resultHref, childId }: { setId: string; items: Item[]; timeLimitSec: number | null; title: string; subjectId?: string; resultHref?: string; childId?: string }) {
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
  useEffect(() => () => { if (advanceTimer.current) window.clearTimeout(advanceTimer.current); window.speechSynthesis?.cancel(); }, []);
  const audioRef = useRef<string | null>(null);
  useEffect(() => {
    const cur = parseAudio(items[i]?.stem ?? "").audio;
    audioRef.current = cur;
    if (cur) {
      window.speechSynthesis?.getVoices();
      const t = window.setTimeout(() => speakEn(cur), 300);
      return () => window.clearTimeout(t);
    }
  }, [i, items]);

  const left = timeLimitSec ? timeLimitSec - elapsed : null;
  const item = items[i];
  const { audio, rest: stemText } = parseAudio(item.stem);
  const parsed = parseChoices(stemText);
  const isChoice = parsed.options.length >= 2;
  const subjective = item.kind === "subjective";
  const [peek, setPeek] = useState(false);
  const numeric = subjectId === "math" && !isChoice && !subjective;
  const longStem = parsed.body.length > 24 || parsed.body.includes("\n");
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
      router.push(resultHref ?? `/child/practice/${setId}`);
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
    setPeek(false);
    if (isLast) void submit();
    else setI(i + 1);
  }

  async function check(given?: string) {
    if (busy || feedback) return;
    const answer = (given ?? input).trim();
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
        {audio && (
          <div className="flex justify-center gap-2 mb-3">
            <button type="button" className="btn-sky text-lg" onClick={() => { play("tap"); speakEn(audio); }}>🔊 听一听</button>
            <button type="button" className="btn-secondary" onClick={() => { play("tap"); speakEn(audio, 0.6); }}>🐢 慢一点</button>
          </div>
        )}
        <p className={`h-display whitespace-pre-wrap ${longStem ? "text-2xl text-left leading-relaxed px-2" : "text-5xl tracking-wide leading-tight"}`}>{parsed.body}</p>
        {feedback && audio && <p className="text-sm font-bold text-muted mt-2">刚才读的是：{audio}</p>}
        {subjective ? (
          <div className="mt-5 text-left space-y-3">
            <textarea className="input text-base leading-relaxed" rows={4} placeholder="把你的解答过程简要写在这里（可选）…" value={input} readOnly={!!feedback} onChange={(e) => setInput(e.target.value)} />
            {!feedback && (peek ? (
              <div className="rounded-2xl bg-sky-soft/60 p-3">
                <p className="text-xs font-extrabold text-sky-dark mb-1">参考答案</p>
                <p className="font-bold whitespace-pre-wrap text-base">{item.answer}</p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button type="button" className="btn-leaf" disabled={busy} onClick={() => void check("__self:1")}>✅ 我做对了</button>
                  <button type="button" className="btn-danger" disabled={busy} onClick={() => void check("__self:0")}>❌ 没做对</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn-sky w-full" onClick={() => { play("tap"); setPeek(true); }}>做完了，对照参考答案自评</button>
            ))}
          </div>
        ) : isChoice ? (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            {parsed.options.map((o) => {
              const picked = input.trim().toUpperCase().includes(o.key);
              const cls = feedback
                ? feedback.correctAnswer.trim().toUpperCase().includes(o.key)
                  ? "border-leaf bg-leaf-soft text-leaf-dark"
                  : picked
                    ? "border-berry bg-berry-soft text-berry line-through"
                    : "border-line bg-white opacity-60"
                : picked
                  ? "border-brand bg-brand-soft"
                  : "border-line bg-white hover:bg-gray-50";
              return (
                <button key={o.key} type="button" disabled={!!feedback || busy} className={`rounded-2xl border-2 px-4 py-3 font-extrabold text-lg flex gap-2 items-start transition-colors ${cls}`} onClick={() => { play("tap"); if (item.multi) { setInput((v) => (v.includes(o.key) ? v.replace(o.key, "") : (v + o.key).split("").sort().join(""))); } else { setInput(o.key); void check(o.key); } }}>
                  <span className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center shrink-0">{o.key}</span>
                  <span className="flex-1 whitespace-pre-wrap">{o.text}</span>
                </button>
              );
            })}
          </div>
        ) : (
        <div className="mt-6 mx-auto max-w-xs">
          <input
            ref={inputRef}
            className={`input text-center font-black py-3 ${numeric ? "text-4xl" : "text-2xl"} ${feedback ? (feedback.isCorrect ? "border-leaf text-leaf-dark" : "border-berry text-berry line-through") : ""}`}
            value={input}
            inputMode={numeric ? "decimal" : "text"}
            lang={subjectId === "english" ? "en" : "zh-CN"}
            readOnly={!!feedback}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (feedback) goNext();
                else void check();
              }
            }}
            placeholder={numeric ? "?" : subjectId === "english" ? "type here" : "写答案"}
          />
        </div>
        )}

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
                  <div className="mt-2"><ExplainButton problemId={feedback.problemId} childId={childId} label="🎬 看动画讲解" className="btn-secondary text-sm py-2" /></div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {numeric && <div className="grid grid-cols-4 gap-2 sm:hidden">
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
      </div>}

      <div className="flex gap-2">
        {feedback ? (
          <button type="button" className="btn-primary flex-1 text-lg py-4" disabled={busy} onClick={goNext}>
            {isLast ? (busy ? "提交中…" : "看成绩 🏁") : "下一题 ➡️"}
          </button>
        ) : isChoice && item.multi ? (
          <button type="button" className="btn-leaf flex-1 text-lg py-4" disabled={busy || !input.trim()} onClick={() => void check()}>
            {busy ? "判分中…" : `多选 · 确定 ${input ? `(${input})` : ""}`}
          </button>
        ) : isChoice || subjective ? (
          <p className="flex-1 text-center text-sm font-bold text-muted py-3">{busy ? "判分中…" : isChoice ? "点一个选项作答" : "解答题：写完后对照参考答案自评"}</p>
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
