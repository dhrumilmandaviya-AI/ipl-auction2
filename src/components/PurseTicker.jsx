import { formatPrice } from '../utils/auction'
import { useAuction } from '../contexts/AuctionContext'

export default function PurseTicker() {
  const { teams, soldPlayers } = useAuction()

  // Stock ticker of last sold players
  const tickerItems = soldPlayers.slice(-15).reverse()

  return (
    <div className="w-full border-b border-bg-border bg-bg-card">
      {/* Teams purse strip */}
      <div className="flex items-center overflow-x-auto scrollbar-none px-4 py-2 gap-4">
        {teams.map(team => {
          const pct = (team.purse_remaining / 10000) * 100
          const color = pct > 50 ? '#10b981' : pct > 25 ? '#f59e0b' : '#ef4444'
          return (
            <div key={team.id} className="flex-shrink-0 flex items-center gap-2 bg-bg-deep rounded-lg px-3 py-1.5">
              <div>
                <div className="text-xs font-bold text-white/80 whitespace-nowrap max-w-24 truncate">{team.name}</div>
                <div className="text-xs font-mono" style={{ color }}>{formatPrice(team.purse_remaining)}</div>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < team.lifelines ? 'bg-yellow-500' : 'bg-bg-border'}`} />
                ))}
              </div>
              <div className="text-xs text-white/30 font-mono">{team.player_count}p</div>
            </div>
          )
        })}
      </div>

      {/* Sold ticker */}
      {tickerItems.length > 0 && (
        <div className="border-t border-bg-border/50 bg-bg-deep px-2 py-1 ticker-wrap">
          <div className="ticker-content text-xs font-mono text-white/40 flex gap-8">
            {tickerItems.map(p => (
              <span key={p.id} className="flex items-center gap-1">
                <span className="text-gold">●</span>
                <span className="text-white/70">{p.players?.name}</span>
                <span>→</span>
                <span className="text-gold">{formatPrice(p.final_price)}</span>
                <span className="text-white/30">({p.sold_to_team?.name})</span>
                <span className="mx-4 text-bg-border">│</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
