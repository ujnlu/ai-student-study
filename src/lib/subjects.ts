/** 站内学科：小学 3 科 + 初高中 6 科（道德与法治 / 思想政治合并为 politics） */
export const SUBJECT_NAME: Record<string, string> = {
  math: "数学",
  chinese: "语文",
  english: "英语",
  physics: "物理",
  chemistry: "化学",
  biology: "生物",
  history: "历史",
  geography: "地理",
  politics: "道法 / 政治",
};
export const SUBJECT_ORDER = Object.keys(SUBJECT_NAME);
export const subjectName = (id: string) => SUBJECT_NAME[id] ?? id;
