import Link from "next/link";
import { db } from "@/lib/db";
import { ensureFamily } from "@/lib/auth";
import { childLoginAction } from "@/app/actions/auth";
import { ParentPinForm } from "./parent-pin-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const family = await ensureFamily();
  const children = await db.child.findMany({ where: { familyId: family.id }, orderBy: { createdAt: "asc" } });

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">家庭作业小助手</h1>
      <p className="text-gray-500 mb-8">{mode === "parent" ? "家长登录" : "你是谁？点一下你的头像"}</p>

      {mode === "parent" ? (
        <div className="card w-full max-w-sm">
          <ParentPinForm />
          <p className="mt-4 text-center text-sm">
            <Link href="/login" className="text-gray-500 underline">返回孩子入口</Link>
          </p>
        </div>
      ) : (
        <>
          {children.length === 0 ? (
            <div className="card w-full max-w-sm text-center text-gray-500">
              还没有添加孩子。请家长先登录并添加。
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-lg">
              {children.map((c) => (
                <form key={c.id} action={childLoginAction}>
                  <input type="hidden" name="childId" value={c.id} />
                  <button className="card w-full flex flex-col items-center gap-2 hover:shadow-md active:scale-95 transition">
                    <span className="text-6xl">{c.avatar}</span>
                    <span className="text-lg font-semibold">{c.name}</span>
                    <span className="text-xs text-gray-500">{c.grade}年级</span>
                  </button>
                </form>
              ))}
            </div>
          )}
          <p className="mt-8 text-sm">
            <Link href="/login?mode=parent" className="text-gray-500 underline">我是家长</Link>
          </p>
        </>
      )}
    </main>
  );
}
