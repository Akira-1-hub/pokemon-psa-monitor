import { useState, useEffect } from 'react'
import { startRefresh, fetchRefreshStatus } from '../api.js'

function fmtElapsed(secAgo) {
  if (secAgo < 60)      return `${Math.round(secAgo)}秒前`
  if (secAgo < 3600)    return `${Math.round(secAgo / 60)}分前`
  if (secAgo < 86400)   return `${Math.round(secAgo / 3600)}時間前`
  return `${Math.round(secAgo / 86400)}日前`
}

export default function RefreshButton({ onCompleted }) {
  const [running,     setRunning]     = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  // ステータスをポーリング
  useEffect(() => {
    let cancelled = false
    let timerId

    async function tick() {
      try {
        const s = await fetchRefreshStatus()
        if (cancelled) return
        const wasRunning = running
        setRunning(s.running)
        if (s.last_updated_at) {
          setLastUpdated(new Date(s.last_updated_at).getTime() / 1000)
        }
        // 走ってたのが止まったら → 商品リストを再取得
        if (wasRunning && !s.running) {
          onCompleted?.()
        }
      } catch {}
      const nextDelay = running ? 5000 : 30000
      timerId = setTimeout(tick, nextDelay)
    }
    tick()
    return () => { cancelled = true; clearTimeout(timerId) }
  }, [running, onCompleted])

  async function handleClick() {
    if (running) return
    try {
      await startRefresh()
      setRunning(true)
    } catch (err) {
      alert(`更新開始失敗: ${err.message}`)
    }
  }

  const elapsedText = lastUpdated
    ? fmtElapsed(Date.now() / 1000 - lastUpdated)
    : '未取得'

  return (
    <button
      className={`refresh-btn ${running ? 'running' : ''}`}
      onClick={handleClick}
      disabled={running}
      title={running ? 'データ取得中…' : '全商品を再取得'}
    >
      <span className="refresh-icon">{running ? '⟳' : '🔄'}</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
        <span style={{ fontWeight: 700 }}>
          {running ? '更新中…' : '今すぐ更新'}
        </span>
        <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>
          最終: {elapsedText}
        </span>
      </span>
    </button>
  )
}
