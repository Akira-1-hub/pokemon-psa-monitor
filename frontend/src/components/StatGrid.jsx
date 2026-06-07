/**
 * StatGrid — 横並び統計カード（アイコン付き）
 * stats = [{ label, value, icon?, accent? }, ...]
 */
export default function StatGrid({ stats }) {
  return (
    <div className="stat-grid">
      {stats.map(({ label, value, icon, accent }) => (
        <div className="stat-card" key={label}>
          {icon && (
            <div className="stat-icon" data-accent={accent || 'blue'}>{icon}</div>
          )}
          <div className="stat-body">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
