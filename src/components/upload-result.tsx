import Link from "next/link";
import { db } from "@/lib/db";
import { overrideAttemptAction } from "@/app/actions/study";
import { RegradeButton } from "./regrade-button";
import { ExplainButton } from "./explain-button";
import { MathText } from "./math-text";
import { existingExplanations } from "@/lib/explanations";
import { GradedImage } from "./graded-image";

const ERR: Record<string, string> = {
  concept: "概念不清",
  calculation: "计算错误",
  reading: "审题错误",
  careless: "粗心笔误",
  unknown: "待确认",
};

export async function UploadResult({ uploadId }: { uploadId: string }) {
  const upload = await db.upload.findUniqueOrThrow({
    where: { id: uploadId },
    include: {
      child: true,
      subject: true,
      problems: {
        orderBy: { index: "asc" },
        include: {
          knowledgePoint: true,
          attempts: { orderBy: { createdAt: "desc" }, take: 1 },
          mistakes: true,
        },
      },
    },
  });

  const wrong = upload.problems.filter((p) => p.attempts[0]?.isCorrect === false);
  const explained = await existingExplanations(upload.child.familyId, upload.problems.map((p) => ({ id: p.id, stem: p.stem, answer: p.answer })));

  return (
    <div className="space-y-5">
      <div className="card flex gap-4 items-start">
        <GradedImage
          src={`/api/files/${upload.filePath}`}
          marks={upload.problems
            .filter((p) => p.attempts[0]?.box)
            .map((p) => ({ index: p.index, ok: !!p.attempts[0]?.isCorrect, box: JSON.parse(p.attempts[0]!.box!) as { x: number; y: number; w: number; h: number } }))}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge bg-orange-100 text-orange-800">{upload.subject?.name ?? "未分类"}</span>
            <span className="text-sm text-gray-500">{upload.createdAt.toLocaleString("zh-CN")}</span>
            <StatusBadge status={upload.status} />
          </div>
          {upload.status === "graded" && (
            <p className="mt-2 text-lg">
              共 <b>{upload.problems.length}</b> 题，错 <b className="text-red-600">{wrong.length}</b> 题
            </p>
          )}
          {upload.summary && <p className="mt-1 text-gray-600 text-sm">{upload.summary}</p>}
          {upload.status === "failed" && <p className="mt-2 text-red-600 text-sm">批改失败：{upload.error}</p>}
          <div className="mt-3 flex gap-2">
            <RegradeButton uploadId={upload.id} />
            <a href={`/api/files/${upload.filePath}`} target="_blank" className="btn-secondary text-sm">查看原图</a>
          </div>
        </div>
      </div>

      {upload.problems.length > 0 && (
        <ol className="space-y-3">
          {upload.problems.map((p) => {
            const a = p.attempts[0];
            const ok = a?.isCorrect;
            return (
              <li key={p.id} className={`card border-l-4 ${ok ? "border-l-green-400" : "border-l-red-400"}`}>
                <div className="flex items-start gap-3">
                  <span className={`text-2xl ${ok ? "text-green-500" : "text-red-500"}`}>{ok ? "✓" : "✗"}</span>
                  <div className="flex-1 min-w-0">
                    <MathText as="p" className="font-medium whitespace-pre-wrap" text={`${p.index}. ${p.stem}`} />
                    <div className="mt-1 text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                      <span>孩子答：<b className={ok ? "" : "text-red-600"}>{a?.childAnswer || "（未作答）"}</b></span>
                      {!ok && <span>正确：<b className="text-green-700">{p.answer}</b></span>}
                      {p.knowledgePoint && <span className="badge bg-blue-50 text-blue-700">{p.knowledgePoint.name}</span>}
                      {!ok && a?.errorType && <span className="badge bg-red-50 text-red-700">{ERR[a.errorType] ?? a.errorType}</span>}
                      {a?.overridden && <span className="badge bg-gray-100 text-gray-600">已手动改判</span>}
                    </div>
                    {a?.aiComment && <p className="mt-1 text-sm text-gray-500">{a.aiComment}</p>}
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {!ok && p.mistakes[0] && (
                        <Link href={`/child/mistakes/${p.mistakes[0].id}`} className="btn-secondary text-sm">
                          💬 和老师聊聊
                        </Link>
                      )}
                      <ExplainButton problemId={p.id} childId={upload.childId} existingId={explained.get(p.id)} className={ok ? "btn-secondary text-sm" : "btn-primary text-sm"} label={ok ? "🎬 看讲解" : "🎬 动画讲解"} />
                      <form action={overrideAttemptAction}>
                        <input type="hidden" name="attemptId" value={a?.id} />
                        <input type="hidden" name="isCorrect" value={ok ? "false" : "true"} />
                        <button className="btn-secondary text-sm">{ok ? "其实是错的" : "其实是对的"}</button>
                      </form>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    pending: ["等待批改", "bg-gray-100 text-gray-600"],
    grading: ["批改中…", "bg-yellow-100 text-yellow-800"],
    graded: ["已批改", "bg-green-100 text-green-800"],
    failed: ["失败", "bg-red-100 text-red-800"],
  };
  const [label, cls] = map[status] ?? [status, "bg-gray-100"];
  return <span className={`badge ${cls}`}>{label}</span>;
}
