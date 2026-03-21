import { useMemo } from 'react'
import { motion } from 'framer-motion'
import PLAYERS from '../data/players'
import { formatPrice } from '../utils/auction'

export default function ValueLeaderboard({ soldPlayers, performances, teams }) {
  const enriched = useMemo(() => {
    return soldPlayers.map(ap => {
      const player = PLAYERS.find(p => p.id === ap.player_id)
      const team = teams.find(t => t.id === ap.sold_to_team_id)
      const totalPoints = performances
        .filter(p => p.player_id === ap.player_id)
        .reduce((s, p) => s + (p.total_points || 0), 0)
      const priceCr = (ap.final_price || 20) / 100
      const valueScore = priceCr > 0 ? +(totalPoints / priceCr).toFixed(1) : 0

      return {
        ...ap,
        player,
        team,
        totalPoints,
        priceCr,
        valueScore, // points per crore
      }
    }).filter(p => p.player && p.totalPoints !== 0)
  }, [soldPlayers, performances, teams])

  const topValue = [...enriched]
    .filter(p => p.totalPoints > 0)
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, 8)

  const worstValue = [...enriched]
    .sort((a, b) => a.valueScore - b.valueScore)
    .slice(0, 5)

  const steals = [...enriched]
    .filter(p => p.priceCr <= 0.5 && p.totalPoints > 30) // bought cheap, performing well
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, 5)

  if (enriched.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-white/30 font-mono text-sm">
          Value rankings appear once matches are processed
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Best value */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 bg-sold/10 border-b border-bg-border flex items-center gap-2">
          <span className="text-xl">💎</span>
          <h3 className="font-bold">Best Value Picks</h3>
          <span className="text-xs text-white/30 font-mono ml-1">pts / crore</span>
        </div>
        {topValue.map((p, i) => (
          <ValueRow key={p.id} player={p} rank={i + 1} mode="good" maxScore={topValue[0]?.valueScore || 1} />
        ))}
      </div>

      {/* Steals */}
      {steals.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 bg-electric/10 border-b border-bg-border flex items-center gap-2">
            <span className="text-xl">🎣</span>
            <h3 className="font-bold">Steals of the Auction</h3>
            <span className="text-xs text-white/30 font-mono ml-1">big points, low price</span>
          </div>
          {steals.map((p, i) => (
            <ValueRow key={p.id} player={p} rank={i + 1} mode="steal" maxScore={steals[0]?.valueScore || 1} />
          ))}
        </div>
      )}

      {/* Flops */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 bg-danger/5 border-b border-bg-border flex items-center gap-2">
          <span className="text-xl">💸</span>
          <h3 className="font-bold">Worst Value Picks</h3>
          <span className="text-xs text-white/30 font-mono ml-1">overpaid underperformers</span>
        </div>
        {worstValue.map((p, i) => (
          <ValueRow key={p.id} player={p} rank={i + 1} mode="bad" maxScore={Math.abs(worstValue[0]?.valueScore || 1)} />
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Most Spent', val: enriched.sort((a,b)=>b.priceCr-a.priceCr)[0], display: p => `${p.player?.name} (${formatPrice(p.final_price)})` },
          { label: 'Biggest Scorer', val: enriched.sort((a,b)=>b.totalPoints-a.totalPoints)[0], display: p => `${p.player?.name} (${p.totalPoints}pts)` },
          { label: 'Best Bargain', val: topValue[0], display: p => `${p.player?.name} (${p.valueScore} pts/Cr)` },
        ].map(stat => (
          <div key={stat.label} className="card p-3 text-center">
            <div className="text-xs text-white/30 font-mono mb-1">{stat.label}</div>
            <div className="text-sm font-bold text-white/80">{stat.val ? stat.display(stat.val) : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ValueRow({ player: p, rank, mode, maxScore }) {
  const barColor = mode === 'good' ? '#10b981' : mode === 'steal' ? '#3b82f6' : '#ef4444'
  const barWidth = Math.max(5, Math.abs(Math.min(p.valueScore, maxScore)) / maxScore * 100)

  const ROLE_CLASS = { BAT: 'role-badge-bat', BWL: 'role-badge-bwl', AR: 'role-badge-ar', WK: 'role-badge-wk' }

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.04 }}
      className="flex items-center gap-3 px-5 py-3 border-b border-bg-border/40 last:border-0 hover:bg-bg-elevated/20 transition-colors"
    >
      <span className="w-5 text-center text-white/25 font-mono text-xs">{rank}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{p.player?.name}</span>
          {p.player?.is_foreign && <span className="text-xs">🌍</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`${ROLE_CLASS[p.player?.role]} text-xs`} style={{ fontSize: '9px', padding: '0 4px' }}>
            {p.player?.role}
          </span>
          <span className="text-xs text-white/30 font-mono">{p.team?.name}</span>
          <span className="text-xs text-white/20 font-mono">{formatPrice(p.final_price)}</span>
        </div>

        {/* Value bar */}
        <div className="mt-1.5 h-1 bg-bg-deep rounded-full overflow-hidden w-full">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.6, delay: rank * 0.04 }}
            className="h-full rounded-full"
            style={{ background: barColor }}
          />
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="font-display text-2xl" style={{ color: barColor }}>
          {p.valueScore > 0 ? `+${p.valueScore}` : p.valueScore}
        </div>
        <div className="text-xs text-white/30 font-mono">pts/Cr</div>
        <div className="text-xs text-white/20 font-mono">{p.totalPoints} total</div>
      </div>
    </motion.div>
  )
}
