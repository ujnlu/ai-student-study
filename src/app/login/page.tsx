import Link from "next/link";
import { db } from "@/lib/db";
import { ensureFamily } from "@/lib/auth";
import { childLoginAction } from "@/app/actions/auth";
import { ParentPinForm } from "./parent-pin-form";
import { Mascot } from "@/components/mascot";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const family = await ensureFamily();
  const children = await db.child.findMany({ where: { familyId: family.id }, orderBy: { createdAt: "asc" } });

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 bg-[radial-gradient(circle_at_20%_10%,#fff1e3_0,transparent_40%),radial-gradient(circle_at_80%_90%,#e6f6ff_0,transparent_40%)]">
      <Mascot mood={mode === "parent" ? "think" : "cheer"} size={140} className="anim-float" />
      <h1 className="h-display text-4xl mt-2">橙橙学习小屋</h1>
      <p className="text-muted font-bold mt-2 mb-8">{mode === "parent" ? "家长登录" : "你是谁？点一下你的头像"}</p>

      {mode === "parent" ? (
        <div className="card w-full max-w-sm">
          <ParentPinForm />
          <p className="mt-4 text-center text-sm">
            <Link href="/login" className="btn-ghost">← 返回孩子入口</Link>
          </p>
        </div>
      ) : (
        <>
          {children.length === 0 ? (
            <div className="card w-full max-w-sm text-center text-muted font-bold">还没有添加孩子。请家长先登录并添加。</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-lg">
              {children.map((c) => (
                <form key={c.id} action={childLoginAction}>
                  <input type="hidden" name="childId" value={c.id} />
                  <button className="card w-full flex flex-col items-center gap-2 border-b-8 border-b-line hover:border-brand hover:border-b-brand-dark active:translate-y-1 active:border-b-4 transition">
                    <span className="text-7xl">{c.avatar}</span>
                    <span className="text-xl font-black">{c.name}</span>
                    <span className="badge bg-brand-soft text-brand-dark">{c.grade} 年级</span>
                  </button>
                </form>
              ))}
            </div>
          )}
          <p className="mt-10">
            <Link href="/login?mode=parent" className="btn-secondary">👨‍👩‍👧 我是家长</Link>
          </p>
        </>
      )}
    </main>
  );
}
