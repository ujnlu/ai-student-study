import Link from "next/link";
import type { Topic } from "@/lib/topic-catalog";

/** 各学科的配色（Tailwind 类名要写全，便于扫描） */
export const THEME = {
  math: { name: "数学", emoji: "🧮", soft: "bg-brand-soft", border: "border-brand/30", text: "text-brand-dark", solid: "bg-brand", ring: "border-brand", btn: "btn-primary" },
  chinese: { name: "语文", emoji: "📖", soft: "bg-grape-soft", border: "border-grape/30", text: "text-grape", solid: "bg-grape", ring: "border-grape", btn: "btn bg-grape text-white shadow-[0_4px_0_0_#7c3aed] active:translate-y-[4px] active:shadow-none" },
  english: { name: "英语", emoji: "🔤", soft: "bg-sky-soft", border: "border-sky/30", text: "text-sky-dark", solid: "bg-sky", ring: "border-sky", btn: "btn-sky" },
  olympiad: { name: "奥数", emoji: "🧠", soft: "bg-bee-soft", border: "border-bee/40", text: "text-bee-dark", solid: "bg-bee", ring: "border-bee", btn: "btn bg-bee text-gray-900 shadow-[0_4px_0_0_var(--bee-dark)] active:translate-y-[4px] active:shadow-none" },
  quality: { name: "素养", emoji: "🔬", soft: "bg-leaf-soft", border: "border-leaf/40", text: "text-leaf-dark", solid: "bg-leaf", ring: "border-leaf", btn: "btn-leaf" },
} as const;
export type ThemeKey = keyof typeof THEME;

export type TopicStat = { sets: number; correct: number; total: number; best: number; tiers?: Partial<Record<"basic" | "advanced" | "challenge", number>> };

/** 专题小卡片 */
export function TopicTile({ topic, stat, theme, lectured }: { topic: Topic; stat?: TopicStat; theme: ThemeKey; lectured?: boolean }) {
  const t = THEME[theme];
  const done = stat && stat.sets > 0;
  const mastered = done && stat.best >= 90;
  const tiers = stat?.tiers ?? {};
  return (
    <Link href={`/child/topic/${topic.code}`} className={`tile flex-col items-start gap-1 border-2 py-3 hover:-translate-y-0.5 ${mastered ? "border-leaf/40 bg-leaf-soft/50" : `${t.border} bg-white`}`}>
      <div className="flex items-center gap-2 w-full">
        <span className="text-2xl">{topic.emoji}</span>
        <span className="font-black flex-1 truncate">{topic.name}</span>
        {mastered ? <span className="badge bg-leaf text-white">✓</span> : done ? <span className={`badge ${t.soft} ${t.text}`}>{stat.best}%</span> : lectured ? <span className="badge bg-gray-100 text-muted">已讲</span> : null}
      </div>
      <span className="text-xs font-bold text-muted line-clamp-1 w-full">{topic.desc}</span>
      {topic.practice === "essay" ? (
        <span className="text-[10px] font-extrabold text-grape">✍️ 写一写</span>
      ) : (
        <span className="flex gap-1 text-[10px] font-extrabold">
          {(["basic", "advanced", "challenge"] as const).map((k, i) => {
            const v = tiers[k];
            return <span key={k} className={`px-1.5 rounded-full ${v === undefined ? "bg-gray-100 text-gray-400" : v >= 90 ? "bg-leaf text-white" : "bg-bee-soft text-bee-dark"}`}>{"★".repeat(i + 1)}</span>;
          })}
        </span>
      )}
    </Link>
  );
}

/** 功能入口小方块 */
export function EntryTile({ href, icon, label, sub, theme, className = "" }: { href: string; icon: string; label: string; sub?: string; theme: ThemeKey; className?: string }) {
  const t = THEME[theme];
  return (
    <Link href={href} className={`tile flex-col items-start gap-0.5 border-2 py-3 hover:-translate-y-0.5 ${t.border} ${t.soft} ${className}`}>
      <span className="text-3xl">{icon}</span>
      <span className="font-black">{label}</span>
      {sub && <span className="text-xs font-bold text-muted line-clamp-1">{sub}</span>}
    </Link>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-black text-lg">{children}</h3>
      {right}
    </div>
  );
}

const GRADE_TEXT = ["", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级"];
export function GradeChips({ current, hrefFor }: { current: number; hrefFor: (g: number) => string }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {[1, 2, 3, 4, 5, 6].map((g) => (
        <Link key={g} href={hrefFor(g)} className={g === current ? "chip-on" : "chip"}>{GRADE_TEXT[g]}</Link>
      ))}
    </div>
  );
}
