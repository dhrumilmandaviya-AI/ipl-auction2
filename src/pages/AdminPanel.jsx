import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import PLAYERS from '../data/players'
import { formatPrice } from '../utils/auction'
import { supabase } from '../lib/supabase'
import { callClaudeWithSearch, extractText, parseJSON } from '../lib/claude'
import toast from 'react-hot-toast'

export default function AdminPanel() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const {
    user, isAdmin, room, loading, loadRoom,
    teams, pendingPlayers, soldPlayers,
    currentPlayer, markSold, markUnsold, nextPlayer,
    startAuction, closeAuction, refreshTeams, refreshAllPlayers,
  } = useAuction()

  const [search, setSearch] = useState('')
  const [matchInput, setMatchInput] = useState('')
  const [processingPoints, setProcessingPoints] = useState(false)
  const [syncingData, setSyncingData] = useState(null)
  const [syncStatus, setSyncStatus] = useState('')
  const [updatingScores, setUpdatingScores] = useState(false)
  const [openingTransfers, setOpeningTransfers] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId)
  }, [roomId])

  useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error('Admin access required')
      navigate(`/room/${roomId}`)
    }
  }, [loading, isAdmin])

  const adminCode = room ? `ADMIN_${room.code.slice(-4)}` : '...'

  async function processPoints() {
    if (!matchInput.trim()) return toast.error('Enter a match name to search for')
    setProcessingPoints(true)
    try {
      const soldPlayerIds = soldPlayers.map(ap => ap.player_id)
      const playerNames = PLAYERS.filter(p => soldPlayerIds.includes(p.id)).map(p => p.name)
      const { buildScorecardPrompt, calculateTotalPoints } = await import('../utils/points')

      // Route through Supabase Edge Function proxy — API key never touches the browser
      const data = await callClaudeWithSearch([{
        role: 'user',
        content: `Search for the full scorecard of this IPL match: "${matchInput.trim()}"
Use web search to find the complete scorecard from Cricbuzz, ESPNcricinfo, or any cricket stats site.
Once you have it, extract performance data for these specific players only:
${playerNames.join(', ')}
${buildScorecardPrompt('[fetched from web search]', playerNames).split('\n').slice(4).join('\n')}`,
      }])

      const text = extractText(data)
      if (!text) throw new Error('Claude returned no text — try a more specific match name')

      let performances
      try { performances = parseJSON(text) }
      catch { throw new Error('Could not parse scorecard. Try: "MI vs CSK IPL 2026 Match 14 scorecard"') }
      if (!performances.length) throw new Error('No player data found. Match may not have been played yet.')

      const { data: match, error: mErr } = await supabase
        .from('matches')
        .upsert({ auction_room_id: roomId, name: matchInput.trim(), status: 'completed', is_today: false })
        .select().single()
      if (mErr) throw mErr

      // Process each player's performance
      let processed = 0
      for (const perf of performances) {
        const player = PLAYERS.find(p =>
          p.name.toLowerCase() === perf.player_name?.toLowerCase() ||
          perf.player_name?.toLowerCase().includes(p.name.split(' ').pop().toLowerCase())
        )
        if (!player) continue
        const auctionPlayer = soldPlayers.find(ap => ap.player_id === player.id)
        if (!auctionPlayer) continue

        const totalPts = calculateTotalPoints(perf)

        await supabase.from('match_performances').upsert({
          match_id: match.id,
          auction_room_id: roomId,
          player_id: player.id,
          team_id: auctionPlayer.sold_to_team_id,
          batting: perf.batting || null,
          bowling: perf.bowling || null,
          fielding: perf.fielding || null,
          did_not_play: perf.did_not_play || false,
          total_points: totalPts,
        })

        await supabase.rpc('update_team_points', {
          p_team_id: auctionPlayer.sold_to_team_id,
          p_room_id: roomId,
        })
        processed++
      }

      toast.success(`✅ Points processed for ${processed} players from ${matchInput.trim()}!`)
      setMatchInput('')
    } catch (err) {
      toast.error(err.message || 'Failed to fetch or process match')
    } finally {
      setProcessingPoints(false)
    }
  }

  /** Sync IPL 2026 player team assignments */
  async function syncPlayers() {
    setSyncingData('players')
    setSyncStatus('🔍 Fetching IPL 2026 team rosters...')
    try {
      const playerNames = PLAYERS.map(p => p.name).join(', ')
      const data = await callClaudeWithSearch([{
        role: 'user',
        content: `Search for IPL 2026 team squads. For each player below find their IPL 2026 team.

Players: ${playerNames}

CRITICAL: Respond with ONLY a raw JSON array. No explanation, no markdown, no code fences, nothing else before or after the array.

Format exactly like this:
[{"id":"p001","team_2026":"RCB"},{"id":"p002","team_2026":"MI"}]

Team codes: MI CSK RCB KKR DC SRH RR PBKS LSG GT
Cover every player. If not in IPL 2026 use their last known team.`
      }], 2000)

      setSyncStatus('📝 Saving player teams...')
      const text = extractText(data)
      const updates = parseJSON(text)

      for (const u of updates) {
        if (u.id && u.team_2026) {
          await supabase.from('players').update({ team: u.team_2026 }).eq('id', u.id)
        }
      }

      setSyncStatus('')
      toast.success(`✅ Updated ${updates.length} player teams!`)
    } catch (err) {
      toast.error(err.message || 'Player sync failed')
      setSyncStatus('')
    } finally {
      setSyncingData(false)
    }
  }

  /** Sync IPL 2026 match schedule */
  async function syncSchedule() {
    setSyncingData('schedule')
    setSyncStatus('📅 Fetching IPL 2026 schedule...')
    try {
      const data = await callClaudeWithSearch([{
        role: 'user',
        content: `Search for the IPL 2026 cricket match schedule / fixtures.

Return ONLY a JSON array, no markdown, no backticks:
[{"match_number": 1, "team1": "CSK", "team2": "MI", "match_date": "2026-03-22"}]

Use team codes: MI, CSK, RCB, KKR, DC, SRH, RR, PBKS, LSG, GT
Include as many confirmed matches as possible.`
      }], 2000)

      setSyncStatus('📥 Saving schedule...')
      const text = extractText(data)
      const matches = parseJSON(text)

      const rows = matches.map(m => ({
        auction_room_id: roomId,
        name: `${m.team1} vs ${m.team2}`,
        match_number: m.match_number,
        team1: m.team1,
        team2: m.team2,
        match_date: m.match_date || null,
        status: 'upcoming',
        is_today: false,
      }))

      for (let i = 0; i < rows.length; i += 20) {
        await supabase.from('matches')
          .upsert(rows.slice(i, i + 20), { onConflict: 'auction_room_id,name' })
      }

      setSyncStatus('')
      toast.success(`✅ Saved ${matches.length} matches!`)
    } catch (err) {
      toast.error(err.message || 'Schedule sync failed')
      setSyncStatus('')
    } finally {
      setSyncingData(false)
    }
  }

  /** Auto-detect today's IPL matches and update points */
  async function updateTodayScores() {
    setUpdatingScores(true)
    try {
      const soldPlayerNames = PLAYERS
        .filter(p => soldPlayers.some(ap => ap.player_id === p.id))
        .map(p => p.name)

      if (!soldPlayerNames.length) {
        toast.error('No sold players found')
        setUpdatingScores(false)
        return
      }

      const { buildScorecardPrompt } = await import('../utils/points')
      const { calculateTotalPoints } = await import('../utils/points')

      const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      const res = await callClaudeWithSearch([{
        role: 'user',
        content: `Search for any IPL 2026 cricket matches that were played today (${today}) or yesterday.
        
Find the complete scorecard(s) and extract performance data for these players only:
${soldPlayerNames.join(', ')}

${buildScorecardPrompt('[fetched from web]', soldPlayerNames).split('\n').slice(4).join('\n')}

IMPORTANT: If multiple matches were played, include all of them. For each match, use this wrapper format:
{"match_name": "MI vs CSK", "performances": [...array of player performances...]}`
      }], 6000)

      const text = extractText(res)

      // Try to parse as array of matches or single match
      let matchData = []
      try {
        const parsed = parseJSON(text)
        matchData = Array.isArray(parsed) && parsed[0]?.match_name ? parsed : [{ match_name: matchInput || 'Today\'s Match', performances: parsed }]
      } catch {
        throw new Error('Could not parse today\'s scores. Matches may not have been played yet.')
      }

      let totalProcessed = 0
      for (const md of matchData) {
        const { data: match } = await supabase
          .from('matches')
          .upsert({
            auction_room_id: roomId,
            name: md.match_name,
            status: 'completed',
            is_today: false,
          })
          .select()
          .single()

        if (!match) continue

        for (const perf of (md.performances || [])) {
          const player = PLAYERS.find(p =>
            p.name.toLowerCase() === perf.player_name?.toLowerCase() ||
            perf.player_name?.toLowerCase().includes(p.name.split(' ').pop().toLowerCase())
          )
          if (!player) continue
          const auctionPlayer = soldPlayers.find(ap => ap.player_id === player.id)
          if (!auctionPlayer) continue

          await supabase.from('match_performances').upsert({
            match_id: match.id,
            auction_room_id: roomId,
            player_id: player.id,
            team_id: auctionPlayer.sold_to_team_id,
            batting: perf.batting || null,
            bowling: perf.bowling || null,
            fielding: perf.fielding || null,
            did_not_play: perf.did_not_play || false,
            total_points: calculateTotalPoints(perf),
          })

          await supabase.rpc('update_team_points', {
            p_team_id: auctionPlayer.sold_to_team_id,
            p_room_id: roomId,
          })
          totalProcessed++
        }
      }

      toast.success(`✅ Updated scores for ${totalProcessed} players across ${matchData.length} match(es)!`)
    } catch (err) {
      toast.error(err.message || 'Failed to update today\'s scores')
    } finally {
      setUpdatingScores(false)
    }
  }

  /** Toggle transfer window open/closed */
  async function toggleTransferWindow() {
    setOpeningTransfers(true)
    const newState = !room?.transfer_window_open
    const { error } = await supabase
      .from('auction_rooms')
      .update({ transfer_window_open: newState })
      .eq('id', roomId)
    if (error) toast.error(error.message)
    else toast.success(newState ? '🔄 Transfer window opened!' : '🔒 Transfer window closed')
    setOpeningTransfers(false)
    loadRoom(roomId)
  }

  /** Check if all teams meet minimum squad requirements */
  const squadWarnings = teams.filter(t => t.player_count < 14 && t.player_count > 0)

  const filtered = pendingPlayers.filter(ap => {
    const p = PLAYERS.find(pl => pl.id === ap.player_id)
    return !search || p?.name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-xl mx-auto w-full p-4 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-4xl text-gold">Admin Panel</h1>
            <p className="text-white/40 font-mono text-sm">
              Room code: <span className="text-gold font-bold">{room?.code}</span>
              &nbsp;· Admin code: <span className="text-yellow-400 font-bold">{adminCode}</span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {room?.status === 'waiting' && (
              <button onClick={startAuction} className="btn-sold">Start Auction ⚡</button>
            )}
            {room?.status === 'active' && (
              <button onClick={closeAuction} className="btn-danger">Close Auction</button>
            )}
            {room?.status === 'closed' && (
              <button
                onClick={async () => {
                  await supabase.rpc('open_reauction', { p_room_id: roomId })
                  toast.success('Re-auction opened — unsold players at ₹10L base')
                  loadRoom(roomId)
                }}
                className="btn-ghost"
              >
                🔄 Open Re-auction (Unsold Players)
              </button>
            )}
            <button
              onClick={toggleTransferWindow}
              disabled={openingTransfers}
              className={room?.transfer_window_open ? 'btn-danger' : 'btn-gold'}
            >
              {room?.transfer_window_open ? '🔒 Close Transfers' : '🔄 Open Transfer Window'}
            </button>
          </div>
        </div>

        {/* Squad warnings */}
        {squadWarnings.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-sm text-yellow-400 font-mono">
            ⚠️ Teams below minimum 14 players: {squadWarnings.map(t => `${t.name} (${t.player_count})`).join(', ')}
          </div>
        )}

        {/* Current player controls */}
        {currentPlayer && (
          <div className="card p-4 border-gold/30">
            <h2 className="font-bold text-gold mb-3">🔨 Current: {currentPlayer.players?.name}</h2>
            <div className="flex items-center gap-4">
              <div className="font-display text-3xl text-gold">{formatPrice(currentPlayer.current_bid)}</div>
              {currentPlayer.current_bid > 0 && teams.find(t => t.id === currentPlayer.current_bidder_team_id) && (
                <div className="text-white/60">→ {teams.find(t => t.id === currentPlayer.current_bidder_team_id)?.name}</div>
              )}
              <div className="flex-1" />
              <button onClick={markSold} disabled={!currentPlayer.current_bid} className="btn-sold">
                🔨 SOLD
              </button>
              <button onClick={markUnsold} className="btn-ghost">
                Pass / Unsold
              </button>
            </div>
          </div>
        )}

        {/* Pending players grid */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">Player Queue ({pendingPlayers.length})</h2>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="bg-bg-deep border border-bg-border rounded px-3 py-1.5 text-sm focus:border-gold/40 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
            {filtered.map(ap => {
              const p = PLAYERS.find(pl => pl.id === ap.player_id)
              if (!p) return null
              const isActive = currentPlayer?.player_id === ap.player_id
              return (
                <button
                  key={ap.id}
                  onClick={() => nextPlayer(ap.id)}
                  disabled={isActive}
                  className={`text-left p-2 rounded-lg border transition-all text-sm ${
                    isActive
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-bg-border hover:border-gold/30 hover:bg-bg-elevated'
                  }`}
                >
                  <div className="font-bold truncate">{p.name}</div>
                  <div className="text-xs text-white/40 font-mono">{p.role} · {p.team}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Sync Players & Schedule — one-time season setup */}
        <div className="card p-4 space-y-3">
          <h2 className="font-bold">🌐 Season Setup (run once)</h2>
          <p className="text-xs text-white/40 font-mono">
            Click each button once at season start. Do Players first, then Schedule.
          </p>
          {syncStatus && (
            <div className="bg-gold/5 border border-gold/20 rounded-lg p-2 font-mono text-xs text-gold/80 animate-pulse">
              {syncStatus}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={syncPlayers}
              disabled={syncingData}
              className="btn-gold flex-1"
            >
              {syncingData === 'players'
                ? <span className="flex items-center justify-center gap-2"><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"/>Syncing...</span>
                : '👤 Sync Players'}
            </button>
            <button
              onClick={syncSchedule}
              disabled={syncingData}
              className="btn-gold flex-1"
            >
              {syncingData === 'schedule'
                ? <span className="flex items-center justify-center gap-2"><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"/>Syncing...</span>
                : '📅 Sync Schedule'}
            </button>
          </div>
        </div>

        {/* Daily score update */}
        <div className="card p-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <h2 className="font-bold">📊 Update Today's Scores</h2>
              <p className="text-xs text-white/40 font-mono mt-1">
                After each match day — Claude auto-detects today's IPL results and updates all fantasy points.
              </p>
            </div>
            <button onClick={updateTodayScores} disabled={updatingScores} className="btn-gold flex-shrink-0">
              {updatingScores
                ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"/>Fetching...</span>
                : '📊 Update Scores'}
            </button>
          </div>
          <div className="border-t border-bg-border pt-3">
            <p className="text-xs text-white/30 font-mono mb-2">Or enter a specific match:</p>
            <div className="flex gap-2">
              <input
                value={matchInput}
                onChange={e => setMatchInput(e.target.value)}
                placeholder="e.g. MI vs CSK IPL 2026 Match 14"
                className="flex-1 bg-bg-deep border border-bg-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold/40 outline-none"
                onKeyDown={e => e.key === 'Enter' && processPoints()}
              />
              <button onClick={processPoints} disabled={processingPoints} className="btn-gold flex-shrink-0">
                {processingPoints
                  ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"/>...</span>
                  : '🤖 Fetch & Process'}
              </button>
            </div>
          </div>
        </div>

        {/* Teams overview */}
        <div className="card p-4">
          <h2 className="font-bold mb-4">Teams Overview</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 font-mono text-xs uppercase border-b border-bg-border">
                  <th className="text-left py-2">Team</th>
                  <th className="text-right py-2">Purse</th>
                  <th className="text-right py-2">Players</th>
                  <th className="text-right py-2">Foreign</th>
                  <th className="text-right py-2">Lifelines</th>
                  <th className="text-right py-2">Points</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id} className="border-b border-bg-border/40 hover:bg-bg-elevated/30 transition-colors">
                    <td className="py-2 font-bold">{t.name}</td>
                    <td className="py-2 text-right font-mono text-gold">{formatPrice(t.purse_remaining)}</td>
                    <td className="py-2 text-right font-mono">{t.player_count}/17</td>
                    <td className="py-2 text-right font-mono">{t.foreign_count}/7</td>
                    <td className="py-2 text-right font-mono">{t.lifelines}/3</td>
                    <td className="py-2 text-right font-display text-xl text-gold">{t.total_points || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
