"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExplanationStep } from "@/lib/ai/explain";
import { MathText } from "./math-text";

/** 每一步至少展示这么久（毫秒），按旁白长度估算，避免朗读被浏览器拦截时一闪而过 */
function minDurationMs(text: string) {
  return Math.min(20000, Math.max(4000, 1200 + text.length * 260));
}

function synth() {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

function pickVoice() {
  const voices = synth()?.getVoices() ?? [];
  return voices.find((v) => /^zh(-|_)?CN/i.test(v.lang)) ?? voices.find((v) => /^zh/i.test(v.lang)) ?? voices[0] ?? null;
}

/** 语音列表可能异步加载：最多等 1.5 秒 */
function waitVoices(): Promise<void> {
  const s = synth();
  if (!s || s.getVoices().length > 0) return Promise.resolve();
  return new Promise((res) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      s.removeEventListener("voiceschanged", finish);
      res();
    };
    s.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, 1500);
  });
}

/** Chrome 一段话超过十几秒会静默中断：按句子切成短句逐句读 */
function splitSentences(text: string): string[] {
  const parts = text.match(/[^。！？；!?;\n]+[。！？；!?;]?/g) ?? [text];
  return parts.map((x) => x.trim()).filter(Boolean);
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
  const [speechNote, setSpeechNote] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const speakTimer = useRef<number | null>(null);
  const token = useRef(0);
  const autoRef = useRef(auto);
  const voiceRef = useRef(voice);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null); // 保住引用，Chrome 会把没引用的 utterance 回收导致中途停
  const unlocked = useRef(false);
  useEffect(() => {
    autoRef.current = auto;
    voiceRef.current = voice;
  }, [auto, voice]);
  const step = steps[i];
  const last = i >= steps.length - 1;

  const clearTimer = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const stopSpeech = () => {
    token.current += 1;
    if (speakTimer.current) window.clearTimeout(speakTimer.current);
    speakTimer.current = null;
    synth()?.cancel();
  };

  /** 必须在点击事件里同步调用一次：Safari/iOS 只允许用户手势里启动的朗读 */
  const unlock = () => {
    const s = synth();
    if (!s || unlocked.current) return;
    unlocked.current = true;
    try {
      s.resume();
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      s.speak(u);
    } catch {
      /* ignore */
    }
  };

  /** 朗读一段文字；无论朗读成功、失败还是被拦截，都保证至少展示 minDuration 后才回调 */
  const play = useCallback((text: string, onDone: () => void) => {
    clearTimer();
    stopSpeech();
    const my = token.current;
    const startedAt = Date.now();
    const minMs = minDurationMs(text);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const remain = minMs - (Date.now() - startedAt);
      timer.current = window.setTimeout(onDone, Math.max(900, remain));
    };
    const s = synth();
    if (!voiceRef.current || !s) {
      finish();
      return;
    }
    // cancel() 之后立刻 speak() 在 Chrome 里经常没声音：等语音列表就绪、再延迟一点再读
    void waitVoices().then(() => {
      if (my !== token.current) return;
      speakTimer.current = window.setTimeout(() => {
        if (my !== token.current) return;
        if (s.getVoices().length === 0) setSpeechNote("这个浏览器没有可用的朗读语音，换 Chrome / Edge / Safari 试试");
        const v = pickVoice();
        const chunks = splitSentences(text);
        let k = 0;
        const next = () => {
          if (my !== token.current) return;
          if (k >= chunks.length) {
            finish();
            return;
          }
          const u = new SpeechSynthesisUtterance(chunks[k++]);
          u.lang = "zh-CN";
          u.rate = 0.9;
          if (v) u.voice = v;
          u.onend = next;
          u.onerror = (e) => {
            if (my !== token.current || e.error === "interrupted" || e.error === "canceled") return;
            setSpeechNote(e.error === "not-allowed" ? "浏览器拦截了自动朗读，点一下「再听一遍」" : `朗读失败（${e.error}）`);
            finish();
          };
          let speechStarted = false;
          u.onstart = () => { speechStarted = true; };
          utterRef.current = u;
          s.resume();
          s.speak(u);
          // Chrome may silently swallow speak() after cancel(): detect and retry once
          window.setTimeout(() => {
            if (my !== token.current || speechStarted || k > 1) return;
            try { s.cancel(); } catch {}
            window.setTimeout(() => {
              if (my !== token.current) return;
              s.speak(u);
            }, 150);
          }, 800);
        };
        next();
        // 某些浏览器既不触发 onend 也不触发 onerror：兜底
        window.setTimeout(finish, minMs + 15000);
      }, 300);
    });
     
  }, []);

  const playStep = useCallback(
    (k: number) => {
      const st = steps[k];
      if (!st) return;
      play(st.narration, () => {
        if (autoRef.current && k < steps.length - 1) setI(k + 1);
      });
    },
    [play, steps],
  );

  useEffect(() => {
    if (!started) return;
    playStep(i);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, started]);

  useEffect(() => {
    // 提前加载语音列表
    synth()?.getVoices();
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
    autoRef.current = keepAuto;
    const target = Math.max(0, Math.min(steps.length - 1, k));
    if (target === i && started) playStep(target);
    else setI(target);
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
              unlock();
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
        <MathText as="p" className="font-semibold text-lg" text={step.caption} />
        <MathText as="p" className="text-gray-600 mt-1 leading-relaxed" text={step.narration} />
        {speechNote && voice && <p className="text-xs text-berry font-bold mt-2">🔇 {speechNote}</p>}
      </div>

      <div className="flex items-center justify-center gap-1">
        {steps.map((_, k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              unlock();
              setStarted(true);
              goto(k);
            }}
            className={`h-2.5 rounded-full transition-all ${k === i ? "w-8 bg-brand" : "w-2.5 bg-gray-300"}`}
            aria-label={`第${k + 1}步`}
          />
        ))}
      </div>

      <div className="grid grid-cols-5 gap-2 text-sm">
        <button type="button" className="btn-secondary" disabled={i === 0} onClick={() => { unlock(); setStarted(true); goto(i - 1); }}>⬅️ 上一步</button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            unlock();
            if (!started) { setAuto(true); setStarted(true); return; }
            if (auto) { clearTimer(); stopSpeech(); setAuto(false); } else { setAuto(true); autoRef.current = true; playStep(i); }
          }}
        >
          {auto && started ? "⏸ 暂停" : "▶️ 自动播放"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => { unlock(); setAuto(false); autoRef.current = false; if (!started) { setStarted(true); return; } play(step.narration, () => {}); }}>🔁 再听一遍</button>
        <button type="button" className={`btn-secondary ${voice ? "" : "opacity-60"}`} onClick={() => { unlock(); const on = !voice; setVoice(on); voiceRef.current = on; stopSpeech(); if (on && started) play(step.narration, () => {}); }}>{voice ? "🔊" : "🔇"}</button>
        {last ? (
          <button type="button" className="btn-primary" onClick={() => { unlock(); setStarted(true); goto(0, true); }}>🔄 重播</button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => { unlock(); setStarted(true); goto(i + 1, auto); }}>下一步 ➡️</button>
        )}
      </div>

      {last && (
        <div className="card bg-orange-50 border-orange-100 space-y-3">
          {summary && <p><b>方法小结：</b><MathText text={summary} /></p>}
          {quizQ && (
            <div>
              <p><b>试一试：</b><MathText text={quizQ} /></p>
              {showAnswer ? (
                <p className="mt-1 text-green-700">答案：<MathText text={quizA ?? ""} /></p>
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
