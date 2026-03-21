import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import PLAYERS from '../data/players'
import { formatPrice, ROLE_CONFIG } from '../utils/auction'

export default function Squads() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, room, teams, loading, loadRoom } = useAuction()
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [squadData, setSquadData] = useState({}) // teamId -> array of players

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId)
  }, [roomId])

  useEffect(() => {
    if (teams.length > 0 && !selectedTeam) {
      // Default to the current user's own team first
      const myTeamId = user?.teamId
      const found = myTeamId && teams.find(t => t.id === myTeamId)
      setSelectedTeam(found ? myTeamId : teams[0].id)
    }
  }, [teams, user])

  useEffect(() => {
    if (!teams.length) return
    loadAllSquads()
  }, [teams])

  async function loadAllSquads() {
    const { data } = await supabase
      .from('auction_players')
      .select('*, players(*)')
      .eq('auction_room_id', roomId)
      .eq('status', 'sold')
      .order('final_price', { ascending: false })

    if (!data) return
    const grouped = {}
    for (const ap of data) {
      const tid = ap.sold_to_team_id
      if (!grouped[tid]) grouped[tid] = []
      const playerData = PLAYERS.find(p => p.id === ap.player_id) || ap.players
      grouped[tid].push({ ...ap, playerData })
    }
    setSquadData(grouped)
  }

  const ROLE_ORDER = { WK: 0, BAT: 1, AR: 2, BWL: 3 }
  const ROLE_LABELS = { WK: '🧤 Wicket Keepers', BAT: '🏏 Batsmen', AR: '⚡ All-Rounders', BWL: '🏀 Bowlers' }
  const ROLE_CONFIG_LOCAL = {
    BAT: { class: 'role-badge-bat' },
    BWL: { class: 'role-badge-bwl' },
    AR:  { class: 'role-badge-ar'  },
    WK:  { class: 'role-badge-wk'  },
  }

  const squad = (squadData[selectedTeam] || []).sort((a, b) =>
    (ROLE_ORDER[a.playerData?.role] ?? 4) - (ROLE_ORDER[b.playerData?.role] ?? 4)
  )

  const byRole = {}
  for (const ap of squad) {
    const r = ap.playerData?.role || 'BAT'
    if (!byRole[r]) byRole[r] = []
    byRole[r].push(ap)
  }

  const team = teams.find(t => t.id === selectedTeam)
  const totalSpent = squad.reduce((s, ap) => s + (ap.final_price || 0), 0)
  const foreignCount = squad.filter(ap => ap.playerData?.is_foreign).length

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-xl mx-auto w-full p-4">
        <h1 className="font-display text-4xl text-gold mb-4">Squads</h1>

        {/* Team tabs */}
        <div className="flex gap-2 flex-wrap mb-6 bg-bg-card border border-bg-border rounded-xl p-2">
          {teams.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTeam(t.id)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex-1 min-w-24 ${
                selectedTeam === t.id ? 'bg-gold text-black' : 'text-white/50 hover:text-white hover:bg-bg-elevated'
              }`}
            >
              {t.name}
              <span className={`ml-2 text-xs ${selectedTeam === t.id ? 'text-black/60' : 'text-white/30'}`}>
                {(squadData[t.id] || []).length}p
              </span>
            </button>
          ))}
        </div>

        {team && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            {/* Team stats sidebar */}
            <div className="space-y-4">
              <div className="card p-4">
                <h2 className="font-display text-2xl text-gold mb-4">{team.name}</h2>
                <div className="space-y-3">
                  <Stat label="Purse Remaining" value={formatPrice(team.purse_remaining)} color="text-gold" />
                  <Stat label="Total Spent" value={formatPrice(totalSpent)} />
                  <Stat label="Players" value={`${squad.length} / 17`} />
                  <Stat label="Overseas" value={`${foreignCount} / 7`} color={foreignCount >= 7 ? 'text-danger' : 'text-white'} />
                  <Stat label="Lifelines Left" value={`${team.lifelines} / 3`} color="text-yellow-500" />
                  <Stat label="Fantasy Points" value={team.total_points || 0} color="text-gold" />
                </div>
              </div>

              {/* Top buy */}
              {squad[0] && (
                <div className="card p-4 border-gold/20">
                  <div className="text-xs text-white/40 font-mono uppercase tracking-wider mb-2">Biggest Buy</div>
                  <div className="font-bold">{squad[0].playerData?.name}</div>
                  <div className="font-display text-2xl text-gold">{formatPrice(squad[0].final_price)}</div>
                </div>
              )}
            </div>

            {/* Squad list */}
            <div className="space-y-4">
              {Object.entries(byRole).sort(([a], [b]) => (ROLE_ORDER[a] ?? 4) - (ROLE_ORDER[b] ?? 4)).map(([role, players]) => (
                <div key={role} className="card overflow-hidden">
                  <div className="px-4 py-2 bg-bg-elevated border-b border-bg-border text-xs font-mono font-bold text-white/50 uppercase tracking-wider">
                    {ROLE_LABELS[role] || role} <span className="text-white/20">({players.length})</span>
                  </div>
                  {players.map(ap => {
                    const p = ap.playerData
                    const rc = ROLE_CONFIG_LOCAL[p?.role] || ROLE_CONFIG_LOCAL.BAT
                    return (
                      <div key={ap.id} className="flex items-center px-4 py-3 border-b border-bg-border/40 last:border-0 hover:bg-bg-elevated/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{p?.name}</span>
                            {p?.is_foreign && <span className="text-xs text-yellow-500">🌍</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`${rc.class} text-xs`}>{p?.role}</span>
                            <span className="text-xs text-white/30 font-mono">{p?.team}</span>
                            {p?.batting && <span className="text-xs text-white/20 font-mono hidden md:block">{p.batting}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-display text-xl text-gold">{formatPrice(ap.final_price)}</div>
                          {ap.final_price < 40 && <div className="text-xs text-sold">💎 Value</div>}
                          {ap.final_price > 500 && <div className="text-xs text-danger">🔥 Expensive</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              {squad.length === 0 && (
                <div className="card p-12 text-center text-white/30 font-mono">
                  No players bought yet
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'text-white' }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-bg-border/50 last:border-0">
      <span className="text-xs text-white/40 font-mono">{label}</span>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  )
}
