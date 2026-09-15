/**
 * 吉祥物「橙橙」：一只圆滚滚的小橘猫，纯 SVG，可换表情。
 * moods: happy 微笑 | cheer 欢呼 | think 思考 | sad 难过 | sleep 休息
 */
export type Mood = "happy" | "cheer" | "think" | "sad" | "sleep";

export function Mascot({ mood = "happy", size = 120, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const eyes =
    mood === "sleep"
      ? `<path d='M70 92 q10 8 20 0' stroke='#7c2d12' stroke-width='5' fill='none' stroke-linecap='round'/><path d='M110 92 q10 8 20 0' stroke='#7c2d12' stroke-width='5' fill='none' stroke-linecap='round'/>`
      : mood === "cheer"
        ? `<path d='M68 95 q12 -14 24 0' stroke='#7c2d12' stroke-width='6' fill='none' stroke-linecap='round'/><path d='M108 95 q12 -14 24 0' stroke='#7c2d12' stroke-width='6' fill='none' stroke-linecap='round'/>`
        : `<g class='mascot-eye'><circle cx='80' cy='92' r='9' fill='#3b1d0f'/><circle cx='120' cy='92' r='9' fill='#3b1d0f'/><circle cx='83' cy='89' r='3' fill='#fff'/><circle cx='123' cy='89' r='3' fill='#fff'/></g>`;
  const mouth =
    mood === "sad"
      ? `<path d='M86 122 q14 -10 28 0' stroke='#7c2d12' stroke-width='5' fill='none' stroke-linecap='round'/>`
      : mood === "cheer"
        ? `<path d='M82 114 q18 22 36 0 z' fill='#7c2d12'/><path d='M90 122 q10 8 20 0 z' fill='#ff8fa3'/>`
        : mood === "think"
          ? `<path d='M90 120 q10 4 20 -2' stroke='#7c2d12' stroke-width='5' fill='none' stroke-linecap='round'/>`
          : `<path d='M86 114 q14 14 28 0' stroke='#7c2d12' stroke-width='5' fill='none' stroke-linecap='round'/>`;
  const brows = mood === "think" ? `<path d='M70 74 l20 -6' stroke='#7c2d12' stroke-width='5' stroke-linecap='round'/><path d='M130 70 l-20 -2' stroke='#7c2d12' stroke-width='5' stroke-linecap='round'/>` : mood === "sad" ? `<path d='M70 72 l20 6' stroke='#7c2d12' stroke-width='5' stroke-linecap='round'/><path d='M130 72 l-20 6' stroke='#7c2d12' stroke-width='5' stroke-linecap='round'/>` : "";
  const extras =
    mood === "think"
      ? `<circle cx='158' cy='50' r='6' fill='#c7d2fe'/><circle cx='172' cy='34' r='9' fill='#c7d2fe'/><text x='172' y='40' font-size='14' text-anchor='middle' fill='#4338ca' font-weight='bold'>?</text>`
      : mood === "cheer"
        ? `<path d='M28 40 l8 12 l12 -4 l-6 12 l10 8 l-14 0 l-4 14 l-6 -12 l-14 2 l10 -10 l-8 -10 l14 2 z' fill='#ffc800'/><path d='M168 30 l6 9 l10 -3 l-5 9 l8 6 l-11 0 l-3 11 l-5 -9 l-11 1 l8 -8 l-6 -8 l11 2 z' fill='#ffc800'/>`
        : mood === "sleep"
          ? `<text x='160' y='50' font-size='26' fill='#93c5fd' font-weight='bold'>z</text><text x='175' y='32' font-size='18' fill='#93c5fd' font-weight='bold'>z</text>`
          : "";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>
    <ellipse cx='100' cy='178' rx='60' ry='10' fill='#000' opacity='0.08'/>
    <path d='M52 62 L40 20 L84 46 Z' fill='#ff7a1a'/><path d='M56 58 L48 32 L76 50 Z' fill='#ffb27a'/>
    <path d='M148 62 L160 20 L116 46 Z' fill='#ff7a1a'/><path d='M144 58 L152 32 L124 50 Z' fill='#ffb27a'/>
    <ellipse cx='100' cy='110' rx='70' ry='66' fill='#ff8c2e'/>
    <path d='M60 70 q40 -20 80 0 q-6 30 -40 30 q-34 0 -40 -30 z' fill='#ffa24d' opacity='0.6'/>
    <ellipse cx='100' cy='132' rx='34' ry='22' fill='#fff1e3'/>
    <path d='M96 106 l4 -4 l4 4 q-4 5 -8 0 z' fill='#7c2d12'/>
    ${brows}${eyes}${mouth}
    <circle cx='62' cy='114' r='9' fill='#ff9db0' opacity='0.7'/><circle cx='138' cy='114' r='9' fill='#ff9db0' opacity='0.7'/>
    <path d='M30 118 l-18 -4 M30 126 l-18 4 M170 118 l18 -4 M170 126 l18 4' stroke='#7c2d12' stroke-width='3' stroke-linecap='round'/>
    ${extras}
  </svg>`;
  return <span className={`inline-block ${className}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** 吉祥物 + 气泡 */
export function MascotSays({ mood = "happy", children, size = 96 }: { mood?: Mood; children: React.ReactNode; size?: number }) {
  return (
    <div className="flex items-end gap-3">
      <Mascot mood={mood} size={size} className="anim-float shrink-0" />
      <div className="relative card-flat rounded-3xl rounded-bl-md bg-white text-base font-bold leading-relaxed">
        {children}
      </div>
    </div>
  );
}
