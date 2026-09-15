import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { db } from "@/lib/db";
import { unitInfo, UNIT_TEST_SECONDS, UNIT_TEST_SIZE } from "@/lib/unit-test";
import { Mascot } from "@/components/mascot";
import { StartFlowButton } from "@/components/start-flow-button";

export default async function UnitTestIntroPage() {
  const { child } = await requireChild();
  const subjectId = "math";
  const [info, pending, recent] = await Promise.all([
    unitInfo(child.id, subjectId).catch(() => null),
    db.practiceSet.findFirst({ where: { childId: child.id, kind: "unit", status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findMany({ where: { childId: child.id, kind: "unit", status: "done" }, orderBy: { completedAt: "desc" }, take: 5 }),
  ]);
  const minutes = Math.round(UNIT_TEST_SECONDS / 60);

  return (
    <div className="space-y-5">
      <div className="card bg-gradient-to-br from-sky-soft via-white to-white border-sky/30 text-center py-8">
        <Mascot mood="think" size={130} className="anim-float" />
        <h1 className="text-3xl h-display mt-3">📝 单元测试</h1>
        {info ? (
          <>
            <p className="text-xl font-extrabold text-sky-dark mt-2">{info.unitTitle}</p>
            <p className="text-muted font-bold mt-1">这个单元一共 {info.lessonCount} 课，我们来检查一下学得怎么样</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <span className="chip">📚 {info.lessonCount} 课</span>
              <span className="chip">✏️ {UNIT_TEST_SIZE} 题</span>
              <span className="chip">⏱ {minutes} 分钟</span>
            </div>
            <div className="mt-5">
              <StartFlowButton
                url="/api/unit-test"
                body={{ subjectId }}
                redirect="/child/practice/{id}"
                label={pending ? "继续测试 ➡️" : "开始测试 🚀"}
                busyLabel={info.bankCount >= UNIT_TEST_SIZE ? "正在组卷…" : "老师正在出题，大约 30 秒…"}
                className="btn-sky text-2xl px-10 py-4"
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-muted font-bold mt-2">还没有导入数学教材，请先让爸爸妈妈在家长端「教材」页导入。</p>
            <Link href="/child" className="btn-secondary mt-4">回首页</Link>
          </>
        )}
      </div>

      <section className="card">
        <h2 className="text-xl h-display mb-3">📜 测试小提示</h2>
        <ul className="space-y-2 font-bold text-[15px]">
          <li className="flex gap-2"><span>1️⃣</span><span>题目来自这个单元的每一课，从易到难。</span></li>
          <li className="flex gap-2"><span>2️⃣</span><span>限时 {minutes} 分钟，时间到会自动交卷，没写的算错。</span></li>
          <li className="flex gap-2"><span>3️⃣</span><span>每题答完立刻知道对错，错题会进错题本，之后可以看讲解。</span></li>
          <li className="flex gap-2"><span>⭐</span><span>每答对 1 题 +1 星，全对再 +10 星！</span></li>
        </ul>
        <p className="text-xs text-muted mt-3">
          学到哪一课不对？<Link href="/child/progress" className="underline">去调整进度</Link>
        </p>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="font-extrabold mb-2">最近的单元测</h2>
          <ul className="space-y-2">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/child/practice/${s.id}`} className="card-flat flex items-center gap-3 hover:shadow-md">
                  <span className="flex-1 truncate font-bold">{s.title}</span>
                  <span className={`font-extrabold ${s.score === s.total ? "text-leaf" : ""}`}>{s.score}/{s.total}</span>
                  <span className="text-xs text-muted">{s.completedAt?.toLocaleDateString("zh-CN")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
