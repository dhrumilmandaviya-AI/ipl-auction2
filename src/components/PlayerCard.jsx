import { motion, AnimatePresence } from 'framer-motion'
import { ROLE_CONFIG, TEAM_COLORS, formatPrice } from '../utils/auction'

export default function PlayerCard({ player, currentBid, topBidderName, compact = false }) {
  if (!player) return null

  const role = ROLE_CONFIG[player.role] || ROLE_CONFIG.BAT
  const teamColor = TEAM_COLORS[player.team]

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-2">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold flex-shrink-0"
          style={{ background: teamColor?.bg || '#1e2a3a', color: teamColor?.text || '#fff' }}
        >
          {player.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm truncate">{player.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded ${role.class}`}>{player.role}</span>
            <span className="text-xs text-white/40">{player.team}</span>
            {player.is_foreign && <span className="text-xs text-yellow-500">🌍</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      key={player.id}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative"
    >
      {/* Glow backdrop */}
      <div className="absolute -inset-2 rounded-2xl opacity-30 blur-xl"
        style={{ background: `radial-gradient(circle, ${role.color}40 0%, transparent 70%)` }}
      />

      <div className="relative card p-6 rounded-2xl">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          {/* Avatar / initials */}
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-display tracking-wide shadow-lg"
            style={{ background: teamColor?.bg || '#1e2a3a', color: teamColor?.text || '#fff' }}
          >
            {player.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
          </div>

          <div className="text-right">
            {/* IPL Team badge */}
            <div
              className="inline-block text-xs font-bold px-2 py-1 rounded mb-1"
              style={{ background: teamColor?.bg || '#1e2a3a', color: teamColor?.text || '#fff' }}
            >
              {player.team}
            </div>
            {player.is_foreign && (
              <div className="text-xs text-yellow-500 font-mono">🌍 Overseas</div>
            )}
          </div>
        </div>

        {/* Name */}
        <h2 className="font-display text-4xl text-white leading-none mb-1">{player.name}</h2>

        {/* Role badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className={`${role.class} font-bold`}>{role.label}</span>
          <span className="text-white/30 text-xs font-mono">{player.nationality}</span>
        </div>

        {/* Stats */}
        <div className="space-y-2">
          {player.batting && (
            <div className="bg-bg-deep rounded-lg px-3 py-2 text-xs font-mono text-white/60">
              🏏 {player.batting}
            </div>
          )}
          {player.bowling && (
            <div className="bg-bg-deep rounded-lg px-3 py-2 text-xs font-mono text-white/60">
              🏀 {player.bowling}
            </div>
          )}
          {!player.batting && !player.bowling && (
            <div className="bg-bg-deep rounded-lg px-3 py-2 text-xs font-mono text-white/40 italic">
              No 2025 IPL stats available
            </div>
          )}
        </div>

        {/* Current bid */}
        <AnimatePresence mode="wait">
          {currentBid > 0 && (
            <motion.div
              key={currentBid}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mt-4 pt-4 border-t border-bg-border flex items-center justify-between"
            >
              <div>
                <div className="text-xs text-white/40 font-mono uppercase tracking-wider">Current Bid</div>
                <div className="font-display text-3xl text-gold">{formatPrice(currentBid)}</div>
              </div>
              {topBidderName && (
                <div className="text-right">
                  <div className="text-xs text-white/40 font-mono uppercase tracking-wider">Highest Bidder</div>
                  <div className="text-white font-bold">{topBidderName}</div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {currentBid === 0 && (
          <div className="mt-4 pt-4 border-t border-bg-border text-center">
            <span className="text-white/30 font-mono text-sm">Base Price: </span>
            <span className="font-display text-2xl text-gold/60">₹20L</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
