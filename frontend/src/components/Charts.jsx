import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import SectionHeader from './SectionHeader.jsx'
import { fetchHistory, fetchPokecaHistory, fmt } from '../api.js'

const LINE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

// チャート種別: snkr(価格系) / pokeca(PSA統計系)
const CHART_OPTIONS = [
  { key: 'snkr:1個',    label: 'BOX価格(1個)推移',     source: 'snkr',  series: '1個',   yFmt: 'price' },
  { key: 'snkr:PSA10',  label: 'PSA10価格推移',        source: 'snkr',  series: 'PSA10', yFmt: 'price' },
  { key: 'snkr:A',      label: '美品(状態A)価格推移',   source: 'snkr',  series: 'A',     yFmt: 'price' },
  { key: 'pop',         label: 'PSA10枚数推移',        source: 'pokeca', field: 'psa10_pop',         yFmt: 'pop'   },
  { key: 'total',       label: 'PSA合計枚数推移',      source: 'pokeca', field: 'psa_total',         yFmt: 'pop'   },
  { key: 'rate',        label: 'PSA10取得率推移',      source: 'pokeca', field: 'psa10_rate',        yFmt: 'rate'  },
  { key: 'mcap',        label: 'PSA10時価総額推移',    source: 'pokeca', field: 'market_cap',        yFmt: 'price' },
  { key: 'sp',          label: '供給圧推移',           source: 'pokeca', field: 'supply_pressure',   yFmt: 'dec3'  },
  { key: 'tx',          label: '取引件数推移',         source: 'pokeca', field: 'transaction_count', yFmt: 'pop'   },
]

function pivot(data, valueField) {
  const byDate = {}
  data.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = { date: r.date }
    if (r[valueField] != null) byDate[r.date][r.display_name] = r[valueField]
  })
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
}

function resampleWeekly(data) {
  if (!data.length) return []
  const allKeys = new Set()
  data.forEach(r => Object.keys(r).forEach(k => k !== 'date' && allKeys.add(k)))
  const groups = {}
  data.forEach(r => {
    const d = new Date(r.date)
    const sun = new Date(d)
    sun.setDate(d.getDate() - d.getDay())
    const wk = sun.toISOString().slice(0, 10)
    if (!groups[wk]) {
      groups[wk] = { date: wk }
      allKeys.forEach(k => { groups[wk][`__${k}_s`] = 0; groups[wk][`__${k}_n`] = 0 })
    }
    allKeys.forEach(k => {
      if (r[k] != null) {
        groups[wk][`__${k}_s`] += r[k]
        groups[wk][`__${k}_n`] += 1
      }
    })
  })
  return Object.values(groups).map(g => {
    const out = { date: g.date }
    allKeys.forEach(k => {
      const n = g[`__${k}_n`]
      out[k] = n > 0 ? g[`__${k}_s`] / n : null
    })
    return out
  }).sort((a, b) => a.date.localeCompare(b.date))
}

function fmtY(v, yFmt) {
  if (v == null) return ''
  switch (yFmt) {
    case 'price': return v >= 1_000_000
      ? `¥${(v / 1_000_000).toFixed(1)}M`
      : `¥${(v / 1_000).toFixed(0)}K`
    case 'rate':  return `${(v * 100).toFixed(0)}%`
    case 'dec3':  return v.toFixed(3)
    case 'pop':   return v >= 10000
      ? `${(v / 1000).toFixed(0)}K`
      : Math.round(v).toLocaleString()
    default:      return Math.round(v).toLocaleString()
  }
}

function fmtTip(v, yFmt) {
  if (v == null) return '---'
  switch (yFmt) {
    case 'price': return fmt.price(v)
    case 'rate':  return fmt.ratePct(v)
    case 'dec3':  return fmt.decimal3(v)
    case 'pop':   return fmt.pop(v)
    default:      return fmt.num(v)
  }
}

function CustomTooltip({ active, payload, label, yFmt }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="tt-date">{label}</div>
      {payload.filter(p => p.value != null).sort((a, b) => b.value - a.value).map(p => (
        <div key={p.dataKey} className="tt-item">
          <span className="tt-name" style={{ color: p.color }}>{p.dataKey}</span>
          <span className="tt-val">{fmtTip(p.value, yFmt)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Charts({ products, selectedIds }) {
  const [chartIdx,  setChartIdx]  = useState(1)   // 初期: PSA10価格
  const [weekly,    setWeekly]    = useState(true)
  const [snkrData,    setSnkrData]    = useState(null)
  const [pokecaData,  setPokecaData]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  const opt = CHART_OPTIONS[chartIdx]

  useEffect(() => {
    if (selectedIds.length === 0) {
      setSnkrData(null); setPokecaData(null); return
    }
    setLoading(true)
    setError(null)
    Promise.all([
      fetchHistory({ apparelIds: selectedIds }),
      fetchPokecaHistory({ apparelIds: selectedIds }),
    ])
      .then(([s, p]) => { setSnkrData(s.history ?? []); setPokecaData(p.history ?? []) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedIds])

  const chartData = useMemo(() => {
    if (opt.source === 'snkr' && snkrData) {
      const filtered = snkrData.filter(r => r.series === opt.series)
      const pivoted  = pivot(filtered, 'price')
      return weekly ? resampleWeekly(pivoted) : pivoted
    }
    if (opt.source === 'pokeca' && pokecaData) {
      const pivoted = pivot(pokecaData, opt.field)
      return weekly ? resampleWeekly(pivoted) : pivoted
    }
    return []
  }, [opt, snkrData, pokecaData, weekly])

  const lineKeys = useMemo(() => {
    const set = new Set()
    chartData.forEach(r => Object.keys(r).forEach(k => k !== 'date' && set.add(k)))
    return Array.from(set)
  }, [chartData])

  return (
    <div className="tab-content">
      <SectionHeader>📈 {opt.label}</SectionHeader>

      <div className="chart-controls">
        <select className="chart-select" value={chartIdx}
                onChange={e => setChartIdx(Number(e.target.value))}>
          {CHART_OPTIONS.map((o, i) => (
            <option key={o.key} value={i}>{o.label}</option>
          ))}
        </select>

        <div className="chart-radio-group">
          <button className={`chart-radio-btn ${!weekly ? 'active' : ''}`}
                  onClick={() => setWeekly(false)}>日次</button>
          <button className={`chart-radio-btn ${weekly ? 'active' : ''}`}
                  onClick={() => setWeekly(true)}>週次</button>
        </div>

        <div style={{ fontSize: '0.78rem', color: '#6a7a94' }}>
          選択中: {selectedIds.length} 商品
        </div>
      </div>

      {loading && (
        <div className="loading-wrap">
          <div className="spinner" /><span>データ読み込み中…</span>
        </div>
      )}
      {error && <div className="error-msg">⚠️ {error}</div>}
      {!loading && !error && selectedIds.length === 0 && (
        <div className="pc-empty">左サイドバーから商品を選択してください。</div>
      )}
      {!loading && !error && selectedIds.length > 0 && chartData.length === 0 && (
        <div className="pc-empty">
          このシリーズ/指標のデータがありません。<br />
          {opt.source === 'pokeca' && '※ pokeca系指標はCARD（pokeca_url付き）でのみ取得されます'}
        </div>
      )}
      {!loading && !error && chartData.length > 0 && (
        <div className="chart-wrap" style={{ height: 480 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
              <XAxis dataKey="date" tick={{ fill: '#4a5a78', fontSize: 11 }}
                     tickLine={false} axisLine={{ stroke: '#1a2540' }} minTickGap={40} />
              <YAxis tickFormatter={v => fmtY(v, opt.yFmt)}
                     tick={{ fill: '#4a5a78', fontSize: 11 }}
                     tickLine={false} axisLine={{ stroke: '#1a2540' }} width={70} />
              <Tooltip content={<CustomTooltip yFmt={opt.yFmt} />}
                       cursor={{ stroke: '#2a3a5c', strokeWidth: 1 }} />
              {lineKeys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2} dot={{ r: 2 }}
                      activeDot={{ r: 4 }} connectNulls={true} />
              ))}
            </LineChart>
          </ResponsiveContainer>

          <div className="chart-legend">
            {lineKeys.map((k, i) => (
              <span key={k} className="legend-item">
                <span className="legend-color"
                      style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
