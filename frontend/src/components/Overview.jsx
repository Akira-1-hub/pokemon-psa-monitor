import { useMemo } from 'react'
import SectionHeader from './SectionHeader.jsx'
import StatGrid from './StatGrid.jsx'
import ProductCard from './ProductCard.jsx'
import { fmt } from '../api.js'

export default function Overview({ products }) {
  // 統計
  const stats = useMemo(() => {
    const boxCount  = products.filter(p => p.product_type === 'BOX').length
    const cardCount = products.filter(p => p.product_type === 'CARD').length
    let totalLatest = 0
    let priceCount  = 0
    products.forEach(p => {
      Object.values(p.series ?? {}).forEach(s => {
        if (s.latest_price != null) {
          totalLatest += s.latest_price
          priceCount  += 1
        }
      })
    })
    return [
      { label: '登録商品数',  value: `${products.length} 件` },
      { label: 'BOX商品',     value: `${boxCount} 件` },
      { label: 'CARD商品',    value: `${cardCount} 件` },
      { label: '平均価格',    value: priceCount > 0
          ? fmt.price(totalLatest / priceCount) : '---' },
    ]
  }, [products])

  // ソート: BOX→CARDの順、価格降順
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      // BOX を先頭に
      if (a.product_type !== b.product_type) {
        return a.product_type === 'BOX' ? -1 : 1
      }
      const ap = Object.values(a.series ?? {})[0]?.latest_price ?? 0
      const bp = Object.values(b.series ?? {})[0]?.latest_price ?? 0
      return bp - ap
    })
  }, [products])

  return (
    <div className="tab-content">
      <StatGrid stats={stats} />

      <SectionHeader>📋 登録商品一覧</SectionHeader>
      {sortedProducts.length === 0 ? (
        <div className="pc-empty">
          商品が登録されていません。<br />
          <code>products.csv</code> に追加して <code>python fetch.py</code> を実行してください。
        </div>
      ) : (
        <div className="pc-scroll">
          {sortedProducts.map((p, i) => (
            <ProductCard key={p.apparel_id} product={p} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
