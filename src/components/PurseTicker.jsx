import { useState, useEffect } from 'react'
import { formatPrice } from '../utils/auction'
import { useAuction } from '../contexts/AuctionContext'
import { supabase } from '../lib/supabase'
import PLAYERS from '../data/players'

const ROLE_COLOR = { BAT: '#3b82f6', BWL: '#10b981', AR: '#f59e0b', WK: '#a855f7' }

export default function PurseTicker() {
  const { teams, soldPlayers, room } = useAuction()
  const [livePoints, setLivePoints] = useState([]) // today's match performances

  // Load today's match performances for the live points ticker
  useEffect(() => {
    if (!room?.id) return
    async function fetchTodayPoints() {
      const today = new Date().toISOString().slice(0, 10)
      const { data: matches } = await supabase
        .from('matches')
        .select('id, name')
        .eq('auction_room_id', room.id)
        .eq('match_date', today)

      if (!matches?.length) return

      const matchIds = matches.map(m => m.id)
      const { data: perfs } = await supabase
        .from('match_performances')
        .select('player_id, total_points, counted_points, match_id')
        .in('match_id', matchIds)
        .gt('total_points', 0)
        .order('total_points', { ascending: false })
        .limit(20)

      if (perfs?.length) {
        const enriched = perfs.map(p => ({
          ...p,
          player: PLAYERS.find(pl => pl.id === p.player_id),
          match: matches.find(m => m.id === p.match_id),
          team: teams.find(t => t.id === soldPlayers.find(ap => ap.player_id === p.player_id)?.sold_to_team_id),
        })).filter(p => p.player)
        setLivePoints(enriched)
      }
    }
    fetchTodayPoints()
  }, [room?.id, teams.length])

  // Build sold ticker items
  const tickerItems = soldPlayers
    .filter(ap => ap.status === 'sold' && ap.final_price)
    .slice(-30).reverse()
    .map(ap => ({
      ...ap,
      playerData: PLAYERS.find(p => p.id === ap.player_id) || ap.players,
      teamData: teams.find(t => t.id === ap.sold_to_team_id),
    }))
    .filter(ap => ap.playerData)

  const doubled = [...tickerItems, ...tickerItems]
  const doubledPoints = [...livePoints, ...livePoints]

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
                  {team.total_points > 0 && (
                    <span className="text-xs text-gold font-mono font-bold">{team.total_points}pts</span>
                  )}
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

      {/* Live points ticker — shows during match day */}
      {livePoints.length > 0 && (
        <div className="border-t border-bg-border/40 bg-electric/5 overflow-hidden relative h-7">
          <div className="absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-bg-card to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-bg-card to-transparent pointer-events-none" />
          <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center px-3 bg-electric text-black text-xs font-bold tracking-widest">
            LIVE
          </div>
          <div
            className="flex items-center h-full pl-16"
            style={{ animation: `ticker-scroll ${livePoints.length * 3}s linear infinite`, whiteSpace: 'nowrap', willChange: 'transform' }}
          >
            {doubledPoints.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 mr-10 text-xs font-mono">
                <span className="text-white/90 font-bold">{p.player?.name}</span>
                <span className="text-white/30">→</span>
                <span className="text-gold font-bold">+{p.total_points}pts</span>
                {p.team && <span className="text-white/40">({p.team.name})</span>}
                <span className="ml-4 text-bg-border">│</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sold ticker */}
      {tickerItems.length > 0 && livePoints.length === 0 && (
        <div className="border-t border-bg-border/40 bg-black/30 overflow-hidden relative h-7">
          <div className="absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-black/60 to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-black/60 to-transparent pointer-events-none" />
          <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center px-3 bg-sold text-black text-xs font-bold tracking-widest">
            SOLD
          </div>
          <div
            className="flex items-center h-full pl-16"
            style={{ animation: `ticker-scroll ${tickerItems.length * 4}s linear infinite`, whiteSpace: 'nowrap', willChange: 'transform' }}
          >
            {doubled.map((ap, i) => {
              const roleColor = ROLE_COLOR[ap.playerData?.role] || '#fff'
              return (
                <span key={i} className="inline-flex items-center gap-1.5 mr-10 text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: roleColor }} />
                  <span className="text-white/90 font-bold">{ap.playerData?.name}</span>
                  {ap.playerData?.is_foreign && <span className="text-xs">🌍</span>}
                  <span className="text-white/30">→</span>
                  <span className="text-electric">{ap.teamData?.name || '—'}</span>
                  <span className="text-white/40">@</span>
                  <span className="text-gold font-bold">{formatPrice(ap.final_price)}</span>
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
