import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { levelOf, totalStars } from "@/lib/rewards";

const TABS = [
  { href: "/child", label: "首页", icon: "🏠" },
  { href: "/child/practice", label: "练习", icon: "🧮" },
  { href: "/child/upload", label: "拍作业", icon: "📷" },
  { href: "/child/mistakes", label: "错题", icon: "🎯" },
  { href: "/child/me", label: "我的", icon: "⭐" },
];

export default async function ChildLayout({ children }: { children: React.ReactNode }) {
  const { child } = await requireChild();
  const stars = await totalStars(child.id);
  const level = levelOf(stars);
  return (
    <>
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
          <Link href="/child/me" className="flex items-center gap-2">
            <span className="text-2xl">{child.avatar}</span>
            <span className="font-bold">{child.name}</span>
            <span className="text-xs text-gray-500">{level.emoji} {level.name}</span>
          </Link>
          <Link href="/child/me" className="ml-auto badge bg-amber-100 text-amber-800 text-sm py-1">⭐ {stars}</Link>
          <nav className="hidden sm:flex gap-1 text-sm">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className="px-3 py-1.5 rounded-lg hover:bg-gray-100">{t.icon} {t.label}</Link>
            ))}
          </nav>
          <form action={logoutAction}><button className="text-xs text-gray-400 hover:text-gray-700">退出</button></form>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5 pb-24 sm:pb-8">{children}</main>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="flex flex-col items-center py-2 text-[11px] text-gray-600 active:bg-orange-50">
              <span className="text-2xl leading-none">{t.icon}</span>
              <span className="mt-1">{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
