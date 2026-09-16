# 家庭作业小助手

给自家小学 1-6 年级孩子用的作业辅导站（吉祥物「橙橙」）：拍照 → AI 批改（原图标 ✓✗）→ 错题本 → AI 引导式讲解 / 一键动画讲解 → 变式题消灭错题 → 按 1/3/7/15/30 天间隔复习 → 跟学校进度的同步练习 → 每日任务、星星、徽章、打卡、口算 PK、星星商店 → 语文听写、古诗背诵、单元测、作文点评 → 「今天这一课」官方视频 + 预习卡 + 微课动画 → 薄弱巩固练、周末总复习 → 问橙橙随时答疑 → 家长学情报告、AI 周评、奖励兑现、学习时长。
支持多套教材版本、地区设置、可配置的 AI 服务与助手提示词，口算题按年级程序化生成，家长可让 AI 按知识点出题并审核后发给孩子。

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript + Tailwind 4
- Prisma 7 + SQLite（默认，零配置）/ PostgreSQL（改 `DATABASE_URL` 与 `schema.prisma` 的 provider）
- AI：Anthropic 官方 SDK（Claude）+ 任意 OpenAI 兼容接口（DeepSeek / 通义 / 智谱 / Kimi / Ollama …）
- 图片：sharp 压缩后存本地 `data/uploads/`

## 快速开始

```bash
cp .env.example .env        # 改 APP_SECRET（随机长字符串）和 PARENT_PIN
npm install
npx prisma migrate dev      # 建表
npx prisma db seed          # 写入学科、教材版本、人教版数学知识点
npm run dev                 # http://localhost:3000
```

首次使用：

1. 打开 `/login?mode=parent`，用 `.env` 里的 `PARENT_PIN` 登录家长端。
2. 「孩子」→ 添加孩子：昵称、年级、学期、地区、各学科教材版本。
3. 「AI 设置」→ 添加服务：选 Anthropic 或 OpenAI 兼容，填 API Key 与模型（批改作业需要支持图片的模型）。保存后会自动生成 4 个默认助手（批改 / 讲解 / 出题 / 作文），点「测试连通」确认可用。
4. 回到 `/login`，点孩子头像进入孩子端，「拍作业」即可。

## 目录

```
prisma/schema.prisma      数据模型
prisma/seed.ts            学科、教材版本、知识点种子
src/lib/db.ts             Prisma 客户端（按 DATABASE_URL 选 SQLite / PG 适配器）
src/lib/crypto.ts         API Key 加密、PIN 哈希、Cookie 签名
src/lib/auth.ts           家长 / 孩子会话
src/lib/ai/               Provider 抽象、提示词模板、批改流水线
src/lib/sync.ts           同步练习：孩子"学到哪一课"、按课时题库出题（不足时 AI 结合教材原文补题）
src/lib/rewards.ts        星星、等级、徽章、打卡日历
src/lib/report.ts         家长学情报告数据（正确率趋势、单元掌握度、薄弱点、错因）
src/lib/oral.ts           口算题生成器（按年级/学期规则）与答案归一化比对
src/lib/practice.ts       练习流水线：口算 / 变式题 / 复习 / AI 出题、判分、错题状态与复习计划、每日任务
src/lib/ai/explain.ts     一键动画讲解：已有→模板→模型三级；答错即后台预生成，同题只请求一次
src/lib/explain-templates.ts 常见题型（加减乘除、进退位、凑十、口诀、余数、乘加乘减、小数、分数、单位）秒出动画，不调模型
src/lib/textbook-import.ts 教材导入：平台目录、PDF/图片下载、章节树、文字提取、AI 识别、知识点关联
src/lib/textbook-context.ts 为 AI 检索教材原文节选（按知识点所挂章节或标题相似度）
src/lib/smartedu-auth.ts  平台登录凭据的 X-ND-AUTH 签名
scripts/import-textbooks.ts 命令行批量导入
src/app/parent/           家长端：概览、孩子、教材、出题审核、AI 设置、用量
src/app/child/            孩子端（手机底部 Tab）：首页按学科分栏（数学 / 语文 / 英语 / 奥数）、练习、拍作业、错题本、我的、进度设置
src/app/child/topic/      专项 / 奥数专题页：讲一讲（AI 讲义，缓存）+ 练一练（题库按专题沉淀）
src/app/child/speaking/   英语口语：主题跟读打分（浏览器 TTS + 语音识别）、和橙橙聊英语（对话落库）
src/app/child/video/      视频教学：本册每一课的国家平台老师讲课 + 橙橙微课入口
src/lib/topic-catalog.ts  专题目录：奥数 12 级 × 20 讲（八大问题）、语文四板块、英语八模块、素养（科学 / 编程 / 国学）
src/lib/topics.ts         讲义（故事→导引→一例一练→点拨）与三档题库的生成与复用
src/lib/plan.ts           首页"本周计划"自动目标与完成统计
src/lib/speaking.ts       英语口语主题目录、跟读句子生成与复用、对话提示词
src/app/parent/report/    家长学情报告 + AI 周评
src/app/explain/[id]      动画讲解播放器（家长和孩子都可看）
src/app/api/              上传、批改、讲解流式、动画讲解生成、练习创建/提交、连通测试、图片读取
```

## 教材内容导入

家长端「教材」页可从国家中小学智慧教育平台一键导入电子教材（小学全部学科与版本），入库内容包括：章节树（单元 → 课时，带页码）、每页文字、章节与知识点的关联。导入后 AI 批改、讲解、动画、出题都会附上对应章节的教材原文节选。

- 每本书都会下载全部页面图片（压缩后约 15-20 MB/本），查看页以原版页面为主；约一半教材（多为上册）的 PDF 公开可下，会额外提取文字层（按位置重排）供 AI 使用。
- 其余教材（多为下册）PDF 需要登录：在「教材」页粘贴平台登录凭据后可直接下载；没有凭据时自动改为下载全部页面图片，再在书籍页点「用 AI 识别文字」（按页调用「作业批改」助手，需支持图片的模型）。
- 命令行批量导入：`npm run import:textbooks -- math 人教版`、`npm run import:textbooks -- chinese 统编版 2`。
- 文件存在 `data/textbooks/`，仅供家庭内部学习使用，请勿传播。

## 助手角色

添加第一个 AI 服务后会自动生成 5 个默认助手，各自可换模型、改提示词：

| 角色 | 用途 | 建议模型 |
|---|---|---|
| 作业批改 | 看图逐题判对错、归知识点 | 必须支持图片（Claude、qwen-vl、glm-4v…） |
| 引导讲解 | 苏格拉底式对话，不直接给答案 | 任意对话模型 |
| 动画讲解 | 生成分步 SVG 画面 + 旁白 | 输出较长，最大 tokens 建议 ≥ 16000 |
| 出题 / 变式题 | 变式题、复习题、家长布置的练习 | 任意对话模型 |
| 作文点评 | 六维度点评 | 支持图片更好 |

OpenAI 兼容通道会把 JSON Schema 写进提示词并校验返回；Anthropic 通道使用官方结构化输出。

## 换 PostgreSQL

1. `.env` 里 `DATABASE_URL="postgresql://user:pass@host:5432/study"`
2. `prisma/schema.prisma` 里 `provider = "postgresql"`
3. 删除 `prisma/migrations/` 后 `npx prisma migrate dev --name init && npx prisma db seed`

## 备份

数据都在 `data/`（`dev.db` + `uploads/`），整个目录定期拷走即可。
