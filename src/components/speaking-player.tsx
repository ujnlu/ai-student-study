"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Mascot, MascotSays } from "@/components/mascot";
import { Confetti, useSfx } from "@/components/fx";
import { scoreSpeech, type WordDiff } from "@/lib/speaking-score";

type Item = { en: string; zh: string; tip: string };
type Data = { code: string; title: string; items: Item[] };
type Phase = "loading" | "ready" | "listening" | "done";

type SREvent = { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } };
type SR = { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; abort(): void; onresult: ((e: SREvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type SRCtor = new () => SR;
function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const noop = () => () => {};
function useSrSupported() {
  return useSyncExternalStore(noop, () => !!getSR(), () => true);
}

const PASS = 80;
const SKY_BTN = "btn-sky";

function pickVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => /en[-_]US/i.test(v.lang) && /female|samantha|zira|jenny|aria/i.test(v.name)) ?? voices.find((v) => /en[-_]US/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
}

export function SpeakingPlayer({ code, initial, backHref = "/child/speaking" }: { code: string; initial: Data | null; backHref?: string }) {
  const play = useSfx();
  const srSupported = useSrSupported();
  const [data, setData] = useState<Data | null>(initial);
  const [phase, setPhase] = useState<Phase>(initial ? "ready" : "loading");
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<{ accuracy: number; diff: WordDiff[] } | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [speaking, setSpeaking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ accuracy: number; stars: number } | null>(null);
  const [showZh, setShowZh] = useState(true);
  const srRef = useRef<SR | null>(null);
  const finalRef = useRef("");
  const listeningRef = useRef(false);

  const item = data?.items[idx] ?? null;
  const total = data?.items.length ?? 0;
  const doneCount = Object.keys(scores).length;

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const r = await fetch(`/api/speaking?code=${encodeURIComponent(code)}`);
      const j = (await r.json()) as Data & { error?: string };
      if (!r.ok || !j.items?.length) throw new Error(j.error ?? "没拿到句子");
      setData(j);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("ready");
    }
  }, [code]);

  useEffect(() => {
    if (initial) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [initial, load]);

  // 预加载语音列表；卸载时停掉朗读和麦克风
  useEffect(() => {
    window.speechSynthesis?.getVoices();
    return () => {
      listeningRef.current = false;
      srRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speak(text: string, rate = 0.85) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setMsg("这个浏览器不能朗读，请换 Chrome / Edge 试试");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;
    const v = pickVoice();
    if (v) u.voice = v;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }

  function startListening() {
    const Ctor = getSR();
    if (!Ctor || !item) return;
    window.speechSynthesis?.cancel();
    play("tap");
    setMsg(null);
    setResult(null);
    setTranscript("");
    finalRef.current = "";
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += " " + r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript((finalRef.current + " " + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") {
        setMsg("橙橙没听到声音，大声一点再试一次～");
        return;
      }
      if (e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setMsg("没有拿到麦克风权限，可以让爸爸妈妈确认～");
      else setMsg(`麦克风出了点小问题（${e.error}）`);
    };
    rec.onend = () => {
      listeningRef.current = false;
      srRef.current = null;
      const text = finalRef.current.trim();
      if (text) finish(text);
      else setPhase("ready");
    };
    srRef.current = rec;
    listeningRef.current = true;
    try {
      rec.start();
      setPhase("listening");
    } catch {
      setMsg("麦克风打不开，请检查浏览器权限");
      setPhase("ready");
    }
  }

  function stopListening() {
    srRef.current?.stop();
  }

  function finish(text: string) {
    if (!item) return;
    const r = scoreSpeech(item.en, text);
    setResult(r);
    setScores((s) => ({ ...s, [idx]: r.accuracy }));
    setPhase("ready");
    play(r.accuracy >= PASS ? "correct" : "wrong");
  }

  function parentConfirm() {
    if (!item) return;
    play("correct");
    setResult({ accuracy: 100, diff: item.en.split(/\s+/).map((w) => ({ w, ok: true })) });
    setScores((s) => ({ ...s, [idx]: 100 }));
  }

  function go(n: number) {
    window.speechSynthesis?.cancel();
    srRef.current?.abort();
    setIdx(n);
    setResult(null);
    setTranscript("");
    setMsg(null);
    setPhase("ready");
  }

  async function submitAll() {
    if (!data) return;
    const vals = Object.values(scores);
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    setPhase("done");
    try {
      const r = await fetch("/api/speaking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, title: data.title, accuracy: avg, count: vals.length }) });
      const j = (await r.json()) as { accuracy: number; stars: number; error?: string };
      if (!r.ok) throw new Error(j.error ?? "保存失败");
      setSaved(j);
      play(j.stars > 0 ? "win" : "correct");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaved({ accuracy: avg, stars: 0 });
    }
  }

  if (phase === "loading") {
    return (
      <section className="card">
        <MascotSays mood="think">橙橙正在准备这组句子，第一次大约 20 秒～</MascotSays>
      </section>
    );
  }
  if (!data || !item) {
    return (
      <section className="card space-y-3">
        <MascotSays mood="sad">{error ?? "没找到句子"}</MascotSays>
        <button type="button" className="btn-secondary w-full" onClick={load}>🔁 再试一次</button>
      </section>
    );
  }

  if (phase === "done" && saved) {
    const good = saved.accuracy >= PASS;
    return (
      <section className="card space-y-4 text-center">
        <Confetti trigger={good} />
        <Mascot mood={good ? "cheer" : "happy"} size={120} className="anim-pop mx-auto" />
        <p className="text-muted font-bold">《{data.title}》跟读完成</p>
        <p className={`text-6xl h-display ${good ? "text-leaf" : "text-bee-dark"}`}>{saved.accuracy}<span className="text-3xl">%</span></p>
        {saved.stars > 0 ? <p className="badge bg-bee-soft text-bee-dark text-sm">+{saved.stars} ⭐ Great job!</p> : <p className="text-sm text-muted">平均 {PASS}% 以上能拿 6 颗星星，再练一遍试试～</p>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={`${SKY_BTN} text-lg py-3`} onClick={() => { setScores({}); setSaved(null); go(0); }}>🔁 再读一遍</button>
          <Link href={backHref} className="btn-secondary text-lg py-3">换个主题</Link>
        </div>
        {error && <p className="text-berry text-sm font-bold">{error}</p>}
      </section>
    );
  }

  const listening = phase === "listening";
  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex justify-between text-xs font-extrabold text-muted mb-1"><span>{data.title}</span><span>{idx + 1} / {total}</span></div>
          <div className="bar"><div className="bar-fill bg-sky" style={{ width: `${Math.round((doneCount / total) * 100)}%` }} /></div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {data.items.map((_, i) => {
          const sc = scores[i];
          const cls = i === idx ? "border-sky bg-sky-soft text-sky-dark" : sc === undefined ? "border-line bg-white text-muted" : sc >= PASS ? "border-leaf bg-leaf-soft text-leaf-dark" : "border-bee bg-bee-soft text-bee-dark";
          return <button key={i} type="button" disabled={listening} className={`w-9 h-9 rounded-full border-2 text-xs font-black ${cls}`} onClick={() => go(i)}>{sc === undefined ? i + 1 : sc >= PASS ? "✓" : sc}</button>;
        })}
      </div>

      <div className="rounded-3xl bg-sky-soft/70 p-5 text-center space-y-2">
        <p className="h-display text-3xl sm:text-4xl leading-snug">
          {result ? result.diff.map((d, i) => <span key={i} className={d.ok ? "" : "text-berry underline decoration-wavy"}>{d.w} </span>) : item.en}
        </p>
        {showZh && <p className="text-muted font-bold">{item.zh}</p>}
        {item.tip && <p className="text-xs font-bold text-sky-dark">💡 {item.tip}</p>}
      </div>

      <div className="flex gap-2 justify-center flex-wrap">
        <button type="button" className={`chip ${speaking ? "chip-on" : ""}`} disabled={listening} onClick={() => { play("tap"); speak(item.en); }}>🔊 听一听</button>
        <button type="button" className="chip" disabled={listening} onClick={() => { play("tap"); speak(item.en, 0.6); }}>🐢 慢一点</button>
        <button type="button" className={showZh ? "chip-on" : "chip"} onClick={() => setShowZh((v) => !v)}>{showZh ? "🙈 藏中文" : "👀 看中文"}</button>
      </div>

      {msg && <p className="text-berry font-bold text-center">{msg}</p>}

      {result ? (
        <div className={`rounded-2xl p-4 text-center ${result.accuracy >= PASS ? "bg-leaf-soft" : "bg-bee-soft"}`}>
          <p className="h-display text-3xl">{result.accuracy >= PASS ? "🎉 Excellent!" : result.accuracy >= 50 ? "👍 Good try!" : "💪 Try again!"} <span className="text-xl">{result.accuracy}%</span></p>
          {transcript && <p className="text-sm font-bold text-muted mt-1">橙橙听到：{transcript}</p>}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button type="button" className="btn-secondary text-lg py-3" onClick={() => { setResult(null); setTranscript(""); }}>🎤 再读一次</button>
            {idx < total - 1 ? (
              <button type="button" className={`${SKY_BTN} text-lg py-3`} onClick={() => go(idx + 1)}>下一句 ➡️</button>
            ) : (
              <button type="button" className="btn-leaf text-lg py-3" onClick={() => void submitAll()}>完成 🏁</button>
            )}
          </div>
        </div>
      ) : listening ? (
        <div className="space-y-3">
          <div className="rounded-2xl border-2 border-berry/40 bg-berry-soft/40 p-4 min-h-16 text-xl">
            <p className="text-sm font-bold text-berry mb-1 flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-berry animate-pulse" /> 橙橙在听… 读完会自动停</p>
            {transcript || <span className="text-muted">大声读出来～</span>}
          </div>
          <button type="button" className="btn-secondary w-full" onClick={stopListening}>读完了</button>
        </div>
      ) : (
        <div className="space-y-2">
          {srSupported ? (
            <button type="button" className={`${SKY_BTN} w-full text-xl py-4`} onClick={startListening}>🎤 我来读</button>
          ) : (
            <p className="text-sm text-muted text-center">这个浏览器不能听你说话（请用 Chrome / Edge），可以让爸爸妈妈确认～</p>
          )}
          <button type="button" className="btn-ghost w-full text-sm" onClick={parentConfirm}>👨‍👩‍👧 家长确认读对了</button>
          {doneCount > 0 && idx === total - 1 && <button type="button" className="btn-leaf w-full" onClick={() => void submitAll()}>完成 🏁</button>}
        </div>
      )}
    </section>
  );
}
