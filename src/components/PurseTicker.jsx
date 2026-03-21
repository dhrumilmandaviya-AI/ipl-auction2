import { formatPrice } from '../utils/auction'
import { useAuction } from '../contexts/AuctionContext'
import PLAYERS from '../data/players'

const ROLE_COLOR = { BAT: '#3b82f6', BWL: '#10b981', AR: '#f59e0b', WK: '#a855f7' }

export default function PurseTicker() {
  const { teams, soldPlayers } = useAuction()

  // Build ticker items from sold players — most recent first
  const tickerItems = soldPlayers
    .filter(ap => ap.status === 'sold' && ap.final_price)
    .slice(-30)
    .reverse()
    .map(ap => {
      const player = PLAYERS.find(p => p.id === ap.player_id) || ap.players
      const team = teams.find(t => t.id === ap.sold_to_team_id)
      return { ...ap, playerData: player, teamData: team }
    })
    .filter(ap => ap.playerData)

  // Duplicate items so ticker loops seamlessly
  const doubled = [...tickerItems, ...tickerItems]

  return (
    <div className="w-full border-b border-bg-border bg-bg-card">

      {/* Teams purse strip */}
      <div className="flex items-center overflow-x-auto scrollbar-none px-4 py-2 gap-3">
        {teams.map(team => {
          const pct = (team.purse_remaining / 10000) * 100
          const color = pct > 50 ? '#10b981' : pct > 25 ? '#f59e0b' : '#ef4444'
          return (
            <div key={team.id} className="flex-shrink-0 flex items-center gap-2 bg-bg-deep rounded-lg px-3 py-1.5 border border-bg-border">
              <div>
                <div className="text-xs font-bold text-white/80 whitespace-nowrap max-w-28 truncate">{team.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-mono font-bold" style={{ color }}>{formatPrice(team.purse_remaining)}</span>
                  <span className="text-xs text-white/25 font-mono">{team.player_count}p</span>
                </div>
              </div>
              <div className="flex gap-0.5 ml-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < team.lifelines ? 'bg-yellow-500' : 'bg-bg-border'}`} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Stock ticker strip */}
      {tickerItems.length > 0 && (
        <div className="border-t border-bg-border/40 bg-black/30 overflow-hidden relative h-7">
          {/* Gradient fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-black/60 to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-black/60 to-transparent pointer-events-none" />

          {/* SOLD label */}
          <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center px-3 bg-sold text-black text-xs font-bold tracking-widest">
            SOLD
          </div>

          {/* Scrolling content */}
          <div
            className="flex items-center h-full pl-16"
            style={{
              animation: `ticker-scroll ${tickerItems.length * 4}s linear infinite`,
              whiteSpace: 'nowrap',
              willChange: 'transform',
            }}
          >
            {doubled.map((ap, i) => {
              const roleColor = ROLE_COLOR[ap.playerData?.role] || '#fff'
              return (
                <span key={`${ap.id}-${i}`} className="inline-flex items-center gap-1.5 mr-10 text-xs font-mono">
                  {/* Role dot */}
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: roleColor }} />

                  {/* Player name */}
                  <span className="text-white/90 font-bold">{ap.playerData?.name}</span>

                  {/* Foreign flag */}
                  {ap.playerData?.is_foreign && <span className="text-xs">🌍</span>}

                  {/* Arrow */}
                  <span className="text-white/30">→</span>

                  {/* Team */}
                  <span className="text-electric">{ap.teamData?.name || '—'}</span>

                  {/* Price */}
                  <span className="text-white/40">@</span>
                  <span className="text-gold font-bold">{formatPrice(ap.final_price)}</span>

                  {/* Separator */}
                  <span className="ml-6 text-bg-border">│</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
