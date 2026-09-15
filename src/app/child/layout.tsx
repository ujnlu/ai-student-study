import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { levelOf, totalStars, activeDays, streakFrom } from "@/lib/rewards";
import { Mascot } from "@/components/mascot";
import { screenTimeStatus } from "@/lib/screen-time";
import { ScreenTimeBanner } from "@/components/screen-time-banner";

const TABS = [
  { href: "/child", label: "首页", icon: "🏠" },
  { href: "/child/practice", label: "练习", icon: "🧮" },
  { href: "/child/upload", label: "拍作业", icon: "📷" },
  { href: "/child/mistakes", label: "错题", icon: "🎯" },
  { href: "/child/me", label: "我的", icon: "⭐" },
];

export default async function ChildLayout({ children }: { children: React.ReactNode }) {
  const { child } = await requireChild();
  const [stars, days, screen] = await Promise.all([totalStars(child.id), activeDays(child.id, 60), screenTimeStatus(child.id, child.familyId)]);
  const level = levelOf(stars);
  const streak = streakFrom(days);
  return (
    <>
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b-2 border-line">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center gap-3">
          <Link href="/child/me" className="flex items-center gap-2">
            <Mascot mood="happy" size={40} />
            <div className="leading-tight">
              <div className="font-black text-lg">{child.avatar} {child.name}</div>
              <div className="text-[11px] font-bold text-muted">{level.emoji} {level.name}</div>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="badge bg-berry-soft text-berry text-sm py-1 normal-case tracking-normal">🔥 {streak}</span>
            <Link href="/child/me" className="badge bg-bee-soft text-bee-dark text-sm py-1 normal-case tracking-normal">⭐ {stars}</Link>
          </div>
          <nav className="hidden sm:flex gap-1 text-sm font-bold">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className="px-3 py-1.5 rounded-xl hover:bg-brand-soft">{t.icon} {t.label}</Link>
            ))}
          </nav>
          <form action={logoutAction}><button className="text-xs font-bold text-muted hover:text-foreground">退出</button></form>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5 pb-28 sm:pb-8">
        <ScreenTimeBanner minutes={screen.minutes} limit={screen.limit} />
        {children}
      </main>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t-2 border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="flex flex-col items-center py-2 text-[11px] font-extrabold text-muted active:bg-brand-soft">
              <span className="text-2xl leading-none">{t.icon}</span>
              <span className="mt-1">{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
