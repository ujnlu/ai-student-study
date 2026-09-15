"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mascot, MascotSays } from "@/components/mascot";

// 服务端先按"支持"渲染，客户端再按真实情况更新，避免水合不一致
const noopSubscribe = () => () => {};
function useSpeechSupported() {
  return useSyncExternalStore(noopSubscribe, () => "speechSynthesis" in window, () => true);
}
import { Confetti, useSfx } from "@/components/fx";
import { Uploader } from "@/components/uploader";

type Word = { word: string; pinyin: string; hint: string };
type Phase = "intro" | "loading" | "playing" | "done" | "upload";
type Stage = "reading" | "writing";

const PAUSES = [4, 6, 8];
const GRAPE_BTN = "btn bg-grape text-white shadow-[0_4px_0_0_#7c3aed] active:translate-y-[4px] active:shadow-none hover:brightness-105";

function pickVoice(lang: string) {
  const voices = window.speechSynthesis.getVoices();
  const want = lang.toLowerCase();
  return voices.find((v) => v.lang.replace("_", "-").toLowerCase() === want) ?? voices.find((v) => v.lang.toLowerCase().startsWith(want.slice(0, 2))) ?? null;
}

/** 等 ms 毫秒；期间被取消（token 变了）就返回 false */
function sleep(ms: number, token: number, ref: { current: number }) {
  return new Promise<boolean>((res) => window.setTimeout(() => res(token === ref.current), ms));
}

/** 朗读一段文字，读完（或超时）后 resolve */
function speak(text: string, lang: string, rate: number) {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    const timer = window.setTimeout(finish, 2500 + text.length * 700);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

export function DictationPlayer({
  childId,
  chapterId,
  title,
  subjectId,
  subjectName,
  wordListId: initialListId,
  initialWords,
}: {
  childId: string;
  chapterId: string;
  title: string;
  subjectId: string;
  subjectName: string;
  wordListId: string | null;
  initialWords: Word[] | null;
}) {
  const play = useSfx();
  const lang = subjectId === "english" ? "en-US" : "zh-CN";
  const [words, setWords] = useState<Word[] | null>(initialWords);
  const [wordListId, setWordListId] = useState<string | null>(initialListId);
  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<Stage>("reading");
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pause, setPause] = useState(6);
  const [showHint, setShowHint] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [replay, setReplay] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);
  const pauseRef = useRef(pause);
  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);
  const supported = useSpeechSupported();

  const runWord = useCallback(
    async (i: number, list: Word[]) => {
      const token = ++runRef.current;
      const w = list[i];
      if (!w) return;
      setStage("reading");
      setCountdown(0);
      await speak(w.word, lang, 0.8);
      if (token !== runRef.current) return;
      if (!(await sleep(900, token, runRef))) return;
      await speak(w.word, lang, 0.8);
      if (token !== runRef.current) return;
      setStage("writing");
      for (let s = pauseRef.current; s > 0; s--) {
        setCountdown(s);
        if (!(await sleep(1000, token, runRef))) return;
      }
      setCountdown(0);
      if (i + 1 < list.length) setIdx(i + 1);
      else {
        setPhase("done");
        play("win");
      }
    },
    [lang, play],
  );

  useEffect(() => {
    if (phase !== "playing" || paused || !words) return;
    const ref = runRef;
    const t = window.setTimeout(() => void runWord(idx, words), 0);
    return () => {
      window.clearTimeout(t);
      ref.current++;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [phase, paused, idx, replay, words, runWord]);

  // 有些浏览器要先触发一次 getVoices 才会加载中文语音
  useEffect(() => {
    if (supported) window.speechSynthesis.getVoices();
  }, [supported]);

  async function start() {
    play("tap");
    setError(null);
    setShowAnswers(false);
    let list = words;
    if (!list) {
      setPhase("loading");
      try {
        const r = await fetch("/api/dictation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chapterId }) });
        const j = (await r.json()) as { id?: string; words?: Word[]; error?: string };
        if (!r.ok || !j.words?.length) throw new Error(j.error ?? "没拿到词表");
        list = j.words;
        setWords(list);
        setWordListId(j.id ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("intro");
        return;
      }
    }
    setIdx(0);
    setPaused(false);
    setPhase("playing");
  }

  function stopAll() {
    runRef.current++;
    if (supported) window.speechSynthesis.cancel();
  }

  const total = words?.length ?? 0;
  const cur = words?.[idx];
  const meta = JSON.stringify({ wordListId, words: words?.map((w) => w.word) ?? [] });

  // ---------- 准备 ----------
  if (phase === "intro" || phase === "loading") {
    return (
      <section className="card space-y-4">
        <MascotSays mood={phase === "loading" ? "think" : "happy"}>
          {phase === "loading" ? (
            <>橙橙正在翻课本找词语，大约要 20 秒，等我一下～</>
          ) : (
            <>
              准备好纸和笔！每个词我读两遍，读完给你 {pause} 秒写字。
              {total > 0 && <span className="block text-grape mt-1">《{title}》一共 {total} 个词</span>}
            </>
          )}
        </MascotSays>
        {!supported && <p className="text-berry font-bold">这个浏览器不会朗读，换成 Chrome 或 Safari 再试试～</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted font-bold">写字时间</span>
          {PAUSES.map((p) => (
            <button key={p} type="button" className={p === pause ? "chip-on" : "chip"} onClick={() => setPause(p)}>
              {p} 秒
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-base font-bold cursor-pointer">
          <input type="checkbox" className="w-5 h-5 accent-grape" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
          听不清时显示提示句子
        </label>
        {error && <p className="text-berry font-bold anim-shake">{error}</p>}
        <button type="button" className={`${GRAPE_BTN} w-full text-xl py-4`} onClick={start} disabled={phase === "loading" || !supported}>
          {phase === "loading" ? "⏳ 准备中…" : "🎧 开始听写"}
        </button>
      </section>
    );
  }

  // ---------- 听写中 ----------
  if (phase === "playing" && cur) {
    return (
      <section className="card space-y-5 text-center">
        <p className="text-muted font-bold text-lg">
          第 <span className="text-grape text-3xl h-display">{idx + 1}</span> / {total} 个
        </p>
        <div className="bar">
          <div className="bar-fill bg-grape" style={{ width: `${((idx + (stage === "writing" ? 1 : 0.5)) / total) * 100}%` }} />
        </div>
        <div className="py-4">
          {paused ? (
            <>
              <Mascot mood="sleep" size={110} />
              <p className="text-2xl font-black mt-2">暂停中</p>
            </>
          ) : stage === "reading" ? (
            <>
              <div className="text-7xl anim-bounce">🔊</div>
              <p className="text-2xl font-black mt-3">仔细听～</p>
            </>
          ) : (
            <>
              <div className="mx-auto w-28 h-28 rounded-full bg-grape-soft border-4 border-grape flex items-center justify-center text-5xl h-display text-grape anim-pop" key={countdown}>
                {countdown}
              </div>
              <p className="text-2xl font-black mt-3">写吧！✍️</p>
            </>
          )}
        </div>
        {showHint && cur.hint && <p className="text-lg text-gray-600 bg-gray-50 rounded-2xl px-4 py-3">提示：{cur.hint.replaceAll(cur.word, "____")}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn-secondary text-lg py-3" onClick={() => { play("tap"); setPaused(false); setReplay((r) => r + 1); }}>
            🔁 再读一遍
          </button>
          <button type="button" className="btn-secondary text-lg py-3" onClick={() => { play("tap"); setPaused((p) => !p); }}>
            {paused ? "▶️ 继续" : "⏸️ 暂停"}
          </button>
          <button type="button" className="btn-ghost text-lg" disabled={idx === 0} onClick={() => { play("tap"); setIdx((i) => Math.max(0, i - 1)); }}>
            ← 上一个
          </button>
          <button
            type="button"
            className="btn-ghost text-lg"
            onClick={() => {
              play("tap");
              if (idx + 1 < total) setIdx((i) => i + 1);
              else {
                stopAll();
                setPhase("done");
              }
            }}
          >
            {idx + 1 < total ? "下一个 →" : "写完了 ✓"}
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-muted font-bold">写字时间</span>
          {PAUSES.map((p) => (
            <button key={p} type="button" className={`${p === pause ? "chip-on" : "chip"} px-3 py-1 text-xs`} onClick={() => setPause(p)}>
              {p} 秒
            </button>
          ))}
        </div>
      </section>
    );
  }

  // ---------- 拍照检查 ----------
  if (phase === "upload") {
    return (
      <section className="card space-y-4">
        <MascotSays mood="happy">把听写本平放，光线亮一点，拍清楚每一个字，橙橙帮你逐个检查！</MascotSays>
        <Uploader
          childId={childId}
          subjects={[{ id: subjectId, name: subjectName }]}
          defaultSubject={subjectId}
          kind="dictation"
          meta={meta}
          hint="把听写本平放在桌上，拍清楚每个字"
          submitLabel="✅ 让橙橙检查"
        />
        <button type="button" className="btn-ghost w-full" onClick={() => setPhase("done")}>
          ← 返回
        </button>
      </section>
    );
  }

  // ---------- 写完了 ----------
  return (
    <section className="card space-y-4">
      <Confetti trigger={phase === "done"} />
      <MascotSays mood="cheer">{total} 个词都听完啦，真棒！拍张照片，橙橙帮你检查～</MascotSays>
      <button type="button" className={`${GRAPE_BTN} w-full text-xl py-4`} onClick={() => { play("tap"); setPhase("upload"); }}>
        📷 写完了，拍照检查
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-secondary text-lg" onClick={() => { play("tap"); setShowAnswers((s) => !s); }}>
          {showAnswers ? "🙈 藏起答案" : "👀 看答案"}
        </button>
        <button type="button" className="btn-secondary text-lg" onClick={start}>
          🔁 再听一遍
        </button>
      </div>
      {showAnswers && words && (
        <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2 anim-pop">
          {words.map((w, i) => (
            <li key={i} className="card-flat py-2 text-center">
              <div className="text-xs text-muted">{w.pinyin}</div>
              <div className="text-2xl font-black tracking-widest">{w.word}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
