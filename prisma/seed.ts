import "dotenv/config";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL ?? "file:./data/dev.db";
const db = url.startsWith("postgres")
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  : new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: path.resolve(process.cwd(), url.replace(/^file:/, "")) }) });

const SUBJECTS = [
  { id: "math", name: "数学", sortOrder: 1 },
  { id: "chinese", name: "语文", sortOrder: 2 },
  { id: "english", name: "英语", sortOrder: 3 },
  { id: "physics", name: "物理", sortOrder: 4 },
  { id: "chemistry", name: "化学", sortOrder: 5 },
  { id: "biology", name: "生物", sortOrder: 6 },
  { id: "history", name: "历史", sortOrder: 7 },
  { id: "geography", name: "地理", sortOrder: 8 },
  { id: "politics", name: "道法 / 政治", sortOrder: 9 },
];

// 各学科常见教材版本（内置，家长端可再添加）
const TEXTBOOKS: Record<string, { code: string; name: string; publisher: string; regions: string }[]> = {
  math: [
    { code: "renjiao", name: "人教版", publisher: "人民教育出版社", regions: "全国大部分省市" },
    { code: "beishida", name: "北师大版", publisher: "北京师范大学出版社", regions: "北京部分区、山西、内蒙古、广东部分" },
    { code: "sujiao", name: "苏教版", publisher: "江苏凤凰教育出版社", regions: "江苏" },
    { code: "hujiao", name: "沪教版", publisher: "上海教育出版社", regions: "上海" },
    { code: "xishida", name: "西师大版", publisher: "西南师范大学出版社", regions: "重庆、四川部分" },
    { code: "jijiao", name: "冀教版", publisher: "河北教育出版社", regions: "河北" },
    { code: "qingdao", name: "青岛版", publisher: "青岛出版社", regions: "山东部分" },
    { code: "beijing", name: "北京版", publisher: "北京出版社", regions: "北京部分区" },
    { code: "zhejiao", name: "浙教版", publisher: "浙江教育出版社", regions: "浙江部分" },
  ],
  chinese: [
    { code: "tongbian", name: "部编版（统编）", publisher: "人民教育出版社", regions: "全国统一" },
  ],
  english: [
    { code: "pep", name: "人教 PEP 版", publisher: "人民教育出版社", regions: "全国大部分（三年级起点）" },
    { code: "renjiao-xin", name: "人教新起点", publisher: "人民教育出版社", regions: "一年级起点" },
    { code: "waiyan", name: "外研版（三起）", publisher: "外语教学与研究出版社", regions: "多省市" },
    { code: "waiyan-yiqi", name: "外研版（一起）", publisher: "外语教学与研究出版社", regions: "多省市" },
    { code: "yilin", name: "译林版", publisher: "译林出版社", regions: "江苏" },
    { code: "hujiao-niujin", name: "沪教牛津版", publisher: "上海教育出版社", regions: "上海、广东部分" },
    { code: "beishida-en", name: "北师大版", publisher: "北京师范大学出版社", regions: "部分地区" },
  ],
};

// 人教版小学数学 1-5 年级知识点骨架（按单元），供批改归类与掌握度统计；后续可在家长端补充
type KP = { grade: number; semester: number; unit: string; names: string[] };
const MATH_RENJIAO: KP[] = [
  { grade: 1, semester: 1, unit: "准备课/位置", names: ["数一数", "比多少", "上下前后左右"] },
  { grade: 1, semester: 1, unit: "1-5的认识和加减法", names: ["1-5的认识", "比大小", "第几", "分与合", "5以内加法", "5以内减法", "0的认识"] },
  { grade: 1, semester: 1, unit: "认识图形（一）", names: ["认识立体图形"] },
  { grade: 1, semester: 1, unit: "6-10的认识和加减法", names: ["6和7的认识", "8和9的认识", "10的认识", "10以内加减法", "连加连减", "加减混合"] },
  { grade: 1, semester: 1, unit: "11-20各数的认识", names: ["11-20各数的认识", "十加几和相应的减法"] },
  { grade: 1, semester: 1, unit: "认识钟表", names: ["认识整时"] },
  { grade: 1, semester: 1, unit: "20以内的进位加法", names: ["9加几", "8、7、6加几", "5、4、3、2加几", "20以内进位加法"] },
  { grade: 1, semester: 2, unit: "认识图形（二）", names: ["认识平面图形"] },
  { grade: 1, semester: 2, unit: "20以内的退位减法", names: ["十几减9", "十几减8、7、6", "十几减5、4、3、2", "20以内退位减法"] },
  { grade: 1, semester: 2, unit: "分类与整理", names: ["分类与整理"] },
  { grade: 1, semester: 2, unit: "100以内数的认识", names: ["数数和数的组成", "读数写数", "数的顺序和比较大小", "整十数加减一位数"] },
  { grade: 1, semester: 2, unit: "认识人民币", names: ["认识人民币", "简单的计算"] },
  { grade: 1, semester: 2, unit: "100以内的加法和减法（一）", names: ["整十数加减整十数", "两位数加一位数和整十数", "两位数减一位数和整十数"] },
  { grade: 1, semester: 2, unit: "找规律", names: ["找规律"] },
  { grade: 2, semester: 1, unit: "长度单位", names: ["认识厘米和米", "认识线段"] },
  { grade: 2, semester: 1, unit: "100以内的加法和减法（二）", names: ["两位数加两位数不进位", "两位数加两位数进位", "两位数减两位数不退位", "两位数减两位数退位", "连加连减和加减混合", "求比一个数多几或少几的数"] },
  { grade: 2, semester: 1, unit: "角的初步认识", names: ["认识角", "认识直角"] },
  { grade: 2, semester: 1, unit: "表内乘法（一）", names: ["乘法的初步认识", "2-6的乘法口诀"] },
  { grade: 2, semester: 1, unit: "观察物体（一）", names: ["观察物体"] },
  { grade: 2, semester: 1, unit: "表内乘法（二）", names: ["7-9的乘法口诀", "乘法口诀表"] },
  { grade: 2, semester: 1, unit: "认识时间", names: ["认识几时几分"] },
  { grade: 2, semester: 2, unit: "数据收集整理", names: ["数据收集整理"] },
  { grade: 2, semester: 2, unit: "表内除法（一）", names: ["平均分", "除法的初步认识", "用2-6的乘法口诀求商"] },
  { grade: 2, semester: 2, unit: "图形的运动（一）", names: ["轴对称", "平移和旋转"] },
  { grade: 2, semester: 2, unit: "表内除法（二）", names: ["用7-9的乘法口诀求商", "解决问题（除法）"] },
  { grade: 2, semester: 2, unit: "混合运算", names: ["同级运算", "乘加乘减", "带小括号的混合运算"] },
  { grade: 2, semester: 2, unit: "有余数的除法", names: ["认识余数", "余数和除数的关系", "有余数除法的竖式"] },
  { grade: 2, semester: 2, unit: "万以内数的认识", names: ["1000以内数的认识", "10000以内数的认识", "近似数", "整百整千数加减法"] },
  { grade: 2, semester: 2, unit: "克和千克", names: ["克和千克"] },
  { grade: 3, semester: 1, unit: "时、分、秒", names: ["认识秒", "时间的计算"] },
  { grade: 3, semester: 1, unit: "万以内的加法和减法（一）", names: ["两位数加减两位数口算", "几百几十加减几百几十"] },
  { grade: 3, semester: 1, unit: "测量", names: ["毫米分米的认识", "千米的认识", "吨的认识"] },
  { grade: 3, semester: 1, unit: "万以内的加法和减法（二）", names: ["三位数加三位数", "三位数减三位数", "加减法的验算"] },
  { grade: 3, semester: 1, unit: "倍的认识", names: ["倍的认识", "求一个数是另一个数的几倍", "求一个数的几倍是多少"] },
  { grade: 3, semester: 1, unit: "多位数乘一位数", names: ["口算乘法", "多位数乘一位数不进位", "多位数乘一位数进位", "中间末尾有0的乘法", "解决问题（乘法）"] },
  { grade: 3, semester: 1, unit: "长方形和正方形", names: ["四边形", "周长", "长方形和正方形的周长"] },
  { grade: 3, semester: 1, unit: "分数的初步认识", names: ["几分之一", "几分之几", "分数的简单计算", "分数的简单应用"] },
  { grade: 3, semester: 2, unit: "位置与方向（一）", names: ["认识东南西北"] },
  { grade: 3, semester: 2, unit: "除数是一位数的除法", names: ["口算除法", "一位数除两位数", "一位数除三位数", "商中间末尾有0的除法", "除法的验算"] },
  { grade: 3, semester: 2, unit: "复式统计表", names: ["复式统计表"] },
  { grade: 3, semester: 2, unit: "两位数乘两位数", names: ["口算乘法", "两位数乘两位数不进位", "两位数乘两位数进位", "解决问题（连乘连除）"] },
  { grade: 3, semester: 2, unit: "面积", names: ["面积和面积单位", "长方形正方形的面积", "面积单位间的进率"] },
  { grade: 3, semester: 2, unit: "年、月、日", names: ["年月日", "24时计时法"] },
  { grade: 3, semester: 2, unit: "小数的初步认识", names: ["认识小数", "小数的大小比较", "简单的小数加减法"] },
  { grade: 4, semester: 1, unit: "大数的认识", names: ["亿以内数的认识", "数的产生和十进制计数法", "亿以上数的认识", "计算工具的认识"] },
  { grade: 4, semester: 1, unit: "公顷和平方千米", names: ["公顷和平方千米"] },
  { grade: 4, semester: 1, unit: "角的度量", names: ["线段直线射线", "角的度量", "角的分类", "画角"] },
  { grade: 4, semester: 1, unit: "三位数乘两位数", names: ["三位数乘两位数", "因数中间末尾有0的乘法", "积的变化规律", "单价数量总价", "速度时间路程"] },
  { grade: 4, semester: 1, unit: "平行四边形和梯形", names: ["平行与垂直", "平行四边形", "梯形"] },
  { grade: 4, semester: 1, unit: "除数是两位数的除法", names: ["口算除法", "除数是整十数的除法", "用四舍五入试商", "商是两位数的除法", "商的变化规律"] },
  { grade: 4, semester: 1, unit: "条形统计图", names: ["条形统计图"] },
  { grade: 4, semester: 2, unit: "四则运算", names: ["加减法的意义", "乘除法的意义", "含括号的四则运算", "0的运算"] },
  { grade: 4, semester: 2, unit: "观察物体（二）", names: ["观察物体"] },
  { grade: 4, semester: 2, unit: "运算定律", names: ["加法交换律结合律", "乘法交换律结合律", "乘法分配律", "简便计算"] },
  { grade: 4, semester: 2, unit: "小数的意义和性质", names: ["小数的意义", "小数的读写", "小数的性质", "小数的大小比较", "小数点移动规律", "小数与单位换算", "小数的近似数"] },
  { grade: 4, semester: 2, unit: "三角形", names: ["三角形的特性", "三角形的分类", "三角形的内角和"] },
  { grade: 4, semester: 2, unit: "小数的加法和减法", names: ["小数加减法", "小数加减混合运算", "小数加减简便运算"] },
  { grade: 4, semester: 2, unit: "图形的运动（二）", names: ["轴对称", "平移"] },
  { grade: 4, semester: 2, unit: "平均数与条形统计图", names: ["平均数", "复式条形统计图"] },
  { grade: 5, semester: 1, unit: "小数乘法", names: ["小数乘整数", "小数乘小数", "积的近似数", "整数乘法运算定律推广到小数", "小数乘法解决问题"] },
  { grade: 5, semester: 1, unit: "位置", names: ["用数对确定位置"] },
  { grade: 5, semester: 1, unit: "小数除法", names: ["除数是整数的小数除法", "一个数除以小数", "商的近似数", "循环小数", "用计算器探索规律", "小数除法解决问题"] },
  { grade: 5, semester: 1, unit: "可能性", names: ["可能性"] },
  { grade: 5, semester: 1, unit: "简易方程", names: ["用字母表示数", "方程的意义", "等式的性质", "解方程", "实际问题与方程"] },
  { grade: 5, semester: 1, unit: "多边形的面积", names: ["平行四边形的面积", "三角形的面积", "梯形的面积", "组合图形的面积"] },
  { grade: 5, semester: 1, unit: "植树问题", names: ["植树问题"] },
  { grade: 5, semester: 2, unit: "观察物体（三）", names: ["观察物体"] },
  { grade: 5, semester: 2, unit: "因数与倍数", names: ["因数和倍数", "2、5、3的倍数特征", "质数和合数"] },
  { grade: 5, semester: 2, unit: "长方体和正方体", names: ["长方体和正方体的认识", "长方体和正方体的表面积", "体积和体积单位", "长方体和正方体的体积", "容积和容积单位"] },
  { grade: 5, semester: 2, unit: "分数的意义和性质", names: ["分数的意义", "真分数和假分数", "分数的基本性质", "约分", "通分", "分数和小数的互化"] },
  { grade: 5, semester: 2, unit: "图形的运动（三）", names: ["旋转"] },
  { grade: 5, semester: 2, unit: "分数的加法和减法", names: ["同分母分数加减法", "异分母分数加减法", "分数加减混合运算"] },
  { grade: 5, semester: 2, unit: "折线统计图", names: ["折线统计图"] },
  { grade: 5, semester: 2, unit: "找次品", names: ["找次品"] },
];

async function main() {
  for (const s of SUBJECTS) {
    await db.subject.upsert({ where: { id: s.id }, create: s, update: { name: s.name, sortOrder: s.sortOrder } });
  }
  for (const [subjectId, list] of Object.entries(TEXTBOOKS)) {
    for (const t of list) {
      await db.textbookVersion.upsert({
        where: { subjectId_code: { subjectId, code: t.code } },
        create: { subjectId, ...t },
        update: { name: t.name, publisher: t.publisher, regions: t.regions },
      });
    }
  }
  const renjiao = await db.textbookVersion.findUniqueOrThrow({ where: { subjectId_code: { subjectId: "math", code: "renjiao" } } });
  const count = await db.knowledgePoint.count({ where: { textbookVersionId: renjiao.id } });
  if (count === 0) {
    let order = 0;
    for (const u of MATH_RENJIAO) {
      for (const name of u.names) {
        await db.knowledgePoint.create({
          data: { subjectId: "math", textbookVersionId: renjiao.id, grade: u.grade, semester: u.semester, unit: u.unit, name, sortOrder: order++ },
        });
      }
    }
    console.log(`seeded ${order} knowledge points for 人教版数学`);
  }
  console.log("seed done");
}

main().finally(() => db.$disconnect());
