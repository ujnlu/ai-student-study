/**
 * 国家中小学智慧教育平台「课程教学」视频：按课时找到官方课的 activityId，拼成播放页链接。
 * 目录：national_lesson/teachingmaterials（每本教材一个 tm）；tm 的章节树节点 id 与我们导入的 TextbookChapter.nodeId 一致；
 * 课列表：teachingmaterials/{tmId}/resources/parts.json → 每节课 chapter_ids 指向章节节点。
 */
import { db } from "@/lib/db";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const TM_VERSION_URL = "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/version/data_version.json";
const PARTS_URL = (tmId: string) => `https://s-file-2.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/${tmId}/resources/parts.json`;
const TREE_URL = (tmId: string) => `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/national_lesson/trees/${tmId}.json`;
export const LESSON_PAGE = (activityId: string, chapterNodeId: string, tmId: string) =>
  `https://basic.smartedu.cn/syncClassroom/classActivity?activityId=${activityId}&chapterId=${chapterNodeId}&teachingmaterialId=${tmId}&fromPrepare=0`;

type Tm = { id: string; title: string; tags: string[] };
type Activity = { id: string; title: string; chapter_ids?: string[] };

const g = globalThis as unknown as {
  __tmCatalog?: { at: number; items: Tm[] };
  __tmForTextbook?: Map<string, string | null>;
  __tmActivities?: Map<string, Activity[]>;
};
g.__tmForTextbook ??= new Map();
g.__tmActivities ??= new Map();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": UA, referer: "https://basic.smartedu.cn/" } });
  if (!res.ok) throw new Error(`请求失败 ${res.status}`);
  return (await res.json()) as T;
}

/** 课程教学目录（每本教材一个 tm，带标签）；导入教材时也用它兜底取章节树 */
export async function lessonCatalog(): Promise<Tm[]> {
  return catalog();
}

async function catalog(): Promise<Tm[]> {
  if (g.__tmCatalog && Date.now() - g.__tmCatalog.at < 12 * 3600_000) return g.__tmCatalog.items;
  const v = await getJson<{ urls: string[] | string }>(TM_VERSION_URL);
  const urls = Array.isArray(v.urls) ? v.urls : v.urls.split(",");
  type Raw = { id: string; title?: string; tag_list?: { tag_name?: string }[] };
  const items: Tm[] = [];
  for (const u of urls) {
    const part = await getJson<Raw[]>(u.trim());
    for (const r of part) items.push({ id: r.id, title: r.title ?? "", tags: (r.tag_list ?? []).map((t) => t.tag_name ?? "") });
  }
  g.__tmCatalog = { at: Date.now(), items };
  return items;
}

const GRADE_NAME = ["", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级"];
const SUBJ_NAME: Record<string, string> = { math: "数学", chinese: "语文", english: "英语" };

async function treeHasNode(tmId: string, nodeId: string) {
  try {
    type N = { id: string; child_nodes?: N[] };
    const tree = await getJson<N[]>(TREE_URL(tmId));
    const stack = [...tree];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.id === nodeId) return true;
      if (n.child_nodes) stack.push(...n.child_nodes);
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** 找到这本教材对应的平台课程（tm）。用标签筛候选，再用章节树验证。 */
async function tmForTextbook(textbookId: string, sampleNodeId: string) {
  if (g.__tmForTextbook!.has(textbookId)) return g.__tmForTextbook!.get(textbookId)!;
  const tb = await db.textbook.findUniqueOrThrow({ where: { id: textbookId }, include: { textbookVersion: true } });
  const items = await catalog();
  const subj = SUBJ_NAME[tb.subjectId];
  const grade = GRADE_NAME[tb.grade];
  const vol = tb.semester === 1 ? "上册" : "下册";
  const ver = tb.textbookVersion.name.replace(/（.*?）|\(.*?\)/g, "");
  // 版本别名：部编版 = 统编版；人教 PEP = 人教版
  const verAliases = [ver, ...(/部编|统编/.test(ver) ? ["统编版", "部编版"] : []), ...(/人教/.test(ver) ? ["人教版"] : [])];
  const matchVer = (x: string) => verAliases.some((a) => a && (x.includes(a) || a.includes(x)));
  const cands = items
    .filter((t) => t.tags.includes("小学") && t.tags.includes(subj) && t.tags.includes(grade) && t.tags.includes(vol))
    .filter((t) => t.tags.some((x) => x && matchVer(x)) || verAliases.some((a) => t.title.includes(a)))
    .sort((a, b) => Number(b.tags.includes("新教材")) - Number(a.tags.includes("新教材")));
  let found: string | null = null;
  for (const c of cands.slice(0, 6)) {
    if (await treeHasNode(c.id, sampleNodeId)) {
      found = c.id;
      break;
    }
  }
  g.__tmForTextbook!.set(textbookId, found);
  return found;
}

async function activitiesOf(tmId: string): Promise<Activity[]> {
  const cached = g.__tmActivities!.get(tmId);
  if (cached) return cached;
  const parts = await getJson<string[] | { urls?: string[] }>(PARTS_URL(tmId));
  const urls = Array.isArray(parts) ? parts : (parts.urls ?? []);
  const out: Activity[] = [];
  for (const u of urls) out.push(...(await getJson<Activity[]>(u)));
  g.__tmActivities!.set(tmId, out);
  return out;
}

/** 解析并缓存某一课的官方视频链接 */
export async function resolveLessonVideo(chapterId: string): Promise<{ url: string; title: string } | null> {
  const guide = await db.lessonGuide.findUnique({ where: { chapterId } });
  if (guide?.videoUrl) return { url: guide.videoUrl, title: guide.videoTitle ?? "" };
  const ch = await db.textbookChapter.findUniqueOrThrow({ where: { id: chapterId } });
  if (!ch.nodeId) return null;
  try {
    const tmId = await tmForTextbook(ch.textbookId, ch.nodeId);
    if (!tmId) return null;
    const acts = await activitiesOf(tmId);
    const hit = acts.find((a) => a.chapter_ids?.includes(ch.nodeId!)) ?? acts.find((a) => a.title.replace(/\s/g, "") === ch.title.replace(/\s/g, ""));
    if (!hit) return null;
    const url = LESSON_PAGE(hit.id, ch.nodeId, tmId);
    await db.lessonGuide.upsert({ where: { chapterId }, create: { chapterId, videoUrl: url, videoTitle: hit.title }, update: { videoUrl: url, videoTitle: hit.title } });
    return { url, title: hit.title };
  } catch (e) {
    console.error("[lesson-video]", e instanceof Error ? e.message : e);
    return null;
  }
}
