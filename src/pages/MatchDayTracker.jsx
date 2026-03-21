import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import PLAYERS from '../data/players'
import { TEAM_COLORS, formatPrice } from '../utils/auction'

// IPL 2026 fixture list (first 14 match days — admin can update via SQL)
const SAMPLE_FIXTURES = [
  { team1: 'CSK', team2: 'RCB', label: 'CSK vs RCB' },
  { team1: 'MI',  team2: 'KKR', label: 'MI vs KKR' },
  { team1: 'SRH', team2: 'DC',  label: 'SRH vs DC' },
  { team1: 'GT',  team2: 'RR',  label: 'GT vs RR' },
  { team1: 'PBKS',team2: 'LSG', label: 'PBKS vs LSG' },
]

export default function MatchDayTracker() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, teams, loadRoom } = useAuction()

  const [matches, setMatches] = useState([])
  const [allSquads, setAllSquads] = useState({})
  const [performances, setPerformances] = useState([])
  const [todayMatchId, setTodayMatchId] = useState(null)
  const [selectedMatchId, setSelectedMatchId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId)
    loadData()
    // Subscribe to live performance updates
    const channel = supabase.channel(`matchday-${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'match_performances',
        filter: `auction_room_id=eq.${roomId}`
      }, loadData)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [roomId])

  async function loadData() {
    setLoading(true)
    const [{ data: matchData }, { data: squadData }, { data: perfData }] = await Promise.all([
      supabase.from('matches').select('*').eq('auction_room_id', roomId).order('match_number'),
      supabase.from('auction_players').select('*, players(*)').eq('auction_room_id', roomId).eq('status', 'sold'),
      supabase.from('match_performances').select('*').eq('auction_room_id', roomId),
    ])

    if (matchData) {
      setMatches(matchData)
      const today = matchData.find(m => m.is_today)
      if (today) { setTodayMatchId(today.id); setSelectedMatchId(today.id) }
      else if (matchData.length > 0) setSelectedMatchId(matchData[matchData.length - 1].id)
    }
    if (perfData) setPerformances(perfData)

    if (squadData) {
      const grouped = {}
      for (const ap of squadData) {
        const tid = ap.sold_to_team_id
        if (!grouped[tid]) grouped[tid] = []
        const pd = PLAYERS.find(p => p.id === ap.player_id) || ap.players
        grouped[tid].push({ ...ap, playerData: pd })
      }
      setAllSquads(grouped)
    }
    setLoading(false)
  }

  const selectedMatch = matches.find(m => m.id === selectedMatchId)
  const matchPerfs = performances.filter(p => p.match_id === selectedMatchId)

  // For each team: which players are in today's match + their points
  const teamMatchSummaries = teams.map(team => {
    const squad = allSquads[team.id] || []
    const playing = squad.filter(ap => {
      if (!selectedMatch) return false
      const p = ap.playerData
      return p?.team === selectedMatch.team1 || p?.team === selectedMatch.team2
    })
    const playingWithPoints = playing.map(ap => {
      const perf = matchPerfs.find(p => p.player_id === ap.player_id)
      return {
        ...ap,
        matchPoints: perf?.total_points ?? null,
        didNotPlay: perf?.did_not_play ?? false,
      }
    })
    const totalMatchPts = playingWithPoints.reduce((s, p) => s + (p.matchPoints || 0), 0)
    return { team, playing: playingWithPoints, totalMatchPts }
  }).sort((a, b) => b.totalMatchPts - a.totalMatchPts)

  const hasLivePoints = matchPerfs.length > 0

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-xl mx-auto w-full p-4 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-4xl text-gold">Match Day</h1>
            <p className="text-white/40 font-mono text-sm">See who's playing and watch points roll in</p>
          </div>
          {todayMatchId && (
            <div className="flex items-center gap-2 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
              <span className="text-danger text-sm font-bold">LIVE TODAY</span>
            </div>
          )}
        </div>

        {/* Match selector */}
        {matches.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {matches.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMatchId(m.id)}
                className={`px-3 py-2 rounded-lg text-sm font-bold flex-shrink-0 transition-all whitespace-nowrap ${
                  selectedMatchId === m.id
                    ? m.is_today ? 'bg-danger text-white' : 'bg-gold text-black'
                    : 'border border-bg-border text-white/40 hover:text-white'
                }`}
              >
                {m.is_today && '🔴 '}
                {m.name}
              </button>
            ))}
          </div>
        )}

        {matches.length === 0 && !loading && (
          <div className="card p-10 text-center">
            <div className="text-5xl mb-4">📅</div>
            <h3 className="font-display text-2xl text-white/40 mb-2">No matches logged yet</h3>
            <p className="text-white/20 font-mono text-sm">Admin processes scorecards in the Admin panel.<br />Matches appear here automatically.</p>
          </div>
        )}

        {selectedMatch && (
          <>
            {/* Match header */}
            <div className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <MatchupBadge team={selectedMatch.team1} />
                <span className="font-display text-2xl text-white/40">VS</span>
                <MatchupBadge team={selectedMatch.team2} />
              </div>
              <div className="text-right">
                <div className="text-xs text-white/30 font-mono">Match #{selectedMatch.match_number}</div>
                {selectedMatch.match_date && (
                  <div className="text-xs text-white/40 font-mono">{selectedMatch.match_date}</div>
                )}
                <div className={`text-sm font-bold mt-1 ${selectedMatch.status === 'live' ? 'text-danger animate-pulse' : selectedMatch.status === 'completed' ? 'text-sold' : 'text-yellow-400'}`}>
                  {selectedMatch.status?.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Team-by-team breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teamMatchSummaries.map(({ team, playing, totalMatchPts }, rank) => (
                <motion.div
                  key={team.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: rank * 0.05 }}
                  className={`card p-4 ${rank === 0 && hasLivePoints ? 'border-gold/40 bg-gold/5' : ''}`}
                >
                  {/* Team header */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-bold">{team.name}</div>
                      <div className="text-xs text-white/30 font-mono">{playing.length} players active today</div>
                    </div>
                    <div className="text-right">
                      {rank === 0 && hasLivePoints && <div className="text-xs text-gold font-mono mb-0.5">🏆 Leading</div>}
                      <div className={`font-display text-3xl ${hasLivePoints ? 'text-gold' : 'text-white/40'}`}>
                        {hasLivePoints ? `+${totalMatchPts}` : '—'}
                      </div>
                      <div className="text-xs text-white/30 font-mono">today</div>
                    </div>
                  </div>

                  {/* Players list */}
                  <div className="space-y-1">
                    {playing.length === 0 && (
                      <div className="text-xs text-white/20 font-mono text-center py-3">
                        No players in this match
                      </div>
                    )}
                    {playing.map(ap => {
                      const p = ap.playerData
                      const pts = ap.matchPoints
                      const color = pts === null ? 'text-white/40' :
                                    pts > 40 ? 'text-gold' :
                                    pts > 20 ? 'text-sold' :
                                    pts < 0  ? 'text-danger' : 'text-white'
                      return (
                        <div key={ap.id} className="flex items-center justify-between py-1.5 border-b border-bg-border/30 last:border-0">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{p?.name}</div>
                            <div className="flex items-center gap-1">
                              <RoleDot role={p?.role} />
                              <span className="text-xs text-white/30 font-mono">{p?.team}</span>
                              {p?.is_foreign && <span className="text-xs">🌍</span>}
                            </div>
                          </div>
                          <div className={`font-display text-xl ml-2 flex-shrink-0 ${color}`}>
                            {pts === null ? '—' : ap.didNotPlay ? 'DNP' : pts > 0 ? `+${pts}` : pts}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Live leaderboard for this match */}
            {hasLivePoints && (
              <div className="card p-4">
                <h2 className="font-bold mb-3 text-sm text-white/60 font-mono uppercase tracking-wider">
                  Match Points Leaderboard
                </h2>
                <div className="space-y-2">
                  {teamMatchSummaries.map(({ team, totalMatchPts }, i) => {
                    const max = teamMatchSummaries[0]?.totalMatchPts || 1
                    return (
                      <div key={team.id} className="flex items-center gap-3">
                        <span className="w-5 text-center text-white/30 font-mono text-xs">{i + 1}</span>
                        <span className="w-32 text-sm font-bold truncate">{team.name}</span>
                        <div className="flex-1 h-5 bg-bg-deep rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(0, (totalMatchPts / max) * 100)}%` }}
                            transition={{ duration: 0.8, delay: i * 0.1 }}
                            className="h-full rounded-full bg-gold"
                          />
                        </div>
                        <span className="font-display text-xl text-gold w-12 text-right">{totalMatchPts}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MatchupBadge({ team }) {
  const cfg = TEAM_COLORS[team] || { bg: '#1e2a3a', text: '#fff' }
  return (
    <div
      className="px-4 py-2 rounded-xl font-display text-2xl tracking-wider"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {team}
    </div>
  )
}

function RoleDot({ role }) {
  const colors = { BAT: '#3b82f6', BWL: '#ef4444', AR: '#10b981', WK: '#8b5cf6' }
  return <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: colors[role] || '#fff' }} />
}
