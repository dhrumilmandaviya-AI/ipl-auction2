import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { callClaudeWithSearch, extractText } from '../lib/claude'
import PLAYERS from '../data/players'
import { formatPrice } from '../utils/auction'

export default function SeasonEnd() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, teams, loadRoom } = useAuction()

  const [view, setView] = useState('trophy')          // 'trophy' | teamId
  const [allSquads, setAllSquads] = useState({})
  const [performances, setPerformances] = useState([])
  const [matches, setMatches] = useState([])
  const [narratives, setNarratives] = useState({})    // teamId -> string
  const [loadingNarrative, setLoadingNarrative] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId).then(() => loadData())
  }, [roomId])

  async function loadData() {
    const [{ data: squadData }, { data: perfData }, { data: matchData }] = await Promise.all([
      supabase.from('auction_players').select('*, players(*)').eq('auction_room_id', roomId).eq('status', 'sold'),
      supabase.from('match_performances').select('*').eq('auction_room_id', roomId),
      supabase.from('matches').select('*').eq('auction_room_id', roomId).eq('status', 'completed').order('match_number'),
    ])
    if (squadData) {
      const grouped = {}
      for (const ap of squadData) {
        const tid = ap.sold_to_team_id
        if (!grouped[tid]) grouped[tid] = []
        grouped[tid].push({ ...ap, playerData: PLAYERS.find(p => p.id === ap.player_id) || ap.players })
      }
      setAllSquads(grouped)
    }
    if (perfData) setPerformances(perfData)
    if (matchData) setMatches(matchData)
    setLoaded(true)
  }

  async function generateNarrative(team) {
    if (narratives[team.id]) { setView(team.id); return }
    setLoadingNarrative(team.id)
    try {
      const squad = allSquads[team.id] || []
      const teamPerfs = performances.filter(p => p.team_id === team.id)
      const totalPts = team.total_points || 0
      const spent = squad.reduce((s, ap) => s + (ap.final_price || 0), 0)
      const sortedTeams = [...teams].sort((a, b) => (b.total_points || 0) - (a.total_points || 0))
      const rank = sortedTeams.findIndex(t => t.id === team.id) + 1

      // Top scorer in squad
      const topScorer = teamPerfs.sort((a, b) => b.total_points - a.total_points)[0]
      const topScorerName = PLAYERS.find(p => p.id === topScorer?.player_id)?.name || 'N/A'
      const biggestBuy = squad.sort((a, b) => (b.final_price || 0) - (a.final_price || 0))[0]
      const bestValue = squad
        .map(ap => ({
          ...ap,
          pts: teamPerfs.filter(p => p.player_id === ap.player_id).reduce((s, p) => s + p.total_points, 0),
          ppc: teamPerfs.filter(p => p.player_id === ap.player_id).reduce((s, p) => s + p.total_points, 0) / ((ap.final_price || 20) / 100)
        }))
        .sort((a, b) => b.ppc - a.ppc)[0]

      const prompt = `You are writing a fun, punchy end-of-season fantasy cricket review for a group of friends.

Team: "${team.name}"
Season rank: ${rank} out of ${teams.length}
Total fantasy points: ${totalPts}
Total spend: ${formatPrice(spent)} out of ₹100Cr
Players bought: ${squad.length}
Purse remaining (wasted!): ${formatPrice(team.purse_remaining)}
Top scorer: ${topScorerName} (${topScorer?.total_points || 0} pts)
Biggest buy: ${biggestBuy?.playerData?.name || 'N/A'} for ${formatPrice(biggestBuy?.final_price)}
Best value pick: ${bestValue?.playerData?.name || 'N/A'} (${Math.round(bestValue?.ppc || 0)} pts/Cr)
Matches played: ${matches.length}

Write a 3-4 paragraph narrative review of this team's season. Be creative, funny, use cricket/IPL references.
${rank === 1 ? 'They WON — write a triumphant champion story.' : ''}
${rank === teams.length ? 'They came LAST — roast them lovingly but be kind.' : ''}
Include: their auction strategy, their best moment, their worst moment (if any), a verdict on their season.
Write in second person ("Your team..."). Keep it under 200 words. No markdown, just plain paragraphs.`

      const data = await callClaudeWithSearch([{ role: 'user', content: prompt }], 600)
      const narrative = extractText(data)
      setNarratives(prev => ({ ...prev, [team.id]: narrative }))
    } catch (err) {
      setNarratives(prev => ({ ...prev, [team.id]: 'Could not generate narrative. Check your Supabase Edge Function.' }))
    } finally {
      setLoadingNarrative(null)
      setView(team.id)
    }
  }

  const sortedTeams = [...teams].sort((a, b) => (b.total_points || 0) - (a.total_points || 0))
  const winner = sortedTeams[0]
  const lastPlace = sortedTeams[sortedTeams.length - 1]

  // Season-wide stats
  const allPerfs = performances
  const topPlayerOverall = [...allPerfs].sort((a, b) => b.total_points - a.total_points)[0]
  const topPlayerName = PLAYERS.find(p => p.id === topPlayerOverall?.player_id)?.name
  const topPlayerTeam = teams.find(t => t.id === topPlayerOverall?.team_id)?.name

  const biggestSingleGame = [...allPerfs].sort((a, b) => b.total_points - a.total_points)[0]

  // Confetti for winner
  useEffect(() => {
    if (loaded && view === 'trophy') {
      setTimeout(() => {
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.3 }, colors: ['#f59e0b', '#fbbf24', '#10b981', '#3b82f6'] })
      }, 400)
    }
  }, [loaded, view])

  const selectedTeam = teams.find(t => t.id === view)
  const teamSquad = allSquads[view] || []
  const teamPerfs = performances.filter(p => p.team_id === view)

  const ROLE_CLASS = { BAT: 'role-badge-bat', BWL: 'role-badge-bwl', AR: 'role-badge-ar', WK: 'role-badge-wk' }
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-xl mx-auto w-full p-4 space-y-6">

        {/* Page header */}
        <div className="text-center pt-4">
          <div className="font-display text-6xl text-gold tracking-wider">IPL 2026</div>
          <div className="font-display text-3xl text-white/60 tracking-widest">SEASON REPORT</div>
        </div>

        {/* Team selector */}
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={() => { setView('trophy'); setTimeout(() => confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } }), 100) }}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${view === 'trophy' ? 'bg-gold text-black' : 'border border-bg-border text-white/50 hover:text-white'}`}
          >
            🏆 Season Summary
          </button>
          {sortedTeams.map((team, i) => (
            <button
              key={team.id}
              onClick={() => generateNarrative(team)}
              disabled={loadingNarrative === team.id}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                view === team.id ? 'bg-gold text-black' : 'border border-bg-border text-white/50 hover:text-white'
              }`}
            >
              {loadingNarrative === team.id
                ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Writing...</span>
                : `${medals[i] || i+1+'.'} ${team.name}`}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── TROPHY / SEASON OVERVIEW ── */}
          {view === 'trophy' && (
            <motion.div key="trophy" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

              {/* Champion banner */}
              {winner && (
                <div className="relative card p-8 text-center overflow-hidden border-gold/40" style={{ background: 'radial-gradient(ellipse at center, rgba(245,158,11,0.12) 0%, transparent 70%)' }}>
                  <div className="absolute inset-0 pointer-events-none" style={{ background: 'repeating-linear-gradient(45deg, rgba(245,158,11,0.03) 0px, rgba(245,158,11,0.03) 1px, transparent 1px, transparent 20px)' }} />
                  <div className="text-7xl mb-3">🏆</div>
                  <div className="font-mono text-xs text-gold/50 tracking-widest uppercase mb-2">IPL 2026 Fantasy Champion</div>
                  <div className="font-display text-6xl text-gold mb-2">{winner.name}</div>
                  <div className="font-display text-4xl text-white/70">{winner.total_points || 0} <span className="text-white/30 text-2xl">points</span></div>
                  <div className="mt-4 flex items-center justify-center gap-6 text-sm font-mono text-white/40">
                    <span>{winner.player_count} players bought</span>
                    <span>·</span>
                    <span>{formatPrice(winner.purse_remaining)} purse remaining</span>
                    <span>·</span>
                    <span>{winner.lifelines}/3 lifelines unused</span>
                  </div>
                </div>
              )}

              {/* Full standings */}
              <div className="card overflow-hidden">
                <div className="px-5 py-3 bg-bg-elevated border-b border-bg-border font-bold text-sm">Final Standings</div>
                {sortedTeams.map((team, i) => {
                  const pct = winner?.total_points ? Math.round(((team.total_points || 0) / winner.total_points) * 100) : 0
                  return (
                    <motion.div
                      key={team.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07 }}
                      className={`flex items-center gap-4 px-5 py-4 border-b border-bg-border/40 last:border-0 hover:bg-bg-elevated/20 cursor-pointer transition-colors ${i === 0 ? 'bg-gold/5' : ''}`}
                      onClick={() => generateNarrative(team)}
                    >
                      <div className="w-8 text-center font-display text-2xl">{medals[i] || <span className="text-white/30 text-lg font-mono">{i+1}</span>}</div>
                      <div className="flex-1">
                        <div className="font-bold">{team.name}</div>
                        <div className="text-xs font-mono text-white/30 mt-0.5">{team.player_count}p · {formatPrice(team.purse_remaining)} left · spent {formatPrice(10000 - team.purse_remaining)}</div>
                      </div>
                      <div className="hidden md:block w-32">
                        <div className="h-2 bg-bg-deep rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: i * 0.07 }} className="h-full rounded-full bg-gold" />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-3xl text-gold">{team.total_points || 0}</div>
                        <div className="text-xs text-white/30 font-mono">pts</div>
                      </div>
                      <div className="text-white/20 text-sm">→</div>
                    </motion.div>
                  )
                })}
              </div>

              {/* Season stat boxes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total Matches', value: matches.length, emoji: '🏏' },
                  { label: 'Champion', value: winner?.name?.split(' ')[0] || '—', emoji: '🥇' },
                  { label: 'Season MVP', value: topPlayerName || '—', sub: topPlayerTeam, emoji: '⭐' },
                  { label: 'Wooden Spoon', value: lastPlace?.name?.split(' ')[0] || '—', emoji: '🥄' },
                ].map(stat => (
                  <div key={stat.label} className="card p-4 text-center">
                    <div className="text-2xl mb-1">{stat.emoji}</div>
                    <div className="text-xs text-white/30 font-mono uppercase tracking-wider mb-1">{stat.label}</div>
                    <div className="font-bold text-sm">{stat.value}</div>
                    {stat.sub && <div className="text-xs text-white/30 font-mono mt-0.5">{stat.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Best + worst value across all teams */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card p-4">
                  <div className="font-bold mb-3 text-sm">💎 Season's Best Value Picks</div>
                  {teams.flatMap(t => (allSquads[t.id] || []).map(ap => {
                    const pts = performances.filter(p => p.player_id === ap.player_id && p.team_id === t.id).reduce((s, p) => s + p.total_points, 0)
                    return { ...ap, team: t, pts, ppc: pts / ((ap.final_price || 20) / 100) }
                  })).sort((a, b) => b.ppc - a.ppc).slice(0, 4).map((ap, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-bg-border/40 last:border-0 text-sm">
                      <div>
                        <div className="font-bold">{ap.playerData?.name}</div>
                        <div className="text-xs text-white/30 font-mono">{ap.team?.name} · {formatPrice(ap.final_price)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-xl text-sold">{Math.round(ap.ppc)}<span className="text-xs text-white/30 font-mono ml-1">pts/Cr</span></div>
                        <div className="text-xs text-white/30 font-mono">{ap.pts} total</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card p-4">
                  <div className="font-bold mb-3 text-sm">💸 Season's Biggest Flops</div>
                  {teams.flatMap(t => (allSquads[t.id] || []).filter(ap => (ap.final_price || 0) >= 200).map(ap => {
                    const pts = performances.filter(p => p.player_id === ap.player_id && p.team_id === t.id).reduce((s, p) => s + p.total_points, 0)
                    return { ...ap, team: t, pts, ppc: pts / ((ap.final_price || 20) / 100) }
                  })).sort((a, b) => a.ppc - b.ppc).slice(0, 4).map((ap, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-bg-border/40 last:border-0 text-sm">
                      <div>
                        <div className="font-bold">{ap.playerData?.name}</div>
                        <div className="text-xs text-white/30 font-mono">{ap.team?.name} · {formatPrice(ap.final_price)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-xl text-danger">{Math.round(ap.ppc)}<span className="text-xs text-white/30 font-mono ml-1">pts/Cr</span></div>
                        <div className="text-xs text-white/30 font-mono">{ap.pts} total</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── INDIVIDUAL TEAM REPORT ── */}
          {selectedTeam && view !== 'trophy' && (
            <motion.div key={view} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

              {/* Team header */}
              {(() => {
                const rank = sortedTeams.findIndex(t => t.id === view) + 1
                const spent = teamSquad.reduce((s, ap) => s + (ap.final_price || 0), 0)
                const topPerf = [...teamPerfs].sort((a, b) => b.total_points - a.total_points)[0]
                const topPerfPlayer = PLAYERS.find(p => p.id === topPerf?.player_id)
                const bestValue = teamSquad.map(ap => ({
                  ...ap,
                  pts: teamPerfs.filter(p => p.player_id === ap.player_id).reduce((s, p) => s + p.total_points, 0),
                  ppc: teamPerfs.filter(p => p.player_id === ap.player_id).reduce((s, p) => s + p.total_points, 0) / ((ap.final_price || 20) / 100)
                })).sort((a, b) => b.ppc - a.ppc)[0]

                return (
                  <>
                    {/* Banner */}
                    <div className={`card p-6 text-center ${rank === 1 ? 'border-gold/50' : ''}`}
                      style={rank === 1 ? { background: 'radial-gradient(ellipse at center, rgba(245,158,11,.1) 0%, transparent 70%)' } : {}}>
                      <div className="text-5xl mb-2">{medals[rank-1] || '🏏'}</div>
                      <div className="font-display text-5xl text-gold mb-1">{selectedTeam.name}</div>
                      <div className="text-white/40 font-mono text-sm">Rank #{rank} of {teams.length} · {selectedTeam.total_points || 0} points</div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Fantasy Points', value: selectedTeam.total_points || 0, color: 'text-gold', big: true },
                        { label: 'Total Spent', value: formatPrice(spent), color: 'text-white' },
                        { label: 'Purse Wasted', value: formatPrice(selectedTeam.purse_remaining), color: selectedTeam.purse_remaining > 500 ? 'text-danger' : 'text-white/60' },
                        { label: 'Final Rank', value: `#${rank}`, color: rank <= 2 ? 'text-gold' : 'text-white' },
                        { label: 'Top Scorer', value: topPerfPlayer?.name || '—', sub: `${topPerf?.total_points || 0} pts`, color: 'text-white' },
                        { label: 'Best Value', value: bestValue?.playerData?.name || '—', sub: `${Math.round(bestValue?.ppc || 0)} pts/Cr`, color: 'text-sold' },
                        { label: 'Players Bought', value: `${selectedTeam.player_count}/17`, color: 'text-white' },
                        { label: 'Overseas', value: `${selectedTeam.foreign_count}/7`, color: 'text-white' },
                      ].map(s => (
                        <div key={s.label} className="card p-3 text-center">
                          <div className="text-xs text-white/30 font-mono uppercase tracking-wider mb-1">{s.label}</div>
                          <div className={`font-bold ${s.big ? 'font-display text-3xl' : 'text-sm'} ${s.color}`}>{s.value}</div>
                          {s.sub && <div className="text-xs text-white/30 font-mono">{s.sub}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Claude narrative */}
                    <div className="card p-5 border-gold/20" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.04), transparent)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-gold text-lg">🤖</span>
                        <span className="font-bold text-sm text-gold">Season Verdict</span>
                        <span className="text-xs text-white/20 font-mono">by Claude</span>
                      </div>
                      {narratives[view]
                        ? <p className="text-white/75 leading-relaxed text-sm font-body">{narratives[view]}</p>
                        : <div className="text-white/30 font-mono text-sm animate-pulse">Generating your season story...</div>
                      }
                    </div>

                    {/* Squad breakdown */}
                    <div className="card overflow-hidden">
                      <div className="px-5 py-3 bg-bg-elevated border-b border-bg-border font-bold text-sm">Full Squad — Season Performance</div>
                      {teamSquad.sort((a, b) => {
                        const apts = teamPerfs.filter(p => p.player_id === a.player_id).reduce((s, p) => s + p.total_points, 0)
                        const bpts = teamPerfs.filter(p => p.player_id === b.player_id).reduce((s, p) => s + p.total_points, 0)
                        return bpts - apts
                      }).map((ap, i) => {
                        const p = ap.playerData
                        const pts = teamPerfs.filter(pf => pf.player_id === ap.player_id).reduce((s, pf) => s + pf.total_points, 0)
                        const ppc = pts / ((ap.final_price || 20) / 100)
                        const isTop = i === 0
                        return (
                          <div key={ap.id} className={`flex items-center gap-3 px-5 py-3 border-b border-bg-border/40 last:border-0 ${isTop ? 'bg-gold/5' : 'hover:bg-bg-elevated/20'} transition-colors`}>
                            <div className="w-6 text-center text-white/20 font-mono text-xs">{i+1}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">{p?.name}</span>
                                {p?.is_foreign && <span className="text-xs">🌍</span>}
                                {isTop && <span className="text-xs text-gold border border-gold/30 px-1.5 py-0.5 rounded">MVP</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`${ROLE_CLASS[p?.role]} text-xs`} style={{ fontSize: '9px', padding: '1px 5px' }}>{p?.role}</span>
                                <span className="text-xs text-white/25 font-mono">{p?.team}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-xs text-white/30">{formatPrice(ap.final_price)}</div>
                              <div className="text-xs text-white/20 font-mono">{Math.round(ppc)} pts/Cr</div>
                            </div>
                            <div className="text-right w-16">
                              <div className={`font-display text-2xl ${pts > 100 ? 'text-gold' : pts > 50 ? 'text-sold' : pts < 0 ? 'text-danger' : 'text-white/50'}`}>
                                {pts > 0 ? `+${pts}` : pts || '—'}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
