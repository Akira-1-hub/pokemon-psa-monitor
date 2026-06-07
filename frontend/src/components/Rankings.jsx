import { useState, useEffect, useMemo } from 'react'
import SectionHeader from './SectionHeader.jsx'
import { fetchRankings, fmt } from '../api.js'

const BRAND_OPTIONS = [
  { id: 'all',      label: '全て' },
  { id: 'pokeca',   label: 'ポケカ' },
  { id: 'onepiece', label: 'ワンピカ' },
]
const TYPE_OPTIONS = [
  { id: 'all',  label: '全て' },
  { id: 'BOX',  label: 'BOX' },
  { id: 'CARD', label: 'CARD' },
]
const SERIES_OPTIONS = [
  { id: 'all',   label: 'すべて' },
  { id: 'PSA10', label: 'PSA10' },
  { id: 'A',     label: 'A' },
  { id: '1個',   label: '1個(BOX)' },
]

/** カード画像サムネ（ホバーで拡大プレビュー） */
function Thumb({ src, alt }) {
  if (!src) {
    return <div className="rank-thumb-empty">?</div>
  }
  return (
    <div className="rank-thumb-wrap">
      <img src={src} alt={alt} className="rank-thumb" loading="lazy"
           onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
      <div className="rank-thumb-zoom">
        <img src={src} alt={alt} />
      </div>
    </div>
  )
}

/** デュアルレンジ価格スライダー + 数値入力 */
const PRICE_STEP = 10000   // スピナー/スライダーは1万円刻み

function PriceRangeFilter({ max, lo, hi, onChange }) {
  const pct = (v) => (max > 0 ? (v / max) * 100 : 0)

  // 数字以外を除去して整数化（先頭ゼロも消える）
  const clean = (s) => {
    const n = parseInt(String(s).replace(/[^\d]/g, ''), 10)
    return Number.isNaN(n) ? 0 : n
  }
  const setLo = (v) => {
    const nv = Math.min(clean(v), hi)
    onChange([Math.max(0, nv), hi])
  }
  const setHi = (v) => {
    const nv = Math.max(clean(v), lo)
    onChange([lo, Math.min(max, nv)])
  }

  return (
    <div className="filter-group price-filter">
      <label className="sidebar-label">価格帯（円・1万円刻み）</label>
      <div className="price-inputs">
        <input type="number" className="price-num" value={Number(lo)} min={0} max={max}
               step={PRICE_STEP} onChange={e => setLo(e.target.value)} />
        <span className="price-tilde">〜</span>
        <input type="number" className="price-num" value={Number(hi)} min={0} max={max}
               step={PRICE_STEP} onChange={e => setHi(e.target.value)} />
      </div>
      <div className="dual-range">
        <div className="dr-track" />
        <div className="dr-fill"
             style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input type="range" className="dr-input dr-lo" min={0} max={max} step={PRICE_STEP}
               value={lo} onChange={e => setLo(e.target.value)} />
        <input type="range" className="dr-input dr-hi" min={0} max={max} step={PRICE_STEP}
               value={hi} onChange={e => setHi(e.target.value)} />
      </div>
      <div className="price-range-labels">
        <span>{fmt.price(lo)}</span>
        <span>{fmt.price(hi)}{hi >= max ? '+' : ''}</span>
      </div>
    </div>
  )
}

function brandLabel(brand) {
  return brand === 'onepiece'
    ? <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.62rem' }}>ONE</span>
    : <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.62rem' }}>PKM</span>
}

/** 価格系ランキングテーブル */
function PriceTable({ rows, showChange = true }) {
  if (!rows?.length) {
    return <div className="pc-empty">該当データがありません</div>
  }
  return (
    <div className="pc-table-wrap">
      <table className="pc-table">
        <thead>
          <tr>
            <th>順位</th><th>画像</th><th>商品</th><th>ブランド</th><th>タイプ</th><th>シリーズ</th>
            <th>直近価格</th>
            {showChange && (<><th>変動(前回比)</th><th>騰落率</th><th>比較間隔</th></>)}
            <th>取得日</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const c = r.change == null ? '' : r.change > 0 ? 'td-up' : r.change < 0 ? 'td-dn' : ''
            return (
              <tr key={`${r.apparel_id}-${r.series}-${i}`}>
                <td>{i + 1}</td>
                <td><Thumb src={r.img_url} alt={r.name} /></td>
                <td>{r.name}</td>
                <td>{brandLabel(r.brand)}</td>
                <td><span style={{
                  background: r.product_type === 'BOX' ? '#2563eb' : '#7c3aed',
                  color: '#fff', padding: '2px 6px',
                  borderRadius: 4, fontSize: '0.68rem',
                }}>{r.product_type}</span></td>
                <td>{r.series}</td>
                <td className="td-num">{fmt.price(r.latest_price)}</td>
                {showChange && (<>
                  <td className={`td-num ${c}`}>{fmt.change(r.change)}</td>
                  <td className={`td-num ${c}`}>{fmt.pct(r.change_pct)}</td>
                  <td className="td-num" style={{ color: '#6a7a94' }}>
                    {r.change_days != null ? `${r.change_days}日` : '---'}
                  </td>
                </>)}
                <td>{r.latest_date}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** pokeca統計系ランキングテーブル */
function CardStatsTable({ rows, valueKey, valueFmt = 'num', extraCols = [] }) {
  if (!rows?.length) {
    return <div className="pc-empty">該当データがありません（CARDのみ・要pokeca_url）</div>
  }
  const fmtFn = {
    price: fmt.price, num: fmt.num, pop: fmt.pop,
    rate: fmt.ratePct, dec3: fmt.decimal3, signed: fmt.signed,
  }[valueFmt] || fmt.num

  return (
    <div className="pc-table-wrap">
      <table className="pc-table">
        <thead>
          <tr>
            <th>順位</th><th>画像</th><th>カード</th><th>ブランド</th>
            <th>{valueKey}</th>
            {extraCols.map(c => <th key={c.label}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.apparel_id}-${i}`}>
              <td>{i + 1}</td>
              <td><Thumb src={r.img_url} alt={r.name} /></td>
              <td>{r.name}</td>
              <td>{brandLabel(r.brand)}</td>
              <td className="td-num" style={{ fontWeight: 700, color: '#f59e0b' }}>
                {fmtFn(r[valueKey])}
              </td>
              {extraCols.map(c => (
                <td key={c.label} className="td-num">{c.format(r[c.field])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Rankings() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [brandSel,  setBrandSel]  = useState('all')
  const [typeSel,   setTypeSel]   = useState('all')
  const [seriesSel, setSeriesSel] = useState('all')
  const [priceMax,  setPriceMax]  = useState(0)        // スライダー上限
  const [priceLo,   setPriceLo]   = useState(0)
  const [priceHi,   setPriceHi]   = useState(0)

  useEffect(() => {
    fetchRankings()
      .then(d => {
        setData(d.rankings)
        // 全価格系rowsから最大価格を算出してスライダー上限に
        const all = [...(d.rankings.rising || []),
                     ...(d.rankings.falling || []),
                     ...(d.rankings.by_price || [])]
        const maxP = all.reduce((m, r) =>
          Math.max(m, r.latest_price || 0), 0)
        // 1万円単位で切り上げ
        const rounded = Math.ceil(maxP / 10000) * 10000 || 100000
        setPriceMax(rounded)
        setPriceLo(0)
        setPriceHi(rounded)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // フィルター関数
  const priceActive = priceMax > 0 && (priceLo > 0 || priceHi < priceMax)
  const applyFilter = useMemo(() => (rows) => {
    if (!rows) return []
    return rows.filter(r => {
      if (brandSel !== 'all' && (r.brand || 'pokeca') !== brandSel) return false
      if (typeSel  !== 'all' && r.product_type && r.product_type !== typeSel) return false
      if (seriesSel !== 'all' && r.series && r.series !== seriesSel) return false
      if (priceActive) {
        const p = r.latest_price
        if (p == null || p < priceLo || p > priceHi) return false
      }
      return true
    })
  }, [brandSel, typeSel, seriesSel, priceActive, priceLo, priceHi])

  if (loading) return (
    <div className="tab-content">
      <div className="loading-wrap"><div className="spinner" /><span>集計中…</span></div>
    </div>
  )
  if (error) return (
    <div className="tab-content"><div className="error-msg">⚠️ {error}</div></div>
  )

  const d = data || {}
  const f = applyFilter
  // pokeca系はCARD固定なのでブランドフィルターのみ意味を持つ
  const cardFilter = (rows) => (rows || []).filter(
    r => brandSel === 'all' || (r.brand || 'pokeca') === brandSel)

  return (
    <div className="tab-content">
      {/* フィルターバー */}
      <div className="ranking-filter-bar">
        <div className="filter-group">
          <label className="sidebar-label">ブランド</label>
          <div className="filter-pills">
            {BRAND_OPTIONS.map(o => (
              <button key={o.id}
                className={`filter-pill ${brandSel === o.id ? 'active' : ''}`}
                onClick={() => setBrandSel(o.id)}>{o.label}</button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <label className="sidebar-label">タイプ（価格系のみ）</label>
          <div className="filter-pills">
            {TYPE_OPTIONS.map(o => (
              <button key={o.id}
                className={`filter-pill ${typeSel === o.id ? 'active' : ''}`}
                onClick={() => setTypeSel(o.id)}>{o.label}</button>
            ))}
          </div>
        </div>
        {typeSel !== 'BOX' && (
          <div className="filter-group">
            <label className="sidebar-label">状態/シリーズ（価格系のみ）</label>
            <div className="filter-pills">
              {SERIES_OPTIONS.map(o => (
                <button key={o.id}
                  className={`filter-pill ${seriesSel === o.id ? 'active' : ''}`}
                  onClick={() => setSeriesSel(o.id)}>{o.label}</button>
              ))}
            </div>
          </div>
        )}
        {priceMax > 0 && (
          <PriceRangeFilter
            max={priceMax} lo={priceLo} hi={priceHi}
            onChange={([l, h]) => { setPriceLo(l); setPriceHi(h) }}
          />
        )}
      </div>

      <SectionHeader>📈 高騰ランキング（snkrdunk・前回取引比）</SectionHeader>
      <PriceTable rows={f(d.rising)} />

      <SectionHeader>📉 下落ランキング（snkrdunk・前回取引比）</SectionHeader>
      <PriceTable rows={f(d.falling)} />

      <SectionHeader>💰 価格ランキング（直近価格）</SectionHeader>
      <PriceTable rows={f(d.by_price)} />

      <SectionHeader>🪙 PSA10時価総額ランキング</SectionHeader>
      <CardStatsTable
        rows={cardFilter(d.market_cap)}
        valueKey="market_cap" valueFmt="price"
        extraCols={[
          { label: 'PSA10枚数', field: 'psa10_pop',  format: fmt.pop },
          { label: 'PSA10価格', field: 'psa10_price', format: fmt.price },
          { label: '取得率',    field: 'psa10_rate',  format: fmt.ratePct },
        ]}
      />

      <SectionHeader>🔢 PSA10枚数ランキング</SectionHeader>
      <CardStatsTable
        rows={cardFilter(d.psa10_pop)}
        valueKey="psa10_pop" valueFmt="pop"
        extraCols={[
          { label: 'PSA合計', field: 'psa_total',  format: fmt.pop },
          { label: '取得率',  field: 'psa10_rate', format: fmt.ratePct },
        ]}
      />

      <SectionHeader>📊 PSA合計枚数ランキング</SectionHeader>
      <CardStatsTable
        rows={cardFilter(d.psa_total)}
        valueKey="psa_total" valueFmt="pop"
        extraCols={[
          { label: 'PSA10枚数', field: 'psa10_pop',  format: fmt.pop },
          { label: '取得率',    field: 'psa10_rate', format: fmt.ratePct },
        ]}
      />

      <SectionHeader>⭐ PSA10取得率ランキング</SectionHeader>
      <CardStatsTable
        rows={cardFilter(d.psa10_rate)}
        valueKey="psa10_rate" valueFmt="rate"
        extraCols={[
          { label: 'PSA10枚数', field: 'psa10_pop', format: fmt.pop },
          { label: 'PSA合計',   field: 'psa_total', format: fmt.pop },
        ]}
      />

      <SectionHeader>🔺 週間PSA10増加枚数ランキング</SectionHeader>
      <CardStatsTable
        rows={cardFilter(d.pop_inc_7d)}
        valueKey="pop_inc_7d" valueFmt="signed"
        extraCols={[
          { label: 'PSA10枚数', field: 'psa10_pop',  format: fmt.pop },
          { label: '供給圧',     field: 'supply_pressure', format: fmt.decimal3 },
        ]}
      />

      <SectionHeader>📡 供給圧ランキング</SectionHeader>
      <CardStatsTable
        rows={cardFilter(d.supply_pressure)}
        valueKey="supply_pressure" valueFmt="dec3"
        extraCols={[
          { label: '増加枚数',   field: 'pop_inc_7d', format: fmt.signed },
          { label: 'PSA10価格', field: 'psa10_price', format: fmt.price },
        ]}
      />
    </div>
  )
}
