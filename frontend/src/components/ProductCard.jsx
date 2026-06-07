import { fmt } from '../api.js'
import Medal from './Medal.jsx'

// シリーズ名 → バッジ用クラス
function serClass(name) {
  if (name === 'PSA10') return 'ser-psa10'
  if (name === 'A')     return 'ser-a'
  return 'ser-box'
}

// 表示するシリーズを順序付きで取得（CARD: PSA10→A / BOX: 1個）
function orderedSeries(p) {
  const order = p.product_type === 'BOX' ? ['1個'] : ['PSA10', 'A']
  return order
    .filter(k => p.series?.[k]?.latest_price != null)
    .map(k => ({ name: k, ...p.series[k] }))
}

export default function ProductCard({ product, rank, onOpen }) {
  const rows = orderedSeries(product)
  const rankCls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2'
                : rank === 3 ? 'rank-3' : 'rank-n'
  const cardRankCls = rank <= 3 ? `is-rank${rank}` : ''

  return (
    <div className={`prod-card ${cardRankCls}`}
       role="button" tabIndex={0}
       onClick={() => onOpen?.(product.apparel_id)}
       onKeyDown={e => { if (e.key === 'Enter') onOpen?.(product.apparel_id) }}
       title={product.display_name}>
      {rank <= 3 ? (
        <div className="prod-medal"><Medal rank={rank} /></div>
      ) : (
        <div className="prod-rank rank-n">{rank}</div>
      )}

      <div className="prod-img-wrap">
        {product.img_url ? (
          <img src={product.img_url} className="prod-img" alt="" loading="lazy"
               onError={e => {
                 e.currentTarget.parentElement.innerHTML =
                   '<div class="prod-noimg">NO IMAGE</div>'
               }} />
        ) : (
          <div className="prod-noimg">NO IMAGE</div>
        )}
      </div>

      <div className="prod-body">
        <div className="prod-name">{product.display_name}</div>

        {rows.length === 0 && (
          <div className="prod-series">
            <div className="prod-price">---</div>
          </div>
        )}

        {rows.map(s => {
          const chg = s.change_pct
          const cls = chg == null ? 'chg-nt' : chg > 0 ? 'chg-up' : chg < 0 ? 'chg-dn' : 'chg-nt'
          const ar  = chg == null ? '' : chg > 0 ? '▲' : chg < 0 ? '▼' : '－'
          return (
            <div className="prod-series" key={s.name}>
              <div className="prod-ser-head">
                <span className={`prod-ser ${serClass(s.name)}`}>{s.name}</span>
                {chg != null && (
                  <span className={`prod-chg ${cls}`}>
                    {ar}{fmt.pct(chg)}
                    {s.change_days != null && (
                      <span className="prod-chg-days">{s.change_days}日前比</span>
                    )}
                  </span>
                )}
              </div>
              <div className="prod-price">{fmt.price(s.latest_price)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
