/**
 * API クライアント — API モード / 静的 JSON モード両対応
 *
 * VITE_DATA_MODE=static  → /data/*.json から読み込む（公開デプロイ用）
 * 未設定または api        → /api/* を叩く（ローカル開発用）
 */

// モード判定:
//   1. 環境変数 VITE_DATA_MODE が最優先
//   2. 未設定なら、localhost は 'api'（ローカル開発）、それ以外は 'static'（公開）
const _envMode = import.meta.env.VITE_DATA_MODE
const _isLocalhost =
  typeof location !== 'undefined' &&
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
const MODE = _envMode || (_isLocalhost ? 'api' : 'static')
export const IS_STATIC = MODE === 'static'

const API_BASE    = '/api'
// 静的JSONは Vite の base（GitHub Pagesのサブパス）配下に配置される
const STATIC_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') + '/data'

// ─── キャッシュ（静的モードで全データを一度読み込む） ────────
let _staticCache = {}
async function _loadStatic(file) {
  if (_staticCache[file]) return _staticCache[file]
  const r = await fetch(`${STATIC_BASE}/${file}`)
  if (!r.ok) throw new Error(`GET /data/${file}: ${r.status}`)
  _staticCache[file] = await r.json()
  return _staticCache[file]
}

// ─── 商品一覧 ─────────────────────────────────────────────────
export async function fetchProducts() {
  if (IS_STATIC) return _loadStatic('products.json')
  const r = await fetch(`${API_BASE}/products`)
  if (!r.ok) throw new Error(`GET /api/products: ${r.status}`)
  return r.json()
}

// ─── snkrdunk 価格時系列 ──────────────────────────────────────
export async function fetchHistory({ apparelIds = [], series = '' } = {}) {
  if (IS_STATIC) {
    const all = await _loadStatic('history.json')
    let hist = all.history ?? []
    if (apparelIds.length) {
      const set = new Set(apparelIds)
      hist = hist.filter(r => set.has(r.apparel_id))
    }
    if (series) hist = hist.filter(r => r.series === series)
    return { history: hist }
  }
  const p = new URLSearchParams()
  if (apparelIds.length) p.set('apparel_ids', apparelIds.join(','))
  if (series) p.set('series', series)
  const r = await fetch(`${API_BASE}/history?${p}`)
  if (!r.ok) throw new Error(`GET /api/history: ${r.status}`)
  return r.json()
}

// ─── pokeca PSA統計時系列 ─────────────────────────────────────
export async function fetchPokecaHistory({ apparelIds = [] } = {}) {
  if (IS_STATIC) {
    const all = await _loadStatic('pokeca-history.json')
    let hist = all.history ?? []
    if (apparelIds.length) {
      const set = new Set(apparelIds)
      hist = hist.filter(r => set.has(r.apparel_id))
    }
    return { history: hist }
  }
  const p = new URLSearchParams()
  if (apparelIds.length) p.set('apparel_ids', apparelIds.join(','))
  const r = await fetch(`${API_BASE}/pokeca-history?${p}`)
  if (!r.ok) throw new Error(`GET /api/pokeca-history: ${r.status}`)
  return r.json()
}

// ─── ランキング ─────────────────────────────────────────────
export async function fetchRankings() {
  if (IS_STATIC) return _loadStatic('rankings.json')
  const r = await fetch(`${API_BASE}/rankings`)
  if (!r.ok) throw new Error(`GET /api/rankings: ${r.status}`)
  return r.json()
}

// ─── 静的メタ情報（最終更新時刻など） ────────────────────────
export async function fetchMeta() {
  try { return await _loadStatic('meta.json') } catch { return null }
}

// ─── 書き込み系（静的モードでは無効） ───────────────────────
export async function addProduct({ snkrdunkUrl, pokecaUrl = '', nickname = '', brand = 'pokeca' }) {
  if (IS_STATIC) throw new Error('公開サイトでは商品追加は無効です（管理者のみ）')
  const r = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snkrdunk_url: snkrdunkUrl, pokeca_url: pokecaUrl, nickname, brand,
    }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail || `POST: ${r.status}`)
  }
  return r.json()
}

export async function startRefresh() {
  if (IS_STATIC) throw new Error('公開サイトでは更新ボタンは無効です')
  const r = await fetch(`${API_BASE}/refresh`, { method: 'POST' })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail || `POST: ${r.status}`)
  }
  return r.json()
}

export async function fetchRefreshStatus() {
  if (IS_STATIC) {
    // 静的モードでは meta.json の generated_at を「最終更新時刻」として返す
    const meta = await fetchMeta()
    return {
      running: false,
      last_updated_at: meta?.generated_at ?? null,
    }
  }
  const r = await fetch(`${API_BASE}/refresh-status`)
  if (!r.ok) throw new Error(`GET: ${r.status}`)
  return r.json()
}

export async function deleteProduct(apparelId) {
  if (IS_STATIC) throw new Error('公開サイトでは削除は無効です（管理者のみ）')
  const r = await fetch(`${API_BASE}/products/${apparelId}`, { method: 'DELETE' })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail || `DELETE: ${r.status}`)
  }
  return r.json()
}

// ─── フォーマッタ ───────────────────────────────────────────
export const fmt = {
  price: v => v != null ? `¥${Math.round(v).toLocaleString('ja-JP')}` : '---',
  change: v => {
    if (v == null) return '---'
    const a = Math.round(Math.abs(v)).toLocaleString('ja-JP')
    return v > 0 ? `+¥${a}` : v < 0 ? `-¥${a}` : `¥${a}`
  },
  pct: v => v == null ? '---' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`,
  ratePct: v => v == null ? '---' : `${(v * 100).toFixed(1)}%`,
  num: v => v == null ? '---' : Math.round(v).toLocaleString('ja-JP'),
  pop: v => v == null ? '---' : `${Math.round(v).toLocaleString('ja-JP')}枚`,
  signed: v => {
    if (v == null) return '---'
    const a = Math.round(Math.abs(v)).toLocaleString('ja-JP')
    return v > 0 ? `+${a}` : v < 0 ? `-${a}` : `${a}`
  },
  decimal3: v => v == null ? '---' : v.toFixed(3),
}
