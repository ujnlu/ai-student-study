import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";

const NAV = [
  { href: "/parent", label: "概览", icon: "📊" },
  { href: "/parent/children", label: "孩子档案", icon: "👧" },
  { href: "/parent/practice", label: "出题与练习", icon: "📝" },
  { href: "/parent/rewards", label: "奖励兑换", icon: "🎁" },
  { href: "/parent/textbooks", label: "教材", icon: "📚" },
  { href: "/parent/screen-time", label: "学习时长", icon: "⏱️" },
  { href: "/parent/ai", label: "AI 设置", icon: "🤖" },
  { href: "/parent/usage", label: "用量", icon: "📈" },
  { href: "/parent/study", label: "家长自学", icon: "🎓" },
];

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  await requireParent();
  return (
    <div className="theme-parent min-h-full flex flex-col lg:flex-row bg-background">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-white border-r border-line sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-line">
          <p className="h-display text-lg">橙橙学习小屋</p>
          <p className="text-xs font-bold text-muted">家长端</p>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-foreground/80 hover:bg-brand-soft hover:text-brand-dark">
              <span className="text-lg">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-line space-y-1">
          <Link href="/login" className="flex items-center gap-3 px-3 py-2 rounded-xl font-bold text-sm text-sky hover:bg-sky-soft">🧒 切到孩子端</Link>
          <form action={logoutAction}><button className="flex w-full items-center gap-3 px-3 py-2 rounded-xl font-bold text-sm text-muted hover:bg-gray-100">🚪 退出登录</button></form>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-line">
          <div className="px-4 h-14 flex items-center gap-3">
            <span className="h-display">家长端</span>
            <nav className="flex gap-1 overflow-x-auto text-sm font-bold ml-2">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="px-2.5 py-1.5 rounded-lg hover:bg-brand-soft whitespace-nowrap">{n.icon} {n.label}</Link>
              ))}
            </nav>
            <form action={logoutAction} className="ml-auto"><button className="text-xs font-bold text-muted">退出</button></form>
          </div>
        </header>
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 lg:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
