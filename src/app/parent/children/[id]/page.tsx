import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { saveChildAction } from "@/app/actions/children";

const AVATARS = ["🐼", "🐯", "🦊", "🐰", "🐸", "🦁", "🐨", "🐵", "🦄", "🐙", "🚀", "🌟"];
const REGIONS = ["北京", "上海", "天津", "重庆", "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "四川", "贵州", "云南", "陕西", "甘肃", "青海", "内蒙古", "西藏", "宁夏", "新疆", "香港", "澳门", "台湾"];

export default async function ChildEditPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireParent();
  const { id } = await params;
  const child = id === "new" ? null : await db.child.findFirst({ where: { id, familyId: s.familyId }, include: { textbooks: true } });
  const subjects = await db.subject.findMany({ orderBy: { sortOrder: "asc" }, include: { textbookVersions: { orderBy: { createdAt: "asc" } } } });

  return (
    <form action={saveChildAction} className="card max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{child ? "编辑孩子" : "添加孩子"}</h1>
      {child && <input type="hidden" name="id" value={child.id} />}

      <div>
        <label className="label">昵称</label>
        <input name="name" defaultValue={child?.name ?? ""} className="input" required />
      </div>

      <div>
        <label className="label">头像</label>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <label key={a} className="cursor-pointer">
              <input type="radio" name="avatar" value={a} defaultChecked={(child?.avatar ?? "🐼") === a} className="peer sr-only" />
              <span className="block text-3xl p-2 rounded-xl border-2 border-transparent peer-checked:border-orange-400 peer-checked:bg-orange-50">{a}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">年级</label>
          <select name="grade" defaultValue={child?.grade ?? 1} className="input">
            {[1, 2, 3, 4, 5, 6].map((g) => <option key={g} value={g}>{g} 年级</option>)}
          </select>
        </div>
        <div>
          <label className="label">学期</label>
          <select name="semester" defaultValue={child?.semester ?? 1} className="input">
            <option value={1}>上学期</option>
            <option value={2}>下学期</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">所在地区（影响批改时的地方考情说法，可留空）</label>
        <input name="region" list="regions" defaultValue={child?.region ?? ""} className="input" placeholder="如：江苏-南京" />
        <datalist id="regions">{REGIONS.map((r) => <option key={r} value={r} />)}</datalist>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-semibold">各学科教材版本（随时可以换）</legend>
        {subjects.map((sub) => {
          const current = child?.textbooks.find((t) => t.subjectId === sub.id)?.textbookVersionId ?? sub.textbookVersions[0]?.id;
          return (
            <div key={sub.id}>
              <label className="label">{sub.name}</label>
              <select name={`textbook_${sub.id}`} defaultValue={current} className="input">
                {sub.textbookVersions.map((tv) => (
                  <option key={tv.id} value={tv.id}>{tv.name}{tv.regions ? `（${tv.regions}）` : ""}</option>
                ))}
              </select>
            </div>
          );
        })}
        <p className="text-xs text-gray-500">列表里没有的版本可以到「教材」页添加。</p>
      </fieldset>

      <button className="btn-primary">保存</button>
    </form>
  );
}
