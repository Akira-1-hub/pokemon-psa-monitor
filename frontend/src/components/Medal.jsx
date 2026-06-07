/**
 * Medal — 月桂樹付き順位メダル（1金 / 2銀 / 3銅）をSVGで描画
 */
const PALETTES = {
  1: { light: '#fff3b0', main: '#f5c531', dark: '#cf9410', text: '#6e5000' },
  2: { light: '#ffffff', main: '#d6dde8', dark: '#a3abba', text: '#3f4654' },
  3: { light: '#f6c79a', main: '#dd9456', dark: '#a55a23', text: '#54290e' },
}

// 片側の月桂樹の葉（回転角度）
const LEAF_ANGLES = [-8, -28, -48, -68, -88]

export default function Medal({ rank, size = 44 }) {
  const p = PALETTES[rank] || PALETTES[3]
  const gid = `medal-grad-${rank}`

  return (
    <svg width={size} height={size} viewBox="0 0 48 48"
         className={`medal-svg medal-rank${rank}`} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={p.light} />
          <stop offset="50%"  stopColor={p.main} />
          <stop offset="100%" stopColor={p.dark} />
        </linearGradient>
      </defs>

      {/* 月桂樹（左右対称） */}
      {[1, -1].map(side => (
        <g key={side} transform={`translate(24,27) scale(${side},1)`}>
          {LEAF_ANGLES.map((a, i) => (
            <ellipse key={i} cx="13.5" cy="0" rx="3.6" ry="1.8"
                     fill={p.main} opacity="0.92"
                     transform={`rotate(${a})`} />
          ))}
          {/* 茎 */}
          <path d="M2 6 Q 10 2 16 -9" stroke={p.dark} strokeWidth="1.2"
                fill="none" opacity="0.7" />
        </g>
      ))}

      {/* メダル本体 */}
      <circle cx="24" cy="21" r="12.5" fill={`url(#${gid})`}
              stroke={p.dark} strokeWidth="1" />
      <circle cx="24" cy="21" r="12.5" fill="none"
              stroke={p.light} strokeWidth="0.7" opacity="0.55" />
      {/* 内側のハイライト */}
      <ellipse cx="20" cy="16" rx="5" ry="3.2" fill={p.light} opacity="0.4" />

      {/* 順位数字 */}
      <text x="24" y="26" textAnchor="middle"
            fontSize="14" fontWeight="900" fill={p.text}
            fontFamily="'Noto Sans JP', sans-serif">{rank}</text>
    </svg>
  )
}
