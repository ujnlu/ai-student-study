"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Mascot, MascotSays } from "@/components/mascot";
import { Confetti, useSfx } from "@/components/fx";
import { scoreRecitation, type DiffChar } from "@/lib/recite-score";
import { scoreSpeech, type WordDiff } from "@/lib/speaking-score";

type Q = { q: string; options: string[]; answer: number };
type Data = { id: string; lang: "zh" | "en"; level: number; title: string; text: string; questions: Q[] };
type Phase = "loading" | "read" | "recording" | "quiz" | "done";

type SREvent = { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } };
type SR = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: SREvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type SRCtor = new () => SR;
function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const noop = () => () => {};

export function ReadingPlayer({ lang, level, initial }: { lang: "zh" | "en"; level: number; initial: Data | null }) {
  const play = useSfx();
  const srSupported = useSyncExternalStore(noop, () => !!getSR(), () => true);
  const [data, setData] = useState<Data | null>(initial);
  const [phase, setPhase] = useState<Phase>(initial ? "read" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [readScore, setReadScore] = useState<number | null>(null);
  const [zhDiff, setZhDiff] = useState<DiffChar[] | null>(null);
  const [enDiff, setEnDiff] = useState<WordDiff[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState<{ accuracy: number; stars: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const srRef = useRef<SR | null>(null);
  const finalRef = useRef("");
  const recRef = useRef(false);

  const load = useCallback(async (fresh = false) => {
    setPhase("loading");
    setError(null);
    setReadScore(null);
    setZhDiff(null);
    setEnDiff(null);
    setAnswers({});
    setChecked(false);
    setSaved(null);
    setTranscript("");
    try {
      const r = await fetch(`/api/reading?lang=${lang}&level=${level}${fresh ? "&fresh=1" : ""}`);
      const j = (await r.json()) as Data & { error?: string };
      if (!r.ok || !j.text) throw new Error(j.error ?? "没拿到短文");
      setData(j);
      setPhase("read");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("read");
    }
  }, [lang, level]);

  useEffect(() => {
    if (initial) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [initial, load]);
  useEffect(() => {
    window.speechSynthesis?.getVoices();
    return () => {
      recRef.current = false;
      srRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speak() {
    if (!data || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(data.text);
    u.lang = lang === "en" ? "en-US" : "zh-CN";
    u.rate = lang === "en" ? 0.85 : 0.95;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => (lang === "en" ? /en[-_]US/i : /zh[-_]CN/i).test(x.lang)) ?? voices.find((x) => x.lang.startsWith(lang));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  }

  function startRecording() {
    const Ctor = getSR();
    if (!Ctor || !data) return;
    window.speechSynthesis?.cancel();
    play("tap");
    setMsg(null);
    finalRef.current = "";
    setTranscript("");
    const rec = new Ctor();
    rec.lang = lang === "en" ? "en-US" : "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
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
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        recRef.current = false;
        setMsg("没有拿到麦克风权限，可以直接答题～");
        setPhase("read");
      } else setMsg(`麦克风出了点小问题（${e.error}）`);
    };
    rec.onend = () => {
      if (recRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    };
    srRef.current = rec;
    recRef.current = true;
    try {
      rec.start();
      setPhase("recording");
    } catch {
      setMsg("麦克风打不开，可以直接答题～");
    }
  }

  function finishReading() {
    recRef.current = false;
    srRef.current?.stop();
    srRef.current = null;
    if (!data) return;
    const text = (finalRef.current || transcript).trim();
    if (!text) {
      setMsg("橙橙没听到，再大声一点～");
      setPhase("read");
      return;
    }
    if (lang === "zh") {
      const r = scoreRecitation(data.text, text);
      setReadScore(r.accuracy);
      setZhDiff(r.diff);
    } else {
      const r = scoreSpeech(data.text, text);
      setReadScore(r.accuracy);
      setEnDiff(r.diff);
    }
    play("correct");
    setPhase("quiz");
  }

  function skipReading() {
    play("tap");
    setPhase("quiz");
  }

  async function submitQuiz() {
    if (!data) return;
    setChecked(true);
    const correct = data.questions.filter((q, i) => answers[i] === q.answer).length;
    play(correct === data.questions.length ? "win" : correct > 0 ? "correct" : "wrong");
    try {
      const r = await fetch("/api/reading", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: data.id, readAccuracy: readScore ?? 0, correct, total: data.questions.length }) });
      const j = (await r.json()) as { accuracy: number; stars: number; error?: string };
      if (!r.ok) throw new Error(j.error ?? "保存失败");
      setSaved(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setPhase("done");
  }

  if (phase === "loading") {
    return (
      <section className="card">
        <MascotSays mood="think">橙橙正在挑一篇 L{level} 的短文，第一次要写一篇新的，大约 20 秒～</MascotSays>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="card space-y-3">
        <MascotSays mood="sad">{error ?? "没找到短文"}</MascotSays>
        <button type="button" className="btn-secondary w-full" onClick={() => void load()}>🔁 再试一次</button>
      </section>
    );
  }

  const paras = data.text.split(/\n+/).filter((p) => p.trim());
  const recording = phase === "recording";
  const correctCount = data.questions.filter((q, i) => answers[i] === q.answer).length;

  return (
    <section className="card space-y-4">
      <Confetti trigger={phase === "done" && correctCount === data.questions.length} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs font-extrabold text-muted">{lang === "en" ? "English Reading" : "中文分级阅读"} · L{data.level}</p>
          <h2 className="h-display text-2xl">{data.title}</h2>
        </div>
        <div className="flex gap-1">
          <button type="button" className="chip" disabled={recording} onClick={() => { play("tap"); speak(); }}>🔊 听橙橙读</button>
          <button type="button" className="chip" disabled={recording} onClick={() => void load(true)}>🔀 换一篇</button>
        </div>
      </div>

      <div className={`rounded-3xl p-5 leading-loose ${lang === "en" ? "text-lg" : "text-xl tracking-wide"} ${lang === "en" ? "bg-sky-soft/60" : "bg-grape-soft/60"}`}>
        {zhDiff ? (
          <p className="whitespace-pre-wrap">{zhDiff.map((d, i) => (d.ch === "\n" ? <br key={i} /> : <span key={i} className={d.ok ? "" : "text-berry bg-berry-soft rounded px-0.5"}>{d.ch}</span>))}</p>
        ) : enDiff ? (
          <p>{enDiff.map((d, i) => <span key={i} className={d.ok ? "" : "text-berry underline decoration-wavy"}>{d.w} </span>)}</p>
        ) : (
          paras.map((p, i) => <p key={i} className="mb-2 last:mb-0">{p}</p>)
        )}
      </div>

      {msg && <p className="text-berry font-bold text-center">{msg}</p>}

      {phase === "read" && (
        <div className="space-y-2">
          {srSupported ? (
            <button type="button" className={`${lang === "en" ? "btn-sky" : "btn bg-grape text-white shadow-[0_4px_0_0_#7c3aed] active:translate-y-[4px] active:shadow-none"} w-full text-xl py-4`} onClick={startRecording}>🎤 我来读</button>
          ) : (
            <p className="text-sm text-muted text-center">这个浏览器不能听你读（请用 Chrome / Edge），可以直接答题～</p>
          )}
          <button type="button" className="btn-ghost w-full text-sm" onClick={skipReading}>先默读，直接答题 →</button>
        </div>
      )}
      {recording && (
        <div className="space-y-3">
          <div className="rounded-2xl border-2 border-berry/40 bg-berry-soft/40 p-4 min-h-16 text-base">
            <p className="text-sm font-bold text-berry mb-1 flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-berry animate-pulse" /> 橙橙在听…</p>
            {transcript || <span className="text-muted">大声读出来～</span>}
          </div>
          <button type="button" className="btn-leaf w-full text-xl py-4" onClick={finishReading}>✅ 读完了</button>
        </div>
      )}

      {(phase === "quiz" || phase === "done") && (
        <div className="space-y-3">
          {readScore !== null && (
            <p className={`rounded-2xl p-3 font-black text-center ${readScore >= 80 ? "bg-leaf-soft text-leaf-dark" : "bg-bee-soft text-bee-dark"}`}>朗读 {readScore}%{readScore >= 80 ? " · 读得真棒！" : " · 红色的地方再读读"}</p>
          )}
          <p className="text-xs font-extrabold text-muted">📝 读懂了吗？答 {data.questions.length} 题</p>
          {data.questions.map((q, qi) => (
            <div key={qi} className="card-flat space-y-2">
              <p className="font-extrabold">{qi + 1}. {q.q}</p>
              <div className="grid gap-1.5">
                {q.options.map((o, oi) => {
                  const picked = answers[qi] === oi;
                  const cls = checked ? (oi === q.answer ? "border-leaf bg-leaf-soft" : picked ? "border-berry bg-berry-soft line-through" : "border-line opacity-60") : picked ? "border-brand bg-brand-soft" : "border-line bg-white";
                  return (
                    <button key={oi} type="button" disabled={checked} className={`rounded-xl border-2 px-3 py-2 text-left font-bold flex gap-2 ${cls}`} onClick={() => { play("tap"); setAnswers((a) => ({ ...a, [qi]: oi })); }}>
                      <span className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center text-xs shrink-0">{"ABCD"[oi]}</span>
                      <span>{o}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!checked ? (
            <button type="button" className="btn-leaf w-full text-lg py-3" disabled={Object.keys(answers).length < data.questions.length} onClick={() => void submitQuiz()}>交卷 ✓</button>
          ) : (
            <div className="rounded-2xl bg-bee-soft/60 p-4 text-center space-y-2">
              <Mascot mood={correctCount === data.questions.length ? "cheer" : "happy"} size={80} className="mx-auto anim-pop" />
              <p className="h-display text-2xl">答对 {correctCount} / {data.questions.length}{saved && saved.stars > 0 ? ` · +${saved.stars} ⭐` : ""}</p>
              {error && <p className="text-berry text-sm font-bold">{error}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-primary" onClick={() => void load()}>📖 再读一篇</button>
                <Link href={`/child/reading?lang=${lang}`} className="btn-secondary">换个级别</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
