import { stageOf } from "./grade";

export function paperStageForGrade(grade: number): "primary" | "zhongkao" | "gaokao" {
  const stage = stageOf(grade);
  return stage === "senior" ? "gaokao" : stage === "junior" ? "zhongkao" : "primary";
}

export function canChildUsePaper(grade: number, paperStage: string): boolean {
  return paperStage === paperStageForGrade(grade);
}

/** Older in-progress exam sets must also obey the child's current school stage. */
export function isCompatibleChildExamTopic(topic: string | null, grade: number, paperStages: ReadonlyMap<string, string>): boolean {
  if (!topic) return true;
  if (topic.startsWith("paper-")) return canChildUsePaper(grade, paperStages.get(topic.slice(6)) ?? "");
  if (topic.startsWith("exam-gaokao-")) return paperStageForGrade(grade) === "gaokao";
  if (topic.startsWith("exam-zhongkao-")) return paperStageForGrade(grade) === "zhongkao";
  if (topic.startsWith("exam-")) return false;
  return true;
}
