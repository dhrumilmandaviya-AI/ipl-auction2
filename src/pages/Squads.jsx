import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import PLAYERS from '../data/players'
import { formatPrice } from '../utils/auction'

const ROLE_CONFIG_LOCAL = {
  BAT: { class: 'role-badge-bat' }, BWL: { class: 'role-badge-bwl' },
  AR:  { class: 'role-badge-ar'  }, WK:  { class: 'role-badge-wk'  },
}

export default function Squads() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, room, teams, loading, loadRoom } = useAuction()
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [squadData, setSquadData] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [groupBy, setGroupBy] = useState('ipl') // 'ipl' | 'role'
  const [showBench, setShowBench] = useState(true)
  const [seasonSelections, setSeasonSelections] = useState({}) // teamId -> player_ids[]

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId)
  }, [roomId])

  useEffect(() => {
    if (teams.length > 0 && !selectedTeam) {
      const myTeamId = user?.teamId
      const found = myTeamId && teams.find(t => t.id === myTeamId)
      setSelectedTeam(found ? myTeamId : teams[0].id)
    }
  }, [teams, user])

  useEffect(() => {
    if (teams.length > 0) {
      loadAllSquads()
      loadSeasonSelections()
    }
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
      grouped[tid].push({ ...ap, playerData: PLAYERS.find(p => p.id === ap.player_id) || ap.players })
    }
    setSquadData(grouped)
  }

  async function loadSeasonSelections() {
    const { data } = await supabase
      .from('team_season_selections')
      .select('team_id, player_ids')
      .eq('auction_room_id', roomId)
    if (data) {
      const map = {}
      data.forEach(s => { map[s.team_id] = s.player_ids })
      setSeasonSelections(map)
    }
  }

  // Global player search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    const results = []
    for (const [tid, players] of Object.entries(squadData)) {
      for (const ap of players) {
        if (ap.playerData?.name?.toLowerCase().includes(q) || ap.playerData?.team?.toLowerCase().includes(q)) {
          const ownerTeam = teams.find(t => t.id === tid)
          results.push({ ...ap, ownerTeam })
        }
      }
    }
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="max-w-screen-xl mx-auto w-full p-4 space-y-4">
          <div className="flex items-center gap-3">
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search any player across all squads..."
              className="flex-1 bg-bg-card border border-gold/40 rounded-xl px-4 py-3 text-white text-sm focus:border-gold outline-none font-mono"
            />
            <button onClick={() => setSearchQuery('')} className="btn-ghost text-sm">✕ Clear</button>
          </div>
          <div className="text-xs text-white/30 font-mono">{results.length} results for "{searchQuery}"</div>
          <div className="space-y-2">
            {results.map(ap => {
              const p = ap.playerData
              const rc = ROLE_CONFIG_LOCAL[p?.role] || ROLE_CONFIG_LOCAL.BAT
              return (
                <div key={ap.id} className="card p-3 flex items-center gap-3 hover:border-gold/20 transition-all">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{p?.name}</span>
                      {p?.is_foreign && <span className="text-xs">🌍</span>}
                      <span className={`${rc.class} text-xs`}>{p?.role}</span>
                      <span className="text-xs text-white/30 font-mono">{p?.team}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/40 font-mono">owned by</div>
                    <div className="font-bold text-gold text-sm">{ap.ownerTeam?.name}</div>
                    <div className="text-xs text-white/30 font-mono">{formatPrice(ap.final_price)}</div>
                  </div>
                </div>
              )
            })}
            {results.length === 0 && (
              <div className="card p-8 text-center text-white/30 font-mono">No players found for "{searchQuery}"</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const squad = (squadData[selectedTeam] || []).sort((a, b) => {
    if (groupBy === 'ipl') {
      const tA = a.playerData?.team || 'ZZZ', tB = b.playerData?.team || 'ZZZ'
      if (tA !== tB) return tA.localeCompare(tB)
    }
    const roleOrder = { WK: 0, BAT: 1, AR: 2, BWL: 3 }
    return (roleOrder[a.playerData?.role] ?? 4) - (roleOrder[b.playerData?.role] ?? 4)
  })

  const selectionIds = seasonSelections[selectedTeam] || []
  const selected15 = selectionIds.length > 0
    ? squad.filter(ap => selectionIds.includes(ap.player_id))
    : squad
  const bench = selectionIds.length > 0
    ? squad.filter(ap => !selectionIds.includes(ap.player_id))
    : []

  // Group playing 15
  const grouped = {}
  for (const ap of selected15) {
    const key = groupBy === 'ipl' ? (ap.playerData?.team || 'Unknown') : (ap.playerData?.role || 'BAT')
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ap)
  }

  const team = teams.find(t => t.id === selectedTeam)
  const totalSpent = squad.reduce((s, ap) => s + (ap.final_price || 0), 0)
  const foreignCount = squad.filter(ap => ap.playerData?.is_foreign).length

  function shareOnWhatsApp() {
    if (!team) return
    const lines = [
      `🏏 *${team.name}* — IPL Fantasy Squad`,
      `💰 Purse spent: ${formatPrice(totalSpent)} | 🌍 Overseas: ${foreignCount}`,
      `🏆 Points: ${team.total_points || 0}`,
      '',
      ...squad.map(ap => `• ${ap.playerData?.name} (${ap.playerData?.role}) — ${formatPrice(ap.final_price)}`),
      '',
      `Join at: ${window.location.origin}${window.location.pathname.replace(/\/squads$/, '')}`,
    ]
    const text = encodeURIComponent(lines.join('\n'))
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-xl mx-auto w-full p-4 space-y-4">

        {/* Header with search */}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-4xl text-gold">Squads</h1>
          <div className="flex-1 min-w-48">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Search any player..."
              className="w-full bg-bg-card border border-bg-border rounded-xl px-4 py-2 text-white text-sm focus:border-gold/40 outline-none"
            />
          </div>
        </div>

        {/* Team tabs */}
        <div className="flex gap-2 flex-wrap bg-bg-card border border-bg-border rounded-xl p-2">
          {teams.map(t => (
            <button key={t.id} onClick={() => setSelectedTeam(t.id)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex-1 min-w-24 ${
                selectedTeam === t.id ? 'bg-gold text-black' : 'text-white/50 hover:text-white hover:bg-bg-elevated'
              }`}>
              {t.name}
              <span className={`ml-2 text-xs ${selectedTeam === t.id ? 'text-black/60' : 'text-white/30'}`}>
                {(squadData[t.id] || []).length}p
              </span>
            </button>
          ))}
        </div>

        {team && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">

            {/* Sidebar */}
            <div className="space-y-4">
              <div className="card p-4">
                <h2 className="font-display text-2xl text-gold mb-4">{team.name}</h2>
                <div className="space-y-3">
                  <Stat label="Purse Remaining" value={formatPrice(team.purse_remaining)} color="text-gold" />
                  <Stat label="Total Spent" value={formatPrice(totalSpent)} />
                  <Stat label="Players" value={`${squad.length}`} />
                  <Stat label="Overseas" value={`${foreignCount}`} />
                  <Stat label="Lifelines Left" value={`${team.lifelines} / 3`} color="text-yellow-500" />
                  <Stat label="Fantasy Points" value={team.total_points || 0} color="text-gold" />
                  {selectionIds.length > 0 && (
                    <Stat label="Season Squad" value={`${selectionIds.length}/15 locked`} color="text-sold" />
                  )}
                </div>
              </div>

              {/* Biggest buy */}
              {squad[0] && (
                <div className="card p-4 border-gold/20">
                  <div className="text-xs text-white/40 font-mono uppercase tracking-wider mb-2">Biggest Buy</div>
                  <div className="font-bold">{squad[0].playerData?.name}</div>
                  <div className="font-display text-2xl text-gold">{formatPrice(squad[0].final_price)}</div>
                </div>
              )}

              {/* Controls */}
              <div className="card p-3 space-y-2">
                <div className="flex gap-2">
                  <button onClick={() => setGroupBy('ipl')}
                    className={`flex-1 text-xs py-1.5 rounded-lg transition-all ${groupBy === 'ipl' ? 'bg-gold text-black font-bold' : 'border border-bg-border text-white/40'}`}>
                    By IPL Team
                  </button>
                  <button onClick={() => setGroupBy('role')}
                    className={`flex-1 text-xs py-1.5 rounded-lg transition-all ${groupBy === 'role' ? 'bg-gold text-black font-bold' : 'border border-bg-border text-white/40'}`}>
                    By Role
                  </button>
                </div>
                {bench.length > 0 && (
                  <button onClick={() => setShowBench(b => !b)}
                    className="w-full text-xs py-1.5 rounded-lg border border-bg-border text-white/40 hover:text-white transition-all">
                    {showBench ? '👁 Hide' : '👁 Show'} Bench ({bench.length})
                  </button>
                )}
                <button onClick={shareOnWhatsApp}
                  className="w-full text-xs py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-all">
                  📲 Share on WhatsApp
                </button>
              </div>
            </div>

            {/* Squad list */}
            <div className="space-y-4">

              {/* Playing 15 / Full squad */}
              {selectionIds.length > 0 && (
                <div className="text-xs text-white/40 font-mono uppercase tracking-wider px-1">
                  ✅ Season Squad ({selected15.length} players)
                </div>
              )}
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([key, players]) => (
                <div key={key} className="card overflow-hidden">
                  <div className="px-4 py-2 bg-bg-elevated border-b border-bg-border flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-gold uppercase tracking-wider">{key}</span>
                    <span className="text-xs text-white/20 font-mono">({players.length})</span>
                  </div>
                  {players.map(ap => <PlayerRow key={ap.id} ap={ap} />)}
                </div>
              ))}

              {/* Bench */}
              {showBench && bench.length > 0 && (
                <div className="card overflow-hidden opacity-60">
                  <div className="px-4 py-2 bg-bg-elevated border-b border-bg-border flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white/40 uppercase tracking-wider">🪑 Bench</span>
                    <span className="text-xs text-white/20 font-mono">({bench.length} — not in season squad)</span>
                  </div>
                  {bench.sort((a, b) => {
                    const tA = a.playerData?.team || 'ZZZ', tB = b.playerData?.team || 'ZZZ'
                    return tA.localeCompare(tB)
                  }).map(ap => <PlayerRow key={ap.id} ap={ap} bench />)}
                </div>
              )}

              {squad.length === 0 && (
                <div className="card p-12 text-center text-white/30 font-mono">No players bought yet</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerRow({ ap, bench }) {
  const p = ap.playerData
  const rc = ROLE_CONFIG_LOCAL[p?.role] || ROLE_CONFIG_LOCAL.BAT
  return (
    <div className={`flex items-center px-4 py-3 border-b border-bg-border/40 last:border-0 hover:bg-bg-elevated/30 transition-colors ${bench ? 'opacity-60' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold">{p?.name}</span>
          {p?.is_foreign && <span className="text-xs text-yellow-500">🌍</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`${rc.class} text-xs`}>{p?.role}</span>
          <span className="text-xs text-white/30 font-mono">{p?.team}</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-display text-xl text-gold">{formatPrice(ap.final_price)}</div>
        {ap.final_price < 40 && <div className="text-xs text-sold">💎 Value</div>}
        {ap.final_price > 500 && <div className="text-xs text-danger">🔥 Expensive</div>}
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'text-white' }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-bg-border/50 last:border-0">
      <span className="text-xs text-white/40 font-mono">{label}</span>
      <span className={`font-bold text-sm ${color}`}>{value}</span>
    </div>
  )
}
