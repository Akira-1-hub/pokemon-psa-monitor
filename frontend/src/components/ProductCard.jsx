import { fmt } from '../api.js'

const SERIES_COLORS = {
  '1個':   '#3b82f6',
  'PSA10': '#f59e0b',
  'A':     '#10b981',
  'ALL':   '#ec4899',  // 条件混在
}

/**
 * ProductCard — 商品1件のカード
 *   BOX: snkrdunk 1個 価格
 *   CARD: snkrdunk PSA10/A 価格 + pokeca PSA統計
 */
export default function ProductCard({ product, rank }) {
  const seriesNames = Object.keys(product.series || {})
  const pokeca = product.pokeca || {}
  const isCard = product.product_type === 'CARD'

  return (
    <div className="pc-card" style={{ flex: '0 0 240px' }}>
      {/* 画像 */}
      {product.img_url ? (
        <div className="pc-card-img-wrap" style={{ height: 180 }}>
          <img
            src={product.img_url}
            alt={product.display_name}
            className="pc-card-img"
            style={{ objectFit: 'contain', background: '#0a0a14' }}
            onError={e => {
              e.currentTarget.parentElement.innerHTML =
                '<div class="pc-card-no-img">NO IMAGE</div>'
            }}
          />
        </div>
      ) : (
        <div className="pc-card-no-img" style={{ height: 180 }}>NO IMAGE</div>
      )}

      <div className="pc-badge" style={{
        background: isCard ? '#7c3aed' : '#2563eb',
      }}>
        {rank}位 / {product.product_type}
      </div>

      <div className="pc-info">
        <div className="pc-name" title={product.display_name}>
          {product.display_name}
        </div>

        {/* シリーズ別の snkrdunk 価格 */}
        {seriesNames.map(sname => {
          const s = product.series[sname]
          const color = SERIES_COLORS[sname] ?? '#6a7a94'
          const cls = s.change == null ? 'pc-nt'
                    : s.change > 0 ? 'pc-up' : s.change < 0 ? 'pc-dn' : 'pc-nt'
          return (
            <div key={sname} style={{
              marginBottom: 6, paddingTop: 6,
              borderTop: '1px solid #1c1c2c',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'baseline', marginBottom: 3,
              }}>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700,
                  color, letterSpacing: '0.04em',
                }}>
                  {sname}
                </span>
                <span style={{ fontSize: '0.62rem', color: '#3a4a60' }}>
                  {s.latest_date}
                </span>
              </div>
              <div className="pc-price" style={{ marginBottom: 3 }}>
                {fmt.price(s.latest_price)}
              </div>
              <div className="pc-row">
                <span className="pc-rlbl">変動(7日)</span>
                <span className={cls}>{fmt.change(s.change)}</span>
              </div>
              <div className="pc-row">
                <span className="pc-rlbl">騰落率</span>
                <span className={cls}>{fmt.pct(s.change_pct)}</span>
              </div>
            </div>
          )
        })}

        {/* PSA統計 (CARDのみ・pokecaあり) */}
        {isCard && pokeca.psa10_pop != null && (
          <div style={{
            marginTop: 8, paddingTop: 6,
            borderTop: '1px dashed #2a3a5c',
          }}>
            <div style={{
              fontSize: '0.66rem', fontWeight: 700,
              color: '#ec4899', letterSpacing: '0.04em',
              marginBottom: 4,
            }}>
              PSA鑑定統計
            </div>
            <div className="pc-row">
              <span className="pc-rlbl">PSA10枚数</span>
              <span style={{ color: '#fff' }}>{fmt.pop(pokeca.psa10_pop)}</span>
            </div>
            <div className="pc-row">
              <span className="pc-rlbl">PSA合計枚数</span>
              <span style={{ color: '#fff' }}>{fmt.pop(pokeca.psa_total)}</span>
            </div>
            <div className="pc-row">
              <span className="pc-rlbl">PSA10取得率</span>
              <span style={{ color: '#4ade80' }}>{fmt.ratePct(pokeca.psa10_rate)}</span>
            </div>
            {product.market_cap != null && (
              <div className="pc-row">
                <span className="pc-rlbl">時価総額</span>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                  {fmt.price(product.market_cap)}
                </span>
              </div>
            )}
            {pokeca.supply_pressure != null && (
              <div className="pc-row">
                <span className="pc-rlbl">供給圧</span>
                <span style={{ color: '#fff' }}>{fmt.decimal3(pokeca.supply_pressure)}</span>
              </div>
            )}
          </div>
        )}

        <a href={product.snkrdunk_url} target="_blank" rel="noopener noreferrer"
           style={{
             display: 'block', marginTop: 8,
             color: '#3b82f6', fontSize: '0.7rem',
             textDecoration: 'none', textAlign: 'center',
           }}>
          snkrdunk で見る →
        </a>
        {product.pokeca_url && (
          <a href={product.pokeca_url} target="_blank" rel="noopener noreferrer"
             style={{
               display: 'block', marginTop: 2,
               color: '#ec4899', fontSize: '0.68rem',
               textDecoration: 'none', textAlign: 'center',
             }}>
            pokeca-chart で見る →
          </a>
        )}
      </div>
    </div>
  )
}
