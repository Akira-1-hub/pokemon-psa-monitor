import { useState } from 'react'
import { addProduct } from '../api.js'

/**
 * カード/BOX 追加モーダル
 */
export default function AddProductModal({ open, onClose, onAdded }) {
  const [snkrdunkUrl, setSnkrdunkUrl] = useState('')
  const [pokecaUrl,   setPokecaUrl]   = useState('')
  const [nickname,    setNickname]    = useState('')
  const [brand,       setBrand]       = useState('pokeca')
  const [submitting,  setSubmitting]  = useState(false)
  const [message,     setMessage]     = useState(null)

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!snkrdunkUrl.trim()) {
      setMessage({ type: 'error', text: 'snkrdunk URL は必須です' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      const result = await addProduct({
        snkrdunkUrl: snkrdunkUrl.trim(),
        pokecaUrl:   pokecaUrl.trim(),
        nickname:    nickname.trim(),
        brand,
      })
      setMessage({
        type: 'success',
        text: `✅ 追加完了 (${result.type}, apparel_id=${result.apparel_id})。\nデータ取得中…  数十秒後に商品一覧に反映されます。`,
      })
      setSnkrdunkUrl('')
      setPokecaUrl('')
      setNickname('')
      // 30秒後に親をリロード
      setTimeout(() => onAdded?.(), 30000)
    } catch (err) {
      setMessage({ type: 'error', text: `❌ ${err.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>商品を追加</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-field">
            <label>ブランド</label>
            <div className="filter-pills">
              <button type="button"
                className={`filter-pill ${brand === 'pokeca' ? 'active' : ''}`}
                onClick={() => setBrand('pokeca')}
                style={brand === 'pokeca' ? { borderColor: '#f59e0b', color: '#f59e0b' } : undefined}
                disabled={submitting}>
                ポケカ
              </button>
              <button type="button"
                className={`filter-pill ${brand === 'onepiece' ? 'active' : ''}`}
                onClick={() => setBrand('onepiece')}
                style={brand === 'onepiece' ? { borderColor: '#ef4444', color: '#ef4444' } : undefined}
                disabled={submitting}>
                ワンピカ
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label>
              snkrdunk URL <span style={{ color: '#ef4444' }}>*必須</span>
            </label>
            <input
              type="url"
              className="sidebar-input"
              placeholder="https://snkrdunk.com/apparels/806644"
              value={snkrdunkUrl}
              onChange={e => setSnkrdunkUrl(e.target.value)}
              disabled={submitting}
            />
            <small>BOXか CARDかは自動判定されます</small>
          </div>

          <div className="modal-field">
            <label>pokeca-chart URL（任意・CARDの場合に推奨）</label>
            <input
              type="url"
              className="sidebar-input"
              placeholder="https://grading.pokeca-chart.com/sv8-125/"
              value={pokecaUrl}
              onChange={e => setPokecaUrl(e.target.value)}
              disabled={submitting}
            />
            <small>PSA10枚数・取得率・時価総額の計算に使用されます</small>
          </div>

          <div className="modal-field">
            <label>愛称（任意・表示名）</label>
            <input
              type="text"
              className="sidebar-input"
              placeholder="例: リザードンex SAR"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              disabled={submitting}
            />
          </div>

          {message && (
            <div className={`modal-message ${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel"
                    onClick={onClose} disabled={submitting}>
              閉じる
            </button>
            <button type="submit" className="modal-btn-primary"
                    disabled={submitting}>
              {submitting ? '追加中…' : '追加する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
