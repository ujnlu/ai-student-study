import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { addTextbookAction, deleteTextbookAction } from "@/app/actions/children";
import { fetchCatalog, type CatalogBook } from "@/lib/textbook-import";
import { TextbookImportButton } from "@/components/textbook-import-button";
import { saveSmarteduTokenAction } from "@/app/actions/textbooks";
import { SMARTEDU_TOKEN_KEY, TOKEN_SCRIPT } from "@/lib/smartedu-auth";

export const dynamic = "force-dynamic";

export default async function TextbooksPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; version?: string }>;
}) {
  const session = await requireParent();
  const { subject = "math", version } = await searchParams;
  const tokenRow = await db.familySetting.findUnique({ where: { familyId_key: { familyId: session.familyId, key: SMARTEDU_TOKEN_KEY } } });
  const subjects = await db.subject.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      textbookVersions: {
        include: { _count: { select: { knowledgePoints: true, childTextbooks: true, textbooks: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  let catalog: CatalogBook[] = [];
  let catalogError: string | null = null;
  try {
    catalog = (await fetchCatalog()).filter((b) => b.subjectId === subject);
  } catch (e) {
    catalogError = e instanceof Error ? e.message : String(e);
  }
  const versions = [...new Set(catalog.map((b) => b.versionName))];
  const currentVersion = version && versions.includes(version) ? version : versions[0];
  const books = catalog.filter((b) => b.versionName === currentVersion);
  const imported = await db.textbook.findMany({ where: { smarteduId: { in: books.map((b) => b.smarteduId) } } });
  const byId = new Map(imported.map((t) => [t.smarteduId, t]));
  const readyBooks = await db.textbook.findMany({
    where: { status: "ready" },
    include: { textbookVersion: true, subject: true, _count: { select: { chapters: true } } },
    orderBy: [{ subjectId: "asc" }, { grade: "asc" }, { semester: "asc" }],
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">教材</h1>

      <section className="card space-y-3">
        <h2 className="font-semibold">从国家中小学智慧教育平台导入教材内容</h2>
        <p className="text-xs text-gray-500">
          导入后 AI 批改、讲解、出题会参考教材原文（单元、课时、例题）。每本约 20-40 MB，下载加提取 1-2 分钟。教材文件仅供家庭内部学习使用，请勿传播。
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer">
            平台登录凭据（可选）{tokenRow ? <span className="badge bg-green-100 text-green-700 ml-2">已配置</span> : <span className="badge bg-gray-100 text-gray-600 ml-2">未配置</span>}
          </summary>
          <div className="mt-2 space-y-2 text-xs text-gray-600">
            <p>约一半教材（多为下册）的 PDF 需要登录才能下载。没有凭据时会改为下载页面图片，再用 AI 识别文字（按页调用一次视觉模型）。</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>在电脑浏览器打开 basic.smartedu.cn 并登录。</li>
              <li>按 F12 打开控制台（Console），粘贴运行下面脚本，凭据会复制到剪贴板：</li>
            </ol>
            <pre className="bg-gray-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">{TOKEN_SCRIPT}</pre>
            <form action={saveSmarteduTokenAction} className="flex gap-2 items-start">
              <textarea name="token" rows={2} className="input font-mono text-xs" placeholder='{"access_token":"...","mac_key":"...","diff":0}' />
              <button className="btn-secondary text-xs">保存</button>
            </form>
            <p>凭据加密保存在本机数据库，约 7 天过期，过期后重新获取即可。留空保存即清除。</p>
          </div>
        </details>
        {catalogError ? (
          <p className="text-red-600 text-sm">目录获取失败：{catalogError}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              {subjects.map((s) => (
                <Link
                  key={s.id}
                  href={`/parent/textbooks?subject=${s.id}`}
                  className={`px-3 py-1 rounded-lg ${s.id === subject ? "bg-brand text-white" : "bg-gray-100"}`}
                >
                  {s.name}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {versions.map((v) => (
                <Link
                  key={v}
                  href={`/parent/textbooks?subject=${subject}&version=${encodeURIComponent(v)}`}
                  className={`px-2.5 py-1 rounded-lg border ${v === currentVersion ? "border-orange-400 bg-orange-50" : "border-gray-200"}`}
                >
                  {v}
                </Link>
              ))}
            </div>
            <ul className="divide-y">
              {books.map((b) => {
                const t = byId.get(b.smarteduId);
                return (
                  <li key={b.smarteduId} className="py-2 flex items-center gap-3 text-sm">
                    <span className="w-24 text-gray-600">
                      {b.grade}年级{b.semester === 1 ? "上" : "下"}册
                    </span>
                    <span className="flex-1 truncate">
                      {t?.status === "ready" ? (
                        <Link href={`/parent/textbooks/book/${t.id}`} className="hover:underline">{b.title}</Link>
                      ) : (
                        b.title
                      )}
                    </span>
                    <TextbookImportButton
                      smarteduId={b.smarteduId}
                      initial={{ status: t?.status ?? "none", progress: t?.progress, error: t?.error, pageCount: t?.pageCount }}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {readyBooks.length > 0 && (
        <section className="card">
          <h2 className="font-semibold mb-2">已导入的教材</h2>
          <ul className="divide-y text-sm">
            {readyBooks.map((t) => (
              <li key={t.id} className="py-2 flex items-center gap-3">
                <span className="badge bg-orange-50 text-orange-700">{t.subject.name}</span>
                <Link href={`/parent/textbooks/book/${t.id}`} className="flex-1 hover:underline truncate">
                  {t.textbookVersion.name} · {t.title}
                </Link>
                <span className="text-xs text-gray-500">{t.pageCount} 页 · {t._count.chapters} 节</span>
                {t.contentSource === "images" && <span className="badge bg-yellow-100 text-yellow-800">图片版{t.status === "ocr" ? ` · 识别中 ${t.progress}%` : ""}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="text-xl font-bold">教材版本与知识点</h2>
      {subjects.map((sub) => (
        <section key={sub.id} className="card">
          <h3 className="font-semibold text-lg mb-3">{sub.name}</h3>
          <ul className="divide-y">
            {sub.textbookVersions.map((tv) => (
              <li key={tv.id} className="py-2 flex items-center gap-3">
                <div className="flex-1">
                  <Link href={`/parent/textbooks/${tv.id}`} className="font-medium hover:underline">{tv.name}</Link>
                  <span className="text-xs text-gray-500 ml-2">{tv.publisher} {tv.regions ? `· ${tv.regions}` : ""}</span>
                </div>
                <span className="text-xs text-gray-500">{tv._count.textbooks} 本已导入 · {tv._count.knowledgePoints} 个知识点</span>
                {!tv.isBuiltin && tv._count.childTextbooks === 0 && tv._count.textbooks === 0 && (
                  <form action={deleteTextbookAction}>
                    <input type="hidden" name="id" value={tv.id} />
                    <button className="btn-danger text-xs py-1">删除</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <form action={addTextbookAction} className="mt-3 flex flex-wrap gap-2 items-end">
            <input type="hidden" name="subjectId" value={sub.id} />
            <div><label className="label">新版本名称</label><input name="name" className="input" placeholder="如：湘教版" required /></div>
            <div><label className="label">出版社</label><input name="publisher" className="input" /></div>
            <div><label className="label">常见地区</label><input name="regions" className="input" /></div>
            <button className="btn-secondary">添加</button>
          </form>
        </section>
      ))}
    </div>
  );
}
