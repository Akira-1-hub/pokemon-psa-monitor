import { useMemo } from 'react'
import SectionHeader from './SectionHeader.jsx'
import StatGrid from './StatGrid.jsx'
import ProductCard from './ProductCard.jsx'
import { fmt } from '../api.js'

// 代表価格（フォールバック用）
function repPrice(p) {
  if (p.product_type === 'BOX') {
    return p.series?.['1個']?.latest_price ?? 0
  }
  return p.series?.['PSA10']?.latest_price
      ?? p.series?.['A']?.latest_price
      ?? 0
}

// 「熱さスコア」= 7日換算上昇率（騰落率 × 7 / 比較日数）
// 短期間で上がっているカードほど高スコア。データ無しは null。
function hotness(p) {
  const order = p.product_type === 'BOX' ? ['1個'] : ['PSA10', 'A']
  for (const k of order) {
    const s = p.series?.[k]
    if (s?.change_pct != null && s?.change_days) {
      return (s.change_pct * 7) / Math.max(s.change_days, 1)
    }
  }
  return null
}

// 表示セクション定義（上から：ポケカ→ワンピカ→ポケカBOX→ワンピカBOX）
const SECTIONS = [
  { key: 'pokeca-card', label: '🔥 人気ポケカ',        brand: 'pokeca',   type: 'CARD' },
  { key: 'op-card',     label: '🔥 人気ワンピカ',      brand: 'onepiece', type: 'CARD' },
  { key: 'pokeca-box',  label: '📦 ポケカ BOX',        brand: 'pokeca',   type: 'BOX'  },
  { key: 'op-box',      label: '📦 ワンピカ BOX',      brand: 'onepiece', type: 'BOX'  },
]

export default function Overview({ products, onOpenChart }) {
  const stats = useMemo(() => {
    const pokeca = products.filter(p => (p.brand || 'pokeca') === 'pokeca').length
    const op     = products.filter(p => p.brand === 'onepiece').length
    const boxCount  = products.filter(p => p.product_type === 'BOX').length
    return [
      { label: '登録商品数', value: `${products.length} 件`, icon: '📦', accent: 'blue' },
      { label: 'ポケカ',     value: `${pokeca} 件`,          icon: '⚡', accent: 'gold' },
      { label: 'ワンピカ',   value: `${op} 件`,              icon: '☠️', accent: 'red' },
      { label: 'BOX',        value: `${boxCount} 件`,        icon: '🎁', accent: 'purple' },
    ]
  }, [products])

  // セクションごとに振り分け＋「熱さ」順ソート（勢いのあるカードを上位に）
  const grouped = useMemo(() => {
    const result = {}
    for (const sec of SECTIONS) {
      result[sec.key] = products
        .filter(p =>
          (p.brand || 'pokeca') === sec.brand &&
          p.product_type === sec.type)
        .sort((a, b) => {
          const ha = hotness(a), hb = hotness(b)
          // 両方データなし → 価格降順
          if (ha == null && hb == null) return repPrice(b) - repPrice(a)
          if (ha == null) return 1   // データ無しは後ろ
          if (hb == null) return -1
          if (hb !== ha) return hb - ha          // 熱さ降順
          return repPrice(b) - repPrice(a)        // 同点は価格降順
        })
    }
    return result
  }, [products])

  return (
    <div className="tab-content">
      <StatGrid stats={stats} />

      {SECTIONS.map(sec => {
        const rows = grouped[sec.key] || []
        return (
          <div key={sec.key}>
            <SectionHeader>{sec.label}（{rows.length}件）</SectionHeader>
            {rows.length === 0 ? (
              <div className="pc-empty">
                {sec.label} はまだ登録がありません（準備中）
              </div>
            ) : (
              <div className="pc-scroll">
                {rows.map((p, i) => (
                  <ProductCard key={p.apparel_id} product={p} rank={i + 1}
                               onOpen={onOpenChart} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
