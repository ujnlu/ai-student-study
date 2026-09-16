/**
 * 解题讲解：对一道题生成"审题 → 思路 → 步骤 → 答案 → 易错点"的文字讲解，缓存在 Problem.walkthrough。
 * 与动画讲解（Explanation）互补：动画适合低年级看图，文字讲解适合模拟卷 / 成人真题逐题复盘。
 */
import { db } from "@/lib/db";
import { resolveAssistant, runComplete } from "@/lib/ai";
import { gradeText } from "@/lib/ai/prompts";
import { findTopic, SUBJECT_NAME, adultSystemPrompt } from "@/lib/topics";

export async function getOrCreateWalkthrough(problemId: string, childId: string, force = false) {
  const p = await db.problem.findUniqueOrThrow({ where: { id: problemId } });
  if (p.walkthrough && !force) return p.walkthrough;
  const child = await db.child.findUniqueOrThrow({ where: { id: childId } });
  const assistant = await resolveAssistant(child.familyId, "tutor");
  const topic = p.topic ? findTopic(p.topic) : null;
  const adult = child.kind === "adult" || topic?.track === "adult";
  const subject = topic ? SUBJECT_NAME[topic.subjectId] : p.subjectId === "chinese" ? "语文" : p.subjectId === "english" ? "英语" : "数学";
  const system = adult
    ? `${adultSystemPrompt(topic?.subjectId ?? "gongkao")}\n请为下面这道题写一份"解题讲解"，纯文本、分小节：【审题】抓关键词与题型；【思路】用哪个考点 / 套路；【步骤】一步一步推到答案；【答案】；【易错与技巧】常见陷阱和秒杀法。控制在 300 字内，不要用 markdown 符号。`
    : `你是${gradeText(child.grade)}孩子的${subject}老师。请为下面这道题写一份"解题讲解"，孩子能看懂，纯文本、分小节：【读题】这道题在问什么；【思路】用什么方法；【步骤】一步一步算到答案，数字要对；【答案】；【小提醒】容易错在哪。控制在 250 字内，不要用 markdown 符号。`;
  const r = await runComplete(assistant, {
    system,
    messages: [{ role: "user", content: `题目：${p.stem}\n参考答案：${p.answer ?? "（无）"}\n参考解析：${p.solution ?? "（无）"}` }],
  });
  const text = r.text.trim();
  if (!text) throw new Error("没有生成讲解");
  await db.problem.update({ where: { id: problemId }, data: { walkthrough: text } });
  return text;
}
