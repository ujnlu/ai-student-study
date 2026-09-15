import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";

export function TopNav({ title, links, right }: { title: string; links: { href: string; label: string }[]; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-4">
        <Link href={links[0]?.href ?? "/"} className="font-bold text-lg whitespace-nowrap">{title}</Link>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-1.5 rounded-lg hover:bg-gray-100 whitespace-nowrap">{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {right}
          <form action={logoutAction}><button className="text-sm text-gray-500 hover:text-gray-800">退出</button></form>
        </div>
      </div>
    </header>
  );
}
