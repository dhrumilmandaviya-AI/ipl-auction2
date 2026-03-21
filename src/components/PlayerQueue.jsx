import { useState, useMemo } from 'react'
import { useAuction } from '../contexts/AuctionContext'
import { ROLE_CONFIG, PLAYERS as ALL_PLAYERS } from '../utils/auction'
import PLAYERS from '../data/players'

const ROLES = ['All', 'BAT', 'BWL', 'AR', 'WK']

export default function PlayerQueue({ onSelectPlayer }) {
  const { pendingPlayers, isAdmin } = useAuction()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [foreignFilter, setForeignFilter] = useState('All')

  // Hydrate with full player data
  const enriched = useMemo(() => {
    return pendingPlayers.map(ap => ({
      ...ap,
      playerData: PLAYERS.find(p => p.id === ap.player_id) || ap.players,
    }))
  }, [pendingPlayers])

  const filtered = useMemo(() => {
    return enriched.filter(ap => {
      const p = ap.playerData
      if (!p) return false
      if (roleFilter !== 'All' && p.role !== roleFilter) return false
      if (foreignFilter === 'Foreign' && !p.is_foreign) return false
      if (foreignFilter === 'Indian' && p.is_foreign) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
          !p.team?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [enriched, roleFilter, foreignFilter, search])

  const ROLE_CONFIG_LOCAL = {
    BAT: { label: 'BAT', class: 'role-badge-bat' },
    BWL: { label: 'BWL', class: 'role-badge-bwl' },
    AR:  { label: 'AR',  class: 'role-badge-ar'  },
    WK:  { label: 'WK',  class: 'role-badge-wk'  },
  }

  return (
    <div className="card flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-bg-border space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Player Queue</h3>
          <span className="text-xs font-mono text-white/40">{pendingPlayers.length} remaining</span>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player or team..."
          className="w-full bg-bg-deep border border-bg-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20 focus:border-gold/40 outline-none"
        />

        <div className="flex gap-1 flex-wrap">
          {ROLES.map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                roleFilter === r ? 'bg-gold text-black' : 'text-white/40 hover:text-white border border-bg-border'
              }`}
            >
              {r}
            </button>
          ))}
          <div className="flex-1" />
          {['All', 'Indian', 'Foreign'].map(f => (
            <button
              key={f}
              onClick={() => setForeignFilter(f)}
              className={`px-2 py-0.5 rounded text-xs transition-all ${
                foreignFilter === f ? 'bg-electric/20 text-electric border border-electric/40' : 'text-white/30 hover:text-white border border-bg-border'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="p-6 text-center text-white/30 font-mono text-sm">
            No players match filters
          </div>
        )}
        {filtered.map((ap, i) => {
          const p = ap.playerData
          if (!p) return null
          const rc = ROLE_CONFIG_LOCAL[p.role] || ROLE_CONFIG_LOCAL.BAT
          return (
            <div
              key={ap.id}
              className={`flex items-center gap-2 px-3 py-2.5 border-b border-bg-border/50 transition-colors ${
                isAdmin ? 'hover:bg-gold/5 cursor-pointer' : 'hover:bg-bg-elevated/50'
              }`}
              onClick={() => isAdmin && onSelectPlayer?.(ap)}
            >
              <span className="text-white/20 font-mono text-xs w-5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{p.name}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`${rc.class} text-xs`}>{p.role}</span>
                  <span className="text-xs text-white/30 font-mono">{p.team}</span>
                  {p.is_foreign && <span className="text-xs">🌍</span>}
                </div>
              </div>
              {isAdmin && (
                <button className="text-xs text-white/20 hover:text-gold border border-bg-border hover:border-gold/30 px-2 py-1 rounded transition-all flex-shrink-0">
                  Up Next
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
