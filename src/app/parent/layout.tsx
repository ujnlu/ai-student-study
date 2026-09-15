import { requireParent } from "@/lib/auth";
import { TopNav } from "@/components/nav";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  await requireParent();
  return (
    <>
      <TopNav
        title="家长端"
        links={[
          { href: "/parent", label: "概览" },
          { href: "/parent/children", label: "孩子" },
          { href: "/parent/textbooks", label: "教材" },
          { href: "/parent/practice", label: "出题" },
          { href: "/parent/ai", label: "AI 设置" },
          { href: "/parent/usage", label: "用量" },
          { href: "/login", label: "切到孩子端" },
        ]}
      />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
