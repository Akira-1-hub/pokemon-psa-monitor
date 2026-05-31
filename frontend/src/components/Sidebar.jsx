import { useState, useMemo } from 'react'
import { deleteProduct, IS_STATIC } from '../api.js'

const BRAND_OPTIONS = [
  { id: 'all',      label: '全て',    color: '#6a7a94' },
  { id: 'pokeca',   label: 'ポケカ',  color: '#f59e0b' },
  { id: 'onepiece', label: 'ワンピカ', color: '#ef4444' },
]

const TYPE_OPTIONS = [
  { id: 'all',  label: '全て' },
  { id: 'BOX',  label: 'BOX' },
  { id: 'CARD', label: 'CARD' },
]

export default function Sidebar({
  products,
  selectedIds,
  onSelectedIdsChange,
  onOpenAddModal,
  onProductDeleted,
}) {
  const [search,    setSearch]    = useState('')
  const [brandSel,  setBrandSel]  = useState('all')
  const [typeSel,   setTypeSel]   = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(p => {
      if (brandSel !== 'all' && (p.brand || 'pokeca') !== brandSel) return false
      if (typeSel  !== 'all' && p.product_type !== typeSel) return false
      if (q && !(p.display_name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [products, brandSel, typeSel, search])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // ブランド・タイプ別件数（バッジ表示用）
  const counts = useMemo(() => {
    const c = { brand: {}, type: {} }
    products.forEach(p => {
      const b = p.brand || 'pokeca'
      c.brand[b] = (c.brand[b] || 0) + 1
      c.type[p.product_type] = (c.type[p.product_type] || 0) + 1
    })
    return c
  }, [products])

  function toggle(id) {
    const next = selectedSet.has(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id]
    onSelectedIdsChange(next)
  }

  function selectAll() {
    // フィルタ済みリストを全選択
    onSelectedIdsChange(filtered.map(p => p.apparel_id))
  }
  function clearAll() { onSelectedIdsChange([]) }

  async function handleDelete(p, e) {
    e.preventDefault(); e.stopPropagation()
    if (!window.confirm(`「${p.display_name}」を削除しますか？`)) return
    try {
      await deleteProduct(p.apparel_id)
      onProductDeleted?.()
    } catch (err) {
      alert(`削除失敗: ${err.message}`)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-title">⚙️ 商品選択</div>

      {!IS_STATIC && (
        <button className="add-product-btn" onClick={onOpenAddModal}>
          ＋ 商品を追加
        </button>
      )}

      <hr className="sidebar-divider" />

      {/* ─── ブランドフィルター ───────────── */}
      <div className="filter-group">
        <label className="sidebar-label">ブランド</label>
        <div className="filter-pills">
          {BRAND_OPTIONS.map(opt => {
            const n = opt.id === 'all'
              ? products.length
              : (counts.brand[opt.id] || 0)
            return (
              <button
                key={opt.id}
                className={`filter-pill ${brandSel === opt.id ? 'active' : ''}`}
                onClick={() => setBrandSel(opt.id)}
                style={brandSel === opt.id
                  ? { borderColor: opt.color, color: opt.color }
                  : undefined}
              >
                {opt.label} <span className="pill-count">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── タイプフィルター ───────────── */}
      <div className="filter-group">
        <label className="sidebar-label">タイプ</label>
        <div className="filter-pills">
          {TYPE_OPTIONS.map(opt => {
            const n = opt.id === 'all'
              ? products.length
              : (counts.type[opt.id] || 0)
            return (
              <button
                key={opt.id}
                className={`filter-pill ${typeSel === opt.id ? 'active' : ''}`}
                onClick={() => setTypeSel(opt.id)}
              >
                {opt.label} <span className="pill-count">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <hr className="sidebar-divider" />

      <div className="card-select-wrap">
        <input
          type="text"
          className="card-search"
          placeholder="商品名で検索…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="card-select-actions">
          <button className="card-select-btn" onClick={selectAll}>表示中を全選択</button>
          <button className="card-select-btn" onClick={clearAll}>クリア</button>
        </div>
        <div className="card-list">
          {filtered.map(p => {
            const checked = selectedSet.has(p.apparel_id)
            const brandColor = (p.brand || 'pokeca') === 'onepiece' ? '#ef4444' : '#f59e0b'
            return (
              <label key={p.apparel_id} className={`card-list-item ${checked ? 'checked' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(p.apparel_id)} />
                {p.img_url ? (
                  <img src={p.img_url} alt="" className="card-list-thumb"
                       loading="lazy"
                       onError={e => { e.currentTarget.style.display = 'none' }} />
                ) : (
                  <div className="card-list-thumb-empty">?</div>
                )}
                <span className="card-list-name">
                  <span style={{
                    fontSize: '0.58rem', color: brandColor,
                    marginRight: 3, fontWeight: 700,
                  }}>
                    {(p.brand || 'pokeca') === 'onepiece' ? 'ONE' : 'PKM'}
                  </span>
                  <span style={{
                    fontSize: '0.62rem', color: p.product_type === 'BOX' ? '#3b82f6' : '#a855f7',
                    marginRight: 4,
                  }}>[{p.product_type}]</span>
                  {p.display_name}
                </span>
                {!IS_STATIC && (
                  <button
                    className="card-list-delete"
                    title="削除"
                    onClick={e => handleDelete(p, e)}
                  >×</button>
                )}
              </label>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 10, fontSize: '0.74rem', color: '#3a4a60' }}>
              一致なし
            </div>
          )}
        </div>
        <div className="card-select-count">
          {selectedIds.length} / {products.length} 件選択中 (表示 {filtered.length} 件)
        </div>
      </div>

      <hr className="sidebar-divider" />

      <div className="sidebar-info">
        <strong>商品追加</strong><br />
        <code>products.csv</code> 編集後 <code>python fetch.py</code><br />
        または「＋商品を追加」ボタン
      </div>
    </aside>
  )
}
