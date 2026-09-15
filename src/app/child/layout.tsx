import { requireChild } from "@/lib/auth";
import { TopNav } from "@/components/nav";

export default async function ChildLayout({ children }: { children: React.ReactNode }) {
  const { child } = await requireChild();
  return (
    <>
      <TopNav
        title={`${child.avatar} ${child.name}`}
        links={[
          { href: "/child", label: "首页" },
          { href: "/child/upload", label: "📷 拍作业" },
          { href: "/child/practice", label: "🧮 练习" },
          { href: "/child/mistakes", label: "错题本" },
        ]}
      />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5">{children}</main>
    </>
  );
}
