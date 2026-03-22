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

  /** Apply selection logic: only top 11 from each team's season 15 count per match */
  async function applySelectionPoints(matchId) {
    const { data: selections } = await supabase
      .from('team_season_selections')
      .select('*')
      .eq('auction_room_id', roomId)

    if (!selections?.length) return // no selections — all points count as-is

    for (const sel of selections) {
      const { data: perfs } = await supabase
        .from('match_performances')
        .select('*')
        .eq('match_id', matchId)
        .eq('team_id', sel.team_id)

      if (!perfs?.length) continue

      // Zero out players not in the selected 15
      for (const p of perfs) {
        if (!sel.player_ids.includes(p.player_id)) {
          await supabase.from('match_performances')
            .update({ counted_points: 0 })
            .eq('id', p.id)
        }
      }

      // From selected 15, pick top 11 with max 5 overseas
      const inSelected = perfs
        .filter(p => sel.player_ids.includes(p.player_id))
        .sort((a, b) => b.total_points - a.total_points)

      let overseasCount = 0
      const top11Ids = []
      for (const p of inSelected) {
        if (top11Ids.length >= 11) break
        const playerData = PLAYERS.find(pl => pl.id === p.player_id)
        if (playerData?.is_foreign) {
          if (overseasCount >= 5) continue
          overseasCount++
        }
        top11Ids.push(p.player_id)
      }

      for (const p of inSelected) {
        await supabase.from('match_performances')
          .update({ counted_points: top11Ids.includes(p.player_id) ? p.total_points : 0 })
          .eq('id', p.id)
      }
    }
  }

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
        content: `Search cricbuzz.com for the scorecard of this IPL 2026 match: "${matchInput.trim()}"

Extract stats for ONLY these players: ${playerNames.join(', ')}

Your response must be ONLY a JSON array. No intro, no markdown, no explanation.
Start with [ and end with ]. Nothing else.

Format:
[{"player_name":"Virat Kohli","did_not_play":false,"batting":{"runs":45,"balls":32,"fours":4,"sixes":2,"dismissed":true},"bowling":null,"in_lineup":true,"is_substitute":false,"fielding":{"catches":0,"stumpings":0,"run_out_direct":0,"run_out_indirect":0}}]

Rules:
- did_not_play: true if player not in scorecard
- batting: null if player did not bat
- bowling: null if player did not bowl
- fielding always included with catches/runouts/stumpings
Start the JSON array now:`
      }], 3000)

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

      // Prevent double processing
      if (match.scores_processed) {
        if (!window.confirm(`⚠️ Scores for "${matchInput.trim()}" have already been processed. Process again? This will overwrite existing scores.`)) {
          setProcessingPoints(false)
          return
        }
      }

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
          in_lineup: perf.in_lineup || false,
          is_substitute: perf.is_substitute || false,
          total_points: totalPts,
        })
        processed++
      }

      // Now apply selection logic — only top 11 from selected 15 count per team
      await applySelectionPoints(match.id)

      // Update team totals
      const uniqueTeams = [...new Set(soldPlayers.map(ap => ap.sold_to_team_id))]
      for (const teamId of uniqueTeams) {
        await supabase.rpc('update_team_points', { p_team_id: teamId, p_room_id: roomId })
      }

      toast.success(`✅ Points processed for ${processed} players from ${matchInput.trim()}!`)
      // Mark match as processed to prevent double-runs
      await supabase.from('matches').update({ scores_processed: true, processed_at: new Date().toISOString() }).eq('id', match.id)
      setMatchInput('')
    } catch (err) {
      toast.error(err.message || 'Failed to fetch or process match')
    } finally {
      setProcessingPoints(false)
    }
  }

  /** Sync IPL 2026 player team assignments - one team at a time from Cricbuzz */
  async function syncPlayers() {
    setSyncingData('players')
    const teams = ['MI', 'CSK', 'RCB', 'KKR', 'DC', 'SRH', 'RR', 'PBKS', 'LSG', 'GT']
    const teamNames = {
      MI: 'Mumbai Indians', CSK: 'Chennai Super Kings', RCB: 'Royal Challengers Bengaluru',
      KKR: 'Kolkata Knight Riders', DC: 'Delhi Capitals', SRH: 'Sunrisers Hyderabad',
      RR: 'Rajasthan Royals', PBKS: 'Punjab Kings', LSG: 'Lucknow Super Giants', GT: 'Gujarat Titans',
    }
    let totalUpdated = 0

    try {
      for (const teamCode of teams) {
        setSyncStatus(`🔍 Fetching ${teamNames[teamCode]} squad from Cricbuzz...`)

        const data = await callClaudeWithSearch([{
          role: 'user',
          content: `Go to cricbuzz.com and search for the ${teamNames[teamCode]} IPL 2026 squad / team page.

List every player in their IPL 2026 squad.

From this list, find which of these players are in ${teamNames[teamCode]}:
${PLAYERS.map(p => `${p.id}: ${p.name}`).join('\n')}

CRITICAL: Reply with ONLY a raw JSON array, nothing else, no explanation, no markdown:
[{"id":"p001"},{"id":"p039"}]

Only include players who are confirmed in ${teamNames[teamCode]}'s IPL 2026 squad.`
        }], 1500)

        const text = extractText(data)
        let players = []
        try {
          players = parseJSON(text)
        } catch {
          continue // skip this team if parse fails, don't abort all
        }

        for (const p of players) {
          if (p.id) {
            await supabase.from('players').update({ team: teamCode }).eq('id', p.id)
            totalUpdated++
          }
        }
      }

      setSyncStatus('')
      toast.success(`✅ Updated ${totalUpdated} players from Cricbuzz!`)
    } catch (err) {
      toast.error(err.message || 'Player sync failed')
      setSyncStatus('')
    } finally {
      setSyncingData(false)
    }
  }

  /** Fetch IPL 2025 stats for all players in batches */
  async function syncStats() {
    setSyncingData('stats')
    setSyncStatus('📊 Fetching IPL 2025 stats (batch 1)...')
    try {
      const batchSize = 25
      let totalUpdated = 0

      for (let i = 0; i < PLAYERS.length; i += batchSize) {
        const batch = PLAYERS.slice(i, i + batchSize)
        const batchNum = Math.floor(i / batchSize) + 1
        const totalBatches = Math.ceil(PLAYERS.length / batchSize)
        setSyncStatus(`📊 Fetching stats batch ${batchNum}/${totalBatches}...`)

        const data = await callClaudeWithSearch([{
          role: 'user',
          content: `Search cricbuzz.com for IPL 2025 season statistics for these players:
${batch.map(p => p.name).join(', ')}

Your response must be ONLY a JSON array. No intro, no markdown. Start with [ end with ].

Format:
[{"name":"Virat Kohli","batting":"741 runs | Avg 49.4 | SR 144.2 | HS 113 | 5x50 | 2x100","bowling":null},
{"name":"Jasprit Bumrah","batting":null,"bowling":"20 wkts | Eco 6.7 | Avg 22.3 | Best 4/14"}]

Rules:
- batting: null if player is a pure bowler and didn't bat meaningfully
- bowling: null if player didn't bowl
- Keep stats concise — runs, avg, SR, HS, fifties, hundreds for batters; wkts, eco, avg, best for bowlers
- If player had no IPL 2025 stats write "No IPL 2025 data"
Start the JSON array now:`
        }], 2000)

        const text = extractText(data)
        let stats
        try { stats = parseJSON(text) } catch { continue }

        for (const s of stats) {
          const player = PLAYERS.find(p =>
            p.name.toLowerCase() === s.name?.toLowerCase()
          )
          if (!player) continue
          await supabase.from('players').update({
            batting_stats: s.batting || null,
            bowling_stats: s.bowling || null,
          }).eq('id', player.id)
          totalUpdated++
        }

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < PLAYERS.length) {
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      setSyncStatus('')
      toast.success(`✅ Updated stats for ${totalUpdated} players!`)
    } catch (err) {
      toast.error(err.message || 'Stats fetch failed')
      setSyncStatus('')
    } finally {
      setSyncingData(false)
    }
  }

  /** Sync IPL 2026 match schedule */
  async function syncSchedule() {
    setSyncingData('schedule')
    setSyncStatus('📅 Fetching IPL 2026 schedule from Cricbuzz...')
    try {
      const data = await callClaudeWithSearch([{
        role: 'user',
        content: `Search for IPL 2026 schedule on cricbuzz.com and iplt20.com.

Return ALL confirmed matches you find even if the full schedule is not released yet.

CRITICAL: Your entire response must be only a JSON array. Start immediately with [ — no text before it.

[{"match_number":1,"team1":"CSK","team2":"MI","match_date":"2026-03-22"},{"match_number":2,"team1":"GT","team2":"RR","match_date":"2026-03-23"}]

Team codes: MI CSK RCB KKR DC SRH RR PBKS LSG GT
Use null for unknown dates.
[`
      }], 3000)

      setSyncStatus('📥 Saving schedule...')
      const text = extractText(data)
      const matches = parseJSON(text)

      if (!Array.isArray(matches) || matches.length === 0) {
        throw new Error('No matches found — try again')
      }

      const rows = matches
        .filter(m => m.team1 && m.team2)
        .map((m, i) => ({
          auction_room_id: roomId,
          name: `${m.team1} vs ${m.team2} (M${m.match_number || i + 1})`,
          match_number: m.match_number || i + 1,
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
      toast.success(`✅ Saved ${rows.length} matches!`)
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
        content: `Search cricbuzz.com for IPL 2026 matches played today (${today}) or yesterday.

Find the scorecard and extract stats for ONLY these players: ${soldPlayerNames.join(', ')}

Your response must be ONLY a JSON array. No intro, no markdown, no explanation.
Start with [ and end with ]. Nothing else.

Format:
[{"match_name":"MI vs CSK","performances":[{"player_name":"Virat Kohli","did_not_play":false,"batting":{"runs":45,"balls":32,"fours":4,"sixes":2,"dismissed":true},"bowling":null,"in_lineup":true,"is_substitute":false,"fielding":{"catches":0,"stumpings":0,"run_out_direct":0,"run_out_indirect":0}}]}]

If a player did not play set did_not_play to true and omit batting/bowling/fielding.
If a player did not bat set batting to null. If did not bowl set bowling to null.
Start the JSON array now:`
      }], 4000)

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
          in_lineup: perf.in_lineup || false,
          is_substitute: perf.is_substitute || false,
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
  const [iplTeamFilter, setIplTeamFilter] = useState('All')

  const IPL_TEAMS = ['All','CSK','DC','GT','KKR','LSG','MI','PBKS','RR','RCB','SRH']

  const filtered = pendingPlayers.filter(ap => {
    const p = PLAYERS.find(pl => pl.id === ap.player_id)
    if (!p) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (iplTeamFilter !== 'All' && p.team !== iplTeamFilter) return false
    return true
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
            {/* Re-auction toggle — available anytime after auction starts */}
            {['active', 'closed', 'reauction'].includes(room?.status) && (
              <button
                onClick={async () => {
                  if (room?.status === 'reauction') {
                    // Close re-auction back to closed
                    await supabase.from('auction_rooms').update({ status: 'closed' }).eq('id', roomId)
                    toast.success('Re-auction closed')
                    loadRoom(roomId)
                  } else {
                    await supabase.rpc('open_reauction', { p_room_id: roomId })
                    toast.success('Re-auction opened — unsold players at ₹10L base')
                    loadRoom(roomId)
                  }
                }}
                className={room?.status === 'reauction' ? 'btn-danger' : 'btn-ghost'}
              >
                {room?.status === 'reauction' ? '⏹ Close Re-auction' : '🔄 Open Re-auction (Unsold)'}
              </button>
            )}
            {/* Switch auction mode mid-auction */}
            <button
              onClick={async () => {
                const newMode = room?.auction_mode === 'physical' ? 'virtual' : 'physical'
                const { error } = await supabase
                  .from('auction_rooms')
                  .update({ auction_mode: newMode })
                  .eq('id', roomId)
                if (error) toast.error(error.message)
                else {
                  toast.success(`Switched to ${newMode === 'physical' ? '🔨 Physical' : '💻 Virtual'} mode`)
                  loadRoom(roomId)
                }
              }}
              className="btn-ghost flex items-center gap-2"
              title="Switch between physical and virtual bidding"
            >
              {room?.auction_mode === 'physical' ? '💻 Switch to Virtual' : '🔨 Switch to Physical'}
            </button>
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
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-bold">Player Queue ({filtered.length}/{pendingPlayers.length})</h2>
            <div className="flex gap-1 flex-wrap">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="bg-bg-deep border border-bg-border rounded px-3 py-1.5 text-sm focus:border-gold/40 outline-none"
              />
            </div>
          </div>
          {/* IPL team filter */}
          <div className="flex gap-1 flex-wrap mb-3">
            {IPL_TEAMS.map(t => (
              <button key={t} onClick={() => setIplTeamFilter(t)}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${iplTeamFilter === t ? 'bg-gold text-black' : 'border border-bg-border text-white/40 hover:text-white'}`}>
                {t}
              </button>
            ))}
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

        {/* IPL 2025 Stats Fetch */}
        <div className="card p-4 space-y-3">
          <h2 className="font-bold">📊 Fetch IPL 2025 Stats</h2>
          <p className="text-xs text-white/40 font-mono">
            Click once — Claude searches Cricbuzz for each player's IPL 2025 batting and bowling stats and saves them to the database.
          </p>
          {syncStatus && (
            <div className="bg-gold/5 border border-gold/20 rounded-lg p-2 font-mono text-xs text-gold/80 animate-pulse">
              {syncStatus}
            </div>
          )}
          <button
            onClick={syncStats}
            disabled={syncingData}
            className="btn-gold w-full"
          >
            {syncingData === 'stats'
              ? <span className="flex items-center justify-center gap-2"><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"/>Fetching stats...</span>
              : '📊 Fetch 2025 Stats'}
          </button>
        </div>

        {/* Season Setup */}
        <div className="card p-4 space-y-3">
          <h2 className="font-bold">📅 Sync Match Schedule</h2>
          <p className="text-xs text-white/40 font-mono">
            Click once at season start — fetches the full IPL 2026 match schedule.
          </p>
          {syncStatus && (
            <div className="bg-gold/5 border border-gold/20 rounded-lg p-2 font-mono text-xs text-gold/80 animate-pulse">
              {syncStatus}
            </div>
          )}
          <button
            onClick={syncSchedule}
            disabled={syncingData}
            className="btn-gold w-full"
          >
            {syncingData === 'schedule'
              ? <span className="flex items-center justify-center gap-2"><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"/>Syncing...</span>
              : '📅 Sync Schedule'}
          </button>
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

        {/* Fantasy Points Rules */}
        <PointsRules />

        {/* Full Player Browser */}
        <PlayerBrowser />

      </div>
    </div>
  )
}

function PointsRules() {
  const [open, setOpen] = useState(false)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-bg-elevated/30 transition-colors"
      >
        <h2 className="font-bold">📋 Fantasy Points Rules</h2>
        <span className="text-white/40 font-mono text-sm">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {open && (
        <div className="border-t border-bg-border p-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">

          {/* Batting */}
          <div>
            <div className="font-bold text-gold mb-3 flex items-center gap-2">🏏 Batting</div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-bg-border/40">
                {[
                  ['Run scored', '+1'],
                  ['Boundary (4)', '+1'],
                  ['Six', '+3'],
                  ['Duck (out for 0)', '−2'],
                  ['30-run bonus', '+4'],
                  ['50-run bonus', '+6'],
                  ['Century bonus', '+8'],
                ].map(([label, pts]) => <PointRow key={label} label={label} pts={pts} />)}
              </tbody>
            </table>
            <div className="mt-3 font-bold text-white/50 text-xs mb-2">Strike Rate (10+ balls)</div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-bg-border/40">
                {[
                  ['Below 50', '−4'],
                  ['50 – 70', '−2'],
                  ['70 – 130', '0'],
                  ['130 – 150', '+2'],
                  ['150 – 200', '+4'],
                  ['Above 200', '+6'],
                ].map(([label, pts]) => <PointRow key={label} label={label} pts={pts} />)}
              </tbody>
            </table>
          </div>

          {/* Bowling */}
          <div>
            <div className="font-bold text-gold mb-3 flex items-center gap-2">🎳 Bowling</div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-bg-border/40">
                {[
                  ['Wicket', '+15'],
                  ['Maiden over', '+12'],
                  ['Dot ball', '+1'],
                  ['Wide', '−2'],
                  ['No ball', '−5'],
                  ['3-wicket haul bonus', '+4'],
                  ['4-wicket haul bonus', '+8'],
                  ['5-wicket haul bonus', '+12'],
                ].map(([label, pts]) => <PointRow key={label} label={label} pts={pts} />)}
              </tbody>
            </table>
            <div className="mt-3 font-bold text-white/50 text-xs mb-2">Economy Rate (1+ over)</div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-bg-border/40">
                {[
                  ['Below 5', '+6'],
                  ['5 – 7', '+2'],
                  ['7 – 10', '0'],
                  ['10 – 12', '−2'],
                  ['Above 12', '−6'],
                ].map(([label, pts]) => <PointRow key={label} label={label} pts={pts} />)}
              </tbody>
            </table>
          </div>

          {/* Fielding + Rules */}
          <div>
            <div className="font-bold text-gold mb-3 flex items-center gap-2">🧤 Fielding</div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-bg-border/40">
                {[
                  ['Catch', '+8'],
                  ['3-catch bonus', '+4'],
                  ['Run out', '+6'],
                  ['Stumping', '+6'],
                ].map(([label, pts]) => <PointRow key={label} label={label} pts={pts} />)}
              </tbody>
            </table>

            <div className="mt-4 font-bold text-white/50 text-xs mb-2">Squad Rules</div>
            <div className="space-y-1.5 text-xs text-white/50 font-mono">
              {[
                '₹100Cr purse per team',
                
                'Max 7 overseas players',
                'Top 11 count for points',
                'Max 5 overseas in XI',
                '3 lifelines per team',
                'Historical points follow player in trades',
              ].map(r => (
                <div key={r} className="flex items-start gap-2">
                  <span className="text-gold mt-0.5">·</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PointRow({ label, pts }) {
  const isPos = pts.startsWith('+')
  const isNeg = pts.startsWith('−')
  return (
    <tr>
      <td className="py-1.5 text-white/60">{label}</td>
      <td className={`py-1.5 text-right font-bold font-mono ${isPos ? 'text-sold' : isNeg ? 'text-danger' : 'text-white/40'}`}>
        {pts}
      </td>
    </tr>
  )
}

function PlayerBrowser() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [foreignFilter, setForeignFilter] = useState('All')
  const [selected, setSelected] = useState(null)
  const [dbPlayers, setDbPlayers] = useState([])

  const ROLE_CLASS = { BAT: 'role-badge-bat', BWL: 'role-badge-bwl', AR: 'role-badge-ar', WK: 'role-badge-wk' }

  // Load players from DB (includes batting_stats / bowling_stats) — reload every open
  useEffect(() => {
    if (!open) return
    supabase.from('players').select('*').order('name').then(({ data }) => {
      if (data) setDbPlayers(data)
    })
  }, [open])

  const playerList = dbPlayers.length > 0 ? dbPlayers : PLAYERS

  const filtered = playerList.filter(p => {
    if (roleFilter !== 'All' && p.role !== roleFilter) return false
    if (foreignFilter === 'Foreign' && !p.is_foreign) return false
    if (foreignFilter === 'Indian' && p.is_foreign) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.team?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-bg-elevated/30 transition-colors"
      >
        <h2 className="font-bold">👤 Player Browser <span className="text-white/30 font-normal text-sm">({PLAYERS.length} players)</span></h2>
        <span className="text-white/40 font-mono text-sm">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {open && (
        <div className="border-t border-bg-border">
          {/* Filters */}
          <div className="p-3 border-b border-bg-border space-y-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or team..."
              className="w-full bg-bg-deep border border-bg-border rounded-lg px-3 py-2 text-sm text-white focus:border-gold/40 outline-none"
            />
            <div className="flex gap-1.5 flex-wrap">
              {['All','BAT','BWL','AR','WK'].map(r => (
                <button key={r} onClick={() => setRoleFilter(r)}
                  className={`px-2.5 py-0.5 rounded text-xs font-bold transition-all ${roleFilter === r ? 'bg-gold text-black' : 'border border-bg-border text-white/40 hover:text-white'}`}>
                  {r}
                </button>
              ))}
              <div className="flex-1" />
              {['All','Indian','Foreign'].map(f => (
                <button key={f} onClick={() => setForeignFilter(f)}
                  className={`px-2.5 py-0.5 rounded text-xs transition-all ${foreignFilter === f ? 'bg-electric/20 text-electric border border-electric/40' : 'border border-bg-border text-white/30 hover:text-white'}`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="text-xs text-white/25 font-mono">{filtered.length} players shown</div>
          </div>

          {/* Player list + detail panel */}
          <div className="flex h-80">
            {/* List */}
            <div className="w-1/2 border-r border-bg-border overflow-y-auto">
              {filtered.map(p => {
                const rc = ROLE_CLASS[p.role] || ROLE_CLASS.BAT
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`flex items-center gap-2 px-3 py-2.5 border-b border-bg-border/40 cursor-pointer transition-colors ${selected?.id === p.id ? 'bg-gold/10' : 'hover:bg-bg-elevated/40'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm truncate ${selected?.id === p.id ? 'text-gold' : ''}`}>{p.name}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`${rc} text-xs`} style={{ fontSize: '9px', padding: '1px 4px' }}>{p.role}</span>
                        <span className="text-xs text-white/30 font-mono">{p.team}</span>
                        {p.is_foreign && <span className="text-xs">🌍</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Detail panel */}
            <div className="w-1/2 p-4 overflow-y-auto">
              {selected ? (
                <div className="space-y-3">
                  <div>
                    <div className="font-bold text-lg leading-tight">{selected.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`${ROLE_CLASS[selected.role]} text-xs`}>{selected.role}</span>
                      <span className="text-xs text-white/40 font-mono">{selected.team}</span>
                      {selected.is_foreign && <span className="text-xs text-yellow-400">🌍 Overseas</span>}
                    </div>
                    <div className="text-xs text-white/30 font-mono mt-1">{selected.nationality}</div>
                  </div>
                  <div className="text-xs text-white/25 font-mono">Base Price: <span className="text-gold">₹20L</span></div>
                  {selected.batting_stats && (
                    <div className="bg-bg-deep rounded-lg p-3">
                      <div className="text-xs text-white/35 font-mono uppercase tracking-wider mb-1">🏏 Batting (IPL 2025)</div>
                      <div className="text-xs text-white/70 font-mono leading-relaxed">{selected.batting_stats}</div>
                    </div>
                  )}
                  {selected.bowling_stats && (
                    <div className="bg-bg-deep rounded-lg p-3">
                      <div className="text-xs text-white/35 font-mono uppercase tracking-wider mb-1">🎳 Bowling (IPL 2025)</div>
                      <div className="text-xs text-white/70 font-mono leading-relaxed">{selected.bowling_stats}</div>
                    </div>
                  )}
                  {!selected.batting_stats && !selected.bowling_stats && (
                    <div className="text-xs text-white/20 font-mono italic">No stats yet — use Fetch 2025 Stats in admin</div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-white/20 font-mono text-xs text-center">
                  Click a player<br/>to see their stats
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

