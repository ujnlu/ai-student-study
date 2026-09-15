"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExplanationStep } from "@/lib/ai/explain";

/** 每一步至少展示这么久（毫秒），按旁白长度估算，避免朗读被浏览器拦截时一闪而过 */
function minDurationMs(text: string) {
  return Math.min(20000, Math.max(4000, 1200 + text.length * 260));
}

function pickVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => /^zh(-|_)?CN/i.test(v.lang)) ?? voices.find((v) => /^zh/i.test(v.lang)) ?? null;
}

export function ExplainPlayer({
  title,
  steps,
  summary,
  quizQ,
  quizA,
}: {
  title: string;
  steps: ExplanationStep[];
  summary?: string | null;
  quizQ?: string | null;
  quizA?: string | null;
}) {
  const [i, setI] = useState(0);
  const [started, setStarted] = useState(false);
  const [auto, setAuto] = useState(true);
  const [voice, setVoice] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const timer = useRef<number | null>(null);
  const stepStartedAt = useRef(0);
  const step = steps[i];
  const last = i >= steps.length - 1;

  const clearTimer = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const stopSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  /** 朗读一段文字；无论朗读成功、失败还是被拦截，都保证至少展示 minDuration 后才回调 */
  const play = useCallback(
    (text: string, onDone: () => void) => {
      clearTimer();
      stopSpeech();
      stepStartedAt.current = Date.now();
      const minMs = minDurationMs(text);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        const remain = minMs - (Date.now() - stepStartedAt.current);
        timer.current = window.setTimeout(onDone, Math.max(900, remain));
      };
      if (!voice || typeof window === "undefined" || !("speechSynthesis" in window)) {
        finish();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 0.9;
      const v = pickVoice();
      if (v) u.voice = v;
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
      // 某些浏览器既不触发 onend 也不触发 onerror：兜底
      window.setTimeout(finish, minMs + 15000);
    },
    [voice],
  );

  useEffect(() => {
    if (!started || !step) return;
    play(step.narration, () => {
      if (auto && !last) setI((x) => x + 1);
    });
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, started, auto, voice]);

  useEffect(() => {
    // 提前加载语音列表
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.getVoices();
    return () => {
      clearTimer();
      stopSpeech();
    };
  }, []);

  if (!step) return null;

  const goto = (k: number, keepAuto = false) => {
    clearTimer();
    stopSpeech();
    setAuto(keepAuto);
    setI(Math.max(0, Math.min(steps.length - 1, k)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{title}</h1>
        <span className="text-sm text-gray-500">第 {i + 1} / {steps.length} 步</span>
      </div>

      <div className="card p-2 bg-white relative">
        <div className="aspect-[16/9] w-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: step.svg }} />
        {!started && (
          <button
            type="button"
            onClick={() => {
              setAuto(true);
              setStarted(true);
            }}
            className="absolute inset-0 m-2 rounded-xl bg-black/40 flex flex-col items-center justify-center text-white"
          >
            <span className="text-6xl">▶️</span>
            <span className="mt-2 text-lg font-semibold">点这里，老师开始讲</span>
            <span className="text-xs opacity-80 mt-1">共 {steps.length} 步，会一步一步自动播放</span>
          </button>
        )}
      </div>

      <div className="card py-3">
        <p className="font-semibold text-lg">{step.caption}</p>
        <p className="text-gray-600 mt-1 leading-relaxed">{step.narration}</p>
      </div>

      <div className="flex items-center justify-center gap-1">
        {steps.map((_, k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setStarted(true);
              goto(k);
            }}
            className={`h-2.5 rounded-full transition-all ${k === i ? "w-8 bg-brand" : "w-2.5 bg-gray-300"}`}
            aria-label={`第${k + 1}步`}
          />
        ))}
      </div>

      <div className="grid grid-cols-5 gap-2 text-sm">
        <button type="button" className="btn-secondary" disabled={i === 0} onClick={() => { setStarted(true); goto(i - 1); }}>⬅️ 上一步</button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (!started) { setStarted(true); return; }
            if (auto) { clearTimer(); stopSpeech(); setAuto(false); } else { setAuto(true); play(step.narration, () => { if (!last) setI((x) => x + 1); }); }
          }}
        >
          {auto && started ? "⏸ 暂停" : "▶️ 自动播放"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => { setStarted(true); setAuto(false); play(step.narration, () => {}); }}>🔁 再听一遍</button>
        <button type="button" className={`btn-secondary ${voice ? "" : "opacity-60"}`} onClick={() => { setVoice(!voice); stopSpeech(); }}>{voice ? "🔊" : "🔇"}</button>
        {last ? (
          <button type="button" className="btn-primary" onClick={() => { setStarted(true); goto(0, true); }}>🔄 重播</button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => { setStarted(true); goto(i + 1, auto); }}>下一步 ➡️</button>
        )}
      </div>

      {last && (
        <div className="card bg-orange-50 border-orange-100 space-y-3">
          {summary && <p><b>方法小结：</b>{summary}</p>}
          {quizQ && (
            <div>
              <p><b>试一试：</b>{quizQ}</p>
              {showAnswer ? (
                <p className="mt-1 text-green-700">答案：{quizA}</p>
              ) : (
                <button type="button" className="btn-secondary text-sm mt-2" onClick={() => setShowAnswer(true)}>我算好了，看答案</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
