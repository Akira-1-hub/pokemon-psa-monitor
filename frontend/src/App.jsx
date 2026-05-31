import { useState, useEffect } from 'react'
import { fetchProducts, IS_STATIC } from './api.js'
import Sidebar from './components/Sidebar.jsx'
import Overview from './components/Overview.jsx'
import Charts from './components/Charts.jsx'
import Rankings from './components/Rankings.jsx'
import AddProductModal from './components/AddProductModal.jsx'
import RefreshButton from './components/RefreshButton.jsx'
import { useEffect as useEffectMeta, useState as useStateMeta } from 'react'
import { fetchMeta } from './api.js'

function StaticMetaBadge() {
  const [meta, setMeta] = useStateMeta(null)
  useEffectMeta(() => { fetchMeta().then(setMeta) }, [])
  if (!meta?.generated_at) return null
  const d = new Date(meta.generated_at)
  const txt = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
  return (
    <span style={{
      fontSize: '0.66rem',
      color: 'rgba(255,255,255,0.55)',
      marginRight: 10,
    }}>
      最終更新: {txt}
    </span>
  )
}

const TABS = [
  { id: 'overview',  label: '📊 商品一覧' },
  { id: 'charts',    label: '📈 価格チャート' },
  { id: 'rankings',  label: '🏆 ランキング' },
]

export default function App() {
  const [activeTab,    setActiveTab]    = useState('overview')
  const [products,     setProducts]     = useState([])
  const [selectedIds,  setSelectedIds]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [sidebarOpen,  setSidebarOpen]  = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)

  function reload() {
    fetchProducts()
      .then(d => setProducts(d.products ?? []))
      .catch(e => setError(`商品取得エラー: ${e.message}`))
  }

  useEffect(() => {
    setLoading(true)
    fetchProducts()
      .then(d => {
        setProducts(d.products ?? [])
        setSelectedIds((d.products ?? []).map(p => p.apparel_id))
      })
      .catch(e => setError(`商品取得エラー: ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="app">
      <div className="pc-titlebar">
        <span className="pc-titlebar-main">🃏 ポケカ相場モニター</span>
        <span className="pc-titlebar-sub">snkrdunk データ集計</span>
        {IS_STATIC && (
          <span style={{
            fontSize: '0.66rem', color: 'rgba(255,255,255,0.5)',
            marginLeft: 12,
          }}>
            🔒 閲覧専用モード
          </span>
        )}
        <div className="pc-titlebar-spacer" />
        {!IS_STATIC && <RefreshButton onCompleted={reload} />}
        {IS_STATIC && <StaticMetaBadge />}
        <button
          className="sidebar-toggle-btn"
          onClick={() => setSidebarOpen(o => !o)}
        >
          {sidebarOpen ? '◀ 閉じる' : '▶ 商品'}
        </button>
      </div>

      <div className="layout">
        {sidebarOpen && (
          <Sidebar
            products={products}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            onOpenAddModal={() => setAddModalOpen(true)}
            onProductDeleted={reload}
          />
        )}

        <main className="main-content">
          <div className="tab-bar">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="loading-wrap">
              <div className="spinner" />
              <span>データを読み込んでいます…</span>
            </div>
          )}

          {!loading && error && (
            <div className="tab-content">
              <div className="error-msg">
                ⚠️ {error}<br />
                <small style={{ marginTop: 6, display: 'block', opacity: 0.7 }}>
                  バックエンドが起動しているか確認してください：
                  <code>python backend\main.py</code>
                </small>
              </div>
            </div>
          )}

          {!loading && !error && (
            <>
              {activeTab === 'overview' && (
                <Overview products={products} />
              )}
              {activeTab === 'charts' && (
                <Charts products={products} selectedIds={selectedIds} />
              )}
              {activeTab === 'rankings' && (
                <Rankings />
              )}
            </>
          )}
        </main>
      </div>

      <AddProductModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdded={reload}
      />
    </div>
  )
}
