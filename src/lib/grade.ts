/** 年级：1-6 小学，7-9 初中，10-12 高中；0 = 家长自学 */
export const GRADE_NAMES = ["", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "七年级", "八年级", "九年级", "高一", "高二", "高三"];
export const GRADE_SHORT = ["", "一", "二", "三", "四", "五", "六", "初一", "初二", "初三", "高一", "高二", "高三"];

export function gradeName(grade: number) {
  return GRADE_NAMES[grade] ?? (grade <= 0 ? "成人" : `${grade}年级`);
}

export type Stage = "primary" | "junior" | "senior";
export function stageOf(grade: number): Stage {
  return grade >= 10 ? "senior" : grade >= 7 ? "junior" : "primary";
}
export const STAGE_NAME: Record<Stage, string> = { primary: "小学", junior: "初中", senior: "高中" };
export const STAGE_GRADES: Record<Stage, number[]> = { primary: [1, 2, 3, 4, 5, 6], junior: [7, 8, 9], senior: [10, 11, 12] };
export const clampGrade = (g: number) => Math.min(12, Math.max(1, Math.round(g) || 1));
