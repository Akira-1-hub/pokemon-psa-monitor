/**
 * StatGrid — 横並び統計カード
 * stats = [{ label: string, value: string }, ...]
 */
export default function StatGrid({ stats }) {
  return (
    <div className="stat-grid">
      {stats.map(({ label, value }) => (
        <div className="stat-card" key={label}>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
        </div>
      ))}
    </div>
  )
}
