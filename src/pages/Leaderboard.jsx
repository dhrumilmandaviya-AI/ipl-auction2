import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import PLAYERS from '../data/players'
import { formatPrice } from '../utils/auction'
import ValueLeaderboard from '../components/ValueLeaderboard'
import WeeklyBreakdown from '../components/WeeklyBreakdown'

export default function Leaderboard() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, teams, loading, loadRoom } = useAuction()
  const [matches, setMatches] = useState([])
  const [performances, setPerformances] = useState([])
  const [selectedMatch, setSelectedMatch] = useState('all')
  const [tab, setTab] = useState('standings') // 'standings' | 'weekly' | 'value'
  const [soldPlayers, setSoldPlayers] = useState([])

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId)
  }, [roomId])

  useEffect(() => {
    loadMatchData()
  }, [roomId])

  async function loadMatchData() {
    const [{ data: matchData }, { data: perfData }, { data: soldData }] = await Promise.all([
      supabase.from('matches').select('*').eq('auction_room_id', roomId).order('created_at'),
      supabase.from('match_performances').select('*, team:teams(name)').eq('auction_room_id', roomId),
      supabase.from('auction_players').select('*').eq('auction_room_id', roomId).eq('status', 'sold'),
    ])
    if (matchData) setMatches(matchData)
    if (perfData) setPerformances(perfData)
    if (soldData) setSoldPlayers(soldData)
  }

  // Calculate team points per match
  const sortedTeams = [...teams].sort((a, b) => (b.total_points || 0) - (a.total_points || 0))

  // Top performers
  const filteredPerfs = selectedMatch === 'all'
    ? performances
    : performances.filter(p => p.match_id === selectedMatch)

  const topPerformers = filteredPerfs
    .filter(p => p.total_points > 0)
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 10)

  const topFlops = filteredPerfs
    .sort((a, b) => a.total_points - b.total_points)
    .slice(0, 5)

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-xl mx-auto w-full p-4 space-y-5">
        <h1 className="font-display text-4xl text-gold">Fantasy Points</h1>

        {/* Main tab switcher */}
        <div className="flex bg-bg-card border border-bg-border rounded-xl p-1">
          {[
            { id: 'standings', label: '🏆 Standings' },
            { id: 'weekly',    label: '📅 Weekly' },
            { id: 'value',     label: '💎 Value' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === t.id ? 'bg-gold text-black' : 'text-white/40 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'weekly' && (
          <WeeklyBreakdown teams={teams} matches={matches} performances={performances} />
        )}

        {tab === 'value' && (
          <ValueLeaderboard soldPlayers={soldPlayers} performances={performances} teams={teams} />
        )}

        {tab === 'standings' && <>

        {/* Match filter */}
        {matches.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedMatch('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex-shrink-0 transition-all ${selectedMatch === 'all' ? 'bg-gold text-black' : 'border border-bg-border text-white/40 hover:text-white'}`}
            >
              All Matches
            </button>
            {matches.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMatch(m.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold flex-shrink-0 transition-all whitespace-nowrap ${selectedMatch === m.id ? 'bg-gold text-black' : 'border border-bg-border text-white/40 hover:text-white'}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {/* Team standings */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-bg-border">
            <h2 className="font-bold text-lg">🏆 Team Standings</h2>
          </div>
          {sortedTeams.length === 0 && (
            <div className="p-12 text-center text-white/30 font-mono">
              No matches processed yet. Admin can add match scorecards in the Admin panel.
            </div>
          )}
          {sortedTeams.map((team, i) => {
            const isFirst = i === 0
            return (
              <motion.div
                key={team.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-center gap-4 px-6 py-4 border-b border-bg-border/40 last:border-0 transition-colors hover:bg-bg-elevated/20 ${isFirst ? 'bg-gold/5' : ''}`}
              >
                <div className="w-8 text-center font-display text-2xl">
                  {medals[i] || <span className="text-white/30 text-lg font-mono">{i + 1}</span>}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-lg">{team.name}</div>
                  <div className="flex gap-3 text-xs font-mono text-white/40 mt-0.5">
                    <span>{team.player_count} players</span>
                    <span>{formatPrice(team.purse_remaining)} left</span>
                    <span>{team.lifelines} lifelines</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-display text-4xl ${isFirst ? 'text-gold' : 'text-white'}`}>
                    {team.total_points || 0}
                  </div>
                  <div className="text-xs text-white/30 font-mono">pts</div>
                </div>
                {/* Points bar */}
                {sortedTeams[0]?.total_points > 0 && (
                  <div className="hidden md:block w-32">
                    <div className="h-2 bg-bg-deep rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{ width: `${Math.round(((team.total_points || 0) / (sortedTeams[0]?.total_points || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>

        {/* Top performers */}
        {topPerformers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="font-bold mb-4">⭐ Top Performers</h2>
              <div className="space-y-2">
                {topPerformers.map((perf, i) => {
                  const player = PLAYERS.find(p => p.id === perf.player_id)
                  return (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-bg-border/40 last:border-0">
                      <span className="text-white/30 font-mono text-xs w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{player?.name || perf.player_id}</div>
                        <div className="text-xs text-white/40 font-mono">{perf.team?.name}</div>
                      </div>
                      <div className="font-display text-2xl text-gold">{perf.total_points}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {topFlops.length > 0 && topFlops[0].total_points < 0 && (
              <div className="card p-4">
                <h2 className="font-bold mb-4">💀 Top Flops</h2>
                <div className="space-y-2">
                  {topFlops.map((perf, i) => {
                    const player = PLAYERS.find(p => p.id === perf.player_id)
                    return (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-bg-border/40 last:border-0">
                        <span className="text-white/30 font-mono text-xs w-5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{player?.name || perf.player_id}</div>
                          <div className="text-xs text-white/40 font-mono">{perf.team?.name}</div>
                        </div>
                        <div className="font-display text-2xl text-danger">{perf.total_points}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {matches.length === 0 && performances.length === 0 && (
          <div className="card p-12 text-center">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="font-display text-2xl text-white/40 mb-2">No matches yet</h3>
            <p className="text-white/20 font-mono text-sm">
              Admin can process scorecard data from the Admin panel once IPL matches begin.
            </p>
          </div>
        )}

        </>}
      </div>
    </div>
  )
}
