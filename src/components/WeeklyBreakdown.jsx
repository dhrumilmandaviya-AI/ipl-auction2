import { useMemo } from 'react'
import { motion } from 'framer-motion'

export default function WeeklyBreakdown({ teams, matches, performances }) {
  // Group performances by match × team
  const matrix = useMemo(() => {
    return teams.map(team => {
      const matchPoints = matches.map(match => {
        const pts = performances
          .filter(p => p.match_id === match.id && p.team_id === team.id)
          .reduce((s, p) => s + (p.total_points || 0), 0)
        return { matchId: match.id, matchName: match.name, pts }
      })
      const total = matchPoints.reduce((s, m) => s + m.pts, 0)
      const best  = Math.max(...matchPoints.map(m => m.pts), 0)
      const worst = Math.min(...matchPoints.map(m => m.pts), 0)
      const trend = matchPoints.length >= 2
        ? matchPoints[matchPoints.length - 1].pts - matchPoints[matchPoints.length - 2].pts
        : 0

      return { team, matchPoints, total, best, worst, trend }
    }).sort((a, b) => b.total - a.total)
  }, [teams, matches, performances])

  const maxPts = Math.max(...matrix.flatMap(t => t.matchPoints.map(m => m.pts)), 1)

  if (matches.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">📅</div>
        <p className="text-white/30 font-mono text-sm">Weekly breakdown appears after matches are processed</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Table header */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border bg-bg-elevated">
                <th className="text-left px-4 py-3 font-mono text-xs text-white/40 uppercase tracking-wider w-36">Team</th>
                {matches.map(m => (
                  <th key={m.id} className="text-center px-3 py-3 font-mono text-xs text-white/40 uppercase tracking-wider min-w-20">
                    <div className="truncate max-w-20">{m.name?.split(' vs ')[0]}</div>
                    <div className="text-white/20">vs</div>
                    <div className="truncate max-w-20">{m.name?.split(' vs ')[1]}</div>
                  </th>
                ))}
                <th className="text-right px-4 py-3 font-mono text-xs text-white/40 uppercase tracking-wider">Total</th>
                <th className="text-right px-4 py-3 font-mono text-xs text-white/40 uppercase tracking-wider">Trend</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map(({ team, matchPoints, total, best, worst, trend }, rank) => (
                <motion.tr
                  key={team.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: rank * 0.04 }}
                  className="border-b border-bg-border/40 last:border-0 hover:bg-bg-elevated/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-sm">{team.name}</div>
                    <div className="text-xs text-white/30 font-mono">
                      Best: <span className="text-sold">{best}</span> · Worst: <span className="text-danger">{worst}</span>
                    </div>
                  </td>
                  {matchPoints.map(({ matchId, pts }) => {
                    const pct = Math.max(0, (pts / maxPts) * 100)
                    const color = pts > 60 ? '#f59e0b' : pts > 30 ? '#10b981' : pts < 0 ? '#ef4444' : '#94a3b8'
                    return (
                      <td key={matchId} className="text-center px-3 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-display text-xl" style={{ color }}>{pts > 0 ? `+${pts}` : pts || '—'}</span>
                          {/* Mini bar */}
                          <div className="w-12 h-1 bg-bg-deep rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: color }}
                            />
                          </div>
                        </div>
                      </td>
                    )
                  })}
                  <td className="text-right px-4 py-3">
                    <span className="font-display text-2xl text-gold">{total}</span>
                  </td>
                  <td className="text-right px-4 py-3">
                    <span className={`font-mono text-sm font-bold ${trend > 0 ? 'text-sold' : trend < 0 ? 'text-danger' : 'text-white/30'}`}>
                      {trend > 0 ? `▲ +${trend}` : trend < 0 ? `▼ ${trend}` : '→'}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sparkline mini-charts per team */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {matrix.map(({ team, matchPoints, total }) => (
          <div key={team.id} className="card p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-bold text-sm truncate">{team.name}</div>
                <div className="text-xs text-white/30 font-mono">{matchPoints.length} matches</div>
              </div>
              <div className="font-display text-2xl text-gold">{total}</div>
            </div>
            <Sparkline data={matchPoints.map(m => m.pts)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Sparkline({ data }) {
  if (!data || data.length < 2) {
    return <div className="h-10 flex items-center justify-center text-white/20 text-xs font-mono">not enough data</div>
  }

  const h = 36
  const w = 120
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')

  const lastVal = data[data.length - 1]
  const color = lastVal > 40 ? '#f59e0b' : lastVal > 0 ? '#10b981' : '#ef4444'

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {/* Last point dot */}
      {data.length > 0 && (() => {
        const lastX = w
        const lastY = h - ((lastVal - min) / range) * h
        return <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
      })()}
    </svg>
  )
}
