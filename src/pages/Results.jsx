import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import PLAYERS from '../data/players'

const ROLE_COLORS = {
  BAT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  BWL: 'bg-green-500/20 text-green-400 border-green-500/30',
  AR:  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  WK:  'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

export default function Results() {
  const { roomId } = useParams()
  const navigate   = useNavigate()
  const { user, teams, loadRoom } = useAuction()

  const [matches,      setMatches]      = useState([])
  const [performances, setPerformances] = useState([])
  const [selections,   setSelections]   = useState([]) // team_season_selections
  const [squadMap,     setSquadMap]     = useState({}) // teamId → [playerId]
  const [activeTeam,   setActiveTeam]   = useState(null)
  const [expandMatch,  setExpandMatch]  = useState(null) // match id to expand in breakdown
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId)
  }, [roomId])

  useEffect(() => {
    loadAll()
  }, [roomId])

  useEffect(() => {
    if (teams.length && !activeTeam) setActiveTeam(teams[0]?.id)
  }, [teams])

  async function loadAll() {
    setLoading(true)
    const [
      { data: matchData },
      { data: perfData },
      { data: selData },
      { data: apData },
    ] = await Promise.all([
      supabase.from('matches').select('*').eq('auction_room_id', roomId).order('match_number'),
      supabase.from('match_performances').select('*').eq('auction_room_id', roomId),
      supabase.from('team_season_selections').select('*').eq('auction_room_id', roomId),
      supabase.from('auction_players').select('player_id, sold_to_team_id').eq('auction_room_id', roomId).eq('status', 'sold'),
    ])
    if (matchData)  setMatches(matchData)
    if (perfData)   setPerformances(perfData)
    if (selData)    setSelections(selData)
    if (apData) {
      const map = {}
      apData.forEach(ap => {
        if (!map[ap.sold_to_team_id]) map[ap.sold_to_team_id] = []
        map[ap.sold_to_team_id].push(ap.player_id)
      })
      setSquadMap(map)
    }
    setLoading(false)
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const completedMatches = useMemo(() =>
    matches.filter(m => m.status === 'completed'), [matches])

  // For a given team, build per-player aggregated data
  const teamData = useMemo(() => {
    if (!activeTeam) return null

    const teamPlayerIds = squadMap[activeTeam] || []
    const teamSelection = selections.find(s => s.team_id === activeTeam)
    const selectedIds   = teamSelection?.player_ids || []

    // Group performances by player: { [playerId]: { [matchId]: { total_points, counted_points } } }
    const perfByPlayer = {}
    performances
      .filter(p => p.team_id === activeTeam)
      .forEach(p => {
        if (!perfByPlayer[p.player_id]) perfByPlayer[p.player_id] = {}
        // Deduplicate: keep latest entry if somehow duplicated
        if (!perfByPlayer[p.player_id][p.match_id] ||
            perfByPlayer[p.player_id][p.match_id].id < p.id) {
          perfByPlayer[p.player_id][p.match_id] = {
            total_points:   p.total_points   || 0,
            counted_points: p.counted_points || 0,
          }
        }
      })

    // Build player rows
    const rows = teamPlayerIds.map(playerId => {
      const pData   = PLAYERS.find(p => p.id === playerId)
      const matchPts = perfByPlayer[playerId] || {}

      const totalRaw     = Object.values(matchPts).reduce((s, m) => s + m.total_points,   0)
      const totalCounted = Object.values(matchPts).reduce((s, m) => s + m.counted_points, 0)

      const isSelected = selectedIds.includes(playerId)

      // Per-match breakdown for completed matches
      const matchBreakdown = completedMatches.map(m => ({
        matchId:   m.id,
        matchName: m.name,
        matchNum:  m.match_number,
        raw:       matchPts[m.id]?.total_points   ?? null,
        counted:   matchPts[m.id]?.counted_points ?? null,
        played:    matchPts[m.id] !== undefined,
      }))

      return {
        playerId,
        name:       pData?.name       || playerId,
        role:       pData?.role        || 'AR',
        iplTeam:    pData?.ipl_team    || '',
        isForeign:  pData?.is_foreign  || false,
        totalRaw,
        totalCounted,
        isSelected,
        matchBreakdown,
      }
    })

    // Sort: selected first (by totalRaw desc), then unselected (by totalRaw desc)
    rows.sort((a, b) => {
      if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1
      return b.totalRaw - a.totalRaw
    })

    // Determine which players are "counted" (have any counted_points > 0 across matches)
    // These are players who made it into the top 11 for at least one match
    const teamTotal = rows.reduce((s, r) => s + r.totalCounted, 0)

    return { rows, selectedIds, teamTotal, hasSelection: selectedIds.length > 0 }
  }, [activeTeam, squadMap, selections, performances, completedMatches])

  const sortedTeams = useMemo(() =>
    [...teams].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)),
    [teams])

  if (loading) return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/30 font-mono animate-pulse">Loading results…</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-xl mx-auto w-full p-4 space-y-5">

        {/* Header */}
        <div className="flex items-end justify-between">
          <h1 className="font-display text-4xl text-gold">Results</h1>
          <div className="text-white/30 text-sm font-mono">
            {completedMatches.length} matches played
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gold/30 border border-gold/50" />
            <span className="text-white/50">Selected 15</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-400/50" />
            <span className="text-white/50">Points counted (Top 11)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-white/5 border border-white/10" />
            <span className="text-white/50">Not in selection / bench</span>
          </span>
        </div>

        {/* Team tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {sortedTeams.map((team, i) => (
            <button
              key={team.id}
              onClick={() => setActiveTeam(team.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                activeTeam === team.id
                  ? 'bg-gold/15 text-gold border-gold/40'
                  : 'border-bg-border text-white/40 hover:text-white hover:border-white/20'
              }`}
            >
              <span className="block">{team.name}</span>
              <span className="block text-xs font-mono opacity-60">{team.total_points || 0} pts</span>
            </button>
          ))}
        </div>

        {/* Active team panel */}
        {activeTeam && teamData && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTeam}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              {/* Team summary bar */}
              <div className="card p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-display text-2xl text-white">
                    {teams.find(t => t.id === activeTeam)?.name}
                  </div>
                  <div className="text-white/40 text-sm font-mono mt-0.5">
                    {teamData.rows.length} players · {teamData.rows.filter(r => r.isSelected).length} selected
                    {!teamData.hasSelection && <span className="text-amber-400/70 ml-2">⚠ No selection submitted</span>}
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="text-right">
                    <div className="text-xs text-white/30 font-mono">Raw Pts</div>
                    <div className="font-display text-3xl text-white/50">
                      {teamData.rows.reduce((s, r) => s + r.totalRaw, 0)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/30 font-mono">Counted Pts</div>
                    <div className="font-display text-3xl text-gold">
                      {teamData.teamTotal}
                    </div>
                  </div>
                </div>
              </div>

              {/* Match header row */}
              {completedMatches.length > 0 && (
                <div className="card overflow-hidden">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto] gap-0 px-4 py-2 border-b border-bg-border bg-bg-deep/50">
                    <div className="text-xs text-white/30 font-mono uppercase tracking-wider">Player</div>
                    <div className="hidden md:block text-xs text-white/30 font-mono uppercase tracking-wider text-right pr-6">Match Pts</div>
                    <div className="text-xs text-white/30 font-mono uppercase tracking-wider text-right">Total</div>
                  </div>

                  {/* Player rows */}
                  {teamData.rows.map((row, idx) => {
                    const isCounted = row.isSelected && row.totalCounted > 0
                    const isSelected = row.isSelected
                    const bgClass = isCounted
                      ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                      : isSelected
                        ? 'bg-gold/5 hover:bg-gold/8'
                        : 'hover:bg-bg-elevated/20'

                    const borderClass = isCounted
                      ? 'border-l-2 border-l-emerald-400/50'
                      : isSelected
                        ? 'border-l-2 border-l-gold/40'
                        : 'border-l-2 border-l-transparent'

                    return (
                      <motion.div
                        key={row.playerId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        className={`border-b border-bg-border/30 last:border-0 ${bgClass} ${borderClass}`}
                      >
                        {/* Main row */}
                        <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto] gap-0 px-4 py-3 items-center">
                          {/* Player info */}
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Status dot */}
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isCounted ? 'bg-emerald-400' : isSelected ? 'bg-gold/60' : 'bg-white/15'
                            }`} />

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-bold text-sm ${
                                  isCounted ? 'text-white' : isSelected ? 'text-white/80' : 'text-white/40'
                                }`}>
                                  {row.name}
                                </span>
                                {row.isForeign && (
                                  <span className="text-xs text-blue-400/70 font-mono">🌍</span>
                                )}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ROLE_COLORS[row.role] || ROLE_COLORS.AR}`}>
                                  {row.role}
                                </span>
                                {isSelected && !isCounted && (
                                  <span className="text-[10px] text-amber-400/60 font-mono">BENCH</span>
                                )}
                                {isCounted && (
                                  <span className="text-[10px] text-emerald-400/70 font-mono">✓ XI</span>
                                )}
                              </div>
                              <div className="text-xs text-white/25 font-mono mt-0.5">{row.iplTeam}</div>
                            </div>
                          </div>

                          {/* Per-match points chips - desktop */}
                          <div className="hidden md:flex items-center gap-1 justify-end flex-wrap pr-4 max-w-xs">
                            {completedMatches.slice(-8).map(m => {
                              const mp = row.matchBreakdown.find(b => b.matchId === m.id)
                              const raw     = mp?.raw     ?? null
                              const counted = mp?.counted ?? null
                              if (raw === null) return (
                                <span key={m.id} className="text-[10px] font-mono text-white/15 w-8 text-center">—</span>
                              )
                              const isCount = counted > 0
                              const isZeroed = raw > 0 && counted === 0
                              return (
                                <span
                                  key={m.id}
                                  title={`M${m.match_number}: ${m.name}\nRaw: ${raw} | Counted: ${counted}`}
                                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded min-w-[28px] text-center border ${
                                    isCount
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                      : isZeroed
                                        ? 'bg-amber-500/10 text-amber-400/50 border-amber-500/20'
                                        : raw < 0
                                          ? 'bg-red-500/15 text-red-400/70 border-red-500/20'
                                          : 'bg-white/5 text-white/40 border-white/10'
                                  }`}
                                >
                                  {isCount ? counted : raw}
                                </span>
                              )
                            })}
                          </div>

                          {/* Total */}
                          <div className="text-right">
                            <div className={`font-display text-2xl ${
                              isCounted ? 'text-emerald-300' : isSelected ? 'text-gold/60' : 'text-white/25'
                            }`}>
                              {isCounted ? row.totalCounted : row.totalRaw || 0}
                            </div>
                            {isCounted && row.totalRaw !== row.totalCounted && (
                              <div className="text-[10px] text-white/25 font-mono">
                                {row.totalRaw} raw
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Mobile match chips - toggled */}
                        {completedMatches.length > 0 && (
                          <div className="md:hidden px-4 pb-3 -mt-1">
                            <div className="flex flex-wrap gap-1">
                              {completedMatches.map(m => {
                                const mp = row.matchBreakdown.find(b => b.matchId === m.id)
                                const raw     = mp?.raw     ?? null
                                const counted = mp?.counted ?? null
                                if (raw === null) return null
                                const isCount  = counted > 0
                                const isZeroed = raw > 0 && counted === 0
                                return (
                                  <span
                                    key={m.id}
                                    title={`M${m.match_number}: ${raw} raw / ${counted} counted`}
                                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                      isCount
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                        : isZeroed
                                          ? 'bg-amber-500/10 text-amber-400/50 border-amber-500/20'
                                          : 'bg-white/5 text-white/35 border-white/10'
                                    }`}
                                  >
                                    M{m.match_number}: {isCount ? counted : raw}
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )
                  })}

                  {/* Team totals footer */}
                  <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto] gap-0 px-4 py-3 bg-bg-deep/80 border-t border-bg-border">
                    <div className="font-bold text-sm text-white/60">
                      TEAM TOTAL
                      <span className="ml-2 text-xs font-mono text-white/30">
                        ({teamData.rows.filter(r => r.isSelected).length}/15 selected · top 11 counted)
                      </span>
                    </div>
                    <div className="hidden md:block" />
                    <div className="text-right">
                      <div className="font-display text-3xl text-gold">{teamData.teamTotal}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Match breakdown table - full grid */}
              {completedMatches.length > 0 && (
                <details className="card overflow-hidden group">
                  <summary className="px-4 py-3 cursor-pointer flex items-center justify-between border-b border-bg-border/0 group-open:border-bg-border bg-bg-deep/30 hover:bg-bg-elevated/20 transition-colors select-none">
                    <span className="font-bold text-sm text-white/60">📊 Full Match-by-Match Breakdown</span>
                    <span className="text-white/30 text-xs font-mono group-open:rotate-180 transition-transform inline-block">▼</span>
                  </summary>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-bg-border bg-bg-deep/50">
                          <th className="text-left px-3 py-2 text-white/30 font-medium sticky left-0 bg-bg-deep/80 min-w-[140px]">Player</th>
                          {completedMatches.map(m => (
                            <th key={m.id} className="text-center px-2 py-2 text-white/30 font-medium min-w-[52px] whitespace-nowrap">
                              M{m.match_number}
                            </th>
                          ))}
                          <th className="text-right px-3 py-2 text-white/40 font-bold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamData.rows.map(row => {
                          const isCounted  = row.isSelected && row.totalCounted > 0
                          const isSelected = row.isSelected
                          return (
                            <tr
                              key={row.playerId}
                              className={`border-b border-bg-border/20 last:border-0 transition-colors ${
                                isCounted
                                  ? 'bg-emerald-500/5 hover:bg-emerald-500/8'
                                  : isSelected
                                    ? 'bg-gold/4 hover:bg-gold/6'
                                    : 'hover:bg-bg-elevated/10'
                              }`}
                            >
                              <td className={`px-3 py-2 sticky left-0 bg-inherit font-bold ${
                                isCounted ? 'text-emerald-300/90' : isSelected ? 'text-white/60' : 'text-white/30'
                              }`}>
                                {row.name}
                                {isCounted && <span className="ml-1 text-emerald-400/50">✓</span>}
                              </td>
                              {completedMatches.map(m => {
                                const mp      = row.matchBreakdown.find(b => b.matchId === m.id)
                                const raw     = mp?.raw     ?? null
                                const counted = mp?.counted ?? null
                                if (raw === null) return (
                                  <td key={m.id} className="text-center px-2 py-2 text-white/15">—</td>
                                )
                                const countedHere = counted > 0
                                const zeroed      = raw > 0 && counted === 0
                                return (
                                  <td
                                    key={m.id}
                                    className={`text-center px-2 py-2 ${
                                      countedHere
                                        ? 'text-emerald-300 font-bold'
                                        : zeroed
                                          ? 'text-amber-400/40'
                                          : raw < 0
                                            ? 'text-red-400/60'
                                            : 'text-white/35'
                                    }`}
                                    title={`Raw: ${raw} | Counted: ${counted}`}
                                  >
                                    {countedHere ? counted : raw}
                                    {zeroed && <span className="text-[8px] align-super text-amber-400/40">b</span>}
                                  </td>
                                )
                              })}
                              <td className={`text-right px-3 py-2 font-bold ${
                                isCounted ? 'text-emerald-300' : isSelected ? 'text-gold/50' : 'text-white/25'
                              }`}>
                                {isCounted ? row.totalCounted : (row.totalRaw || 0)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-bg-border bg-bg-deep/80">
                          <td className="px-3 py-2 font-bold text-white/50 sticky left-0 bg-bg-deep/80">TOTAL</td>
                          {completedMatches.map(m => {
                            const matchTotal = teamData.rows.reduce((sum, row) => {
                              const mp = row.matchBreakdown.find(b => b.matchId === m.id)
                              return sum + (mp?.counted || 0)
                            }, 0)
                            return (
                              <td key={m.id} className="text-center px-2 py-2 font-bold text-gold/70">
                                {matchTotal || '—'}
                              </td>
                            )
                          })}
                          <td className="text-right px-3 py-2 font-display text-2xl text-gold">
                            {teamData.teamTotal}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </details>
              )}

              {teamData.rows.length === 0 && (
                <div className="card p-12 text-center">
                  <div className="text-4xl mb-3">🏏</div>
                  <div className="text-white/30 font-mono">No players in this team yet</div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        )}

        {completedMatches.length === 0 && (
          <div className="card p-12 text-center">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="font-display text-2xl text-white/40 mb-2">No matches processed yet</h3>
            <p className="text-white/20 font-mono text-sm">Admin can add match scorecards from the Admin panel.</p>
          </div>
        )}

      </div>
    </div>
  )
}
