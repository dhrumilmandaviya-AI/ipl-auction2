import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import PLAYERS from '../data/players'
import { formatPrice } from '../utils/auction'

const ROLE_CLASS = { BAT: 'role-badge-bat', BWL: 'role-badge-bwl', AR: 'role-badge-ar', WK: 'role-badge-wk' }
const SELECTION_SIZE = 15

export default function TeamSelection() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, room, teams, isAdmin, loadRoom } = useAuction()

  const [matches, setMatches] = useState([])
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [mySquad, setMySquad] = useState([])
  const [selected, setSelected] = useState([]) // player_ids chosen
  const [existingSelection, setExistingSelection] = useState(null)
  const [allSelections, setAllSelections] = useState([]) // for admin view
  const [saving, setSaving] = useState(false)
  const [autoFilling, setAutoFilling] = useState(false)
  const [viewingTeam, setViewingTeam] = useState(null) // admin: which team to view

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId)
    fetchMatches()
  }, [roomId])

  useEffect(() => {
    if (user?.teamId) fetchMySquad()
  }, [user])

  useEffect(() => {
    if (selectedMatch) {
      fetchMySelection()
      if (isAdmin) fetchAllSelections()
    }
  }, [selectedMatch, user?.teamId])

  async function fetchMatches() {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('auction_room_id', roomId)
      .order('match_number', { ascending: true })
    if (data) setMatches(data)
  }

  async function fetchMySquad() {
    const { data } = await supabase
      .from('auction_players')
      .select('player_id')
      .eq('auction_room_id', roomId)
      .eq('sold_to_team_id', user.teamId)
      .eq('status', 'sold')
    if (data) setMySquad(data.map(ap => ap.player_id))
  }

  async function fetchMySelection() {
    if (!user?.teamId || !selectedMatch) return
    const { data } = await supabase
      .from('team_match_selections')
      .select('*')
      .eq('team_id', user.teamId)
      .eq('match_id', selectedMatch.id)
      .single()
    if (data) {
      setExistingSelection(data)
      setSelected(data.player_ids)
    } else {
      setExistingSelection(null)
      setSelected([])
    }
  }

  async function fetchAllSelections() {
    const { data } = await supabase
      .from('team_match_selections')
      .select('*, teams(name)')
      .eq('auction_room_id', roomId)
      .eq('match_id', selectedMatch?.id)
    if (data) setAllSelections(data)
  }

  function togglePlayer(playerId) {
    if (selected.includes(playerId)) {
      setSelected(selected.filter(id => id !== playerId))
    } else {
      if (selected.length >= SELECTION_SIZE) {
        toast.error(`Max ${SELECTION_SIZE} players — remove one first`)
        return
      }
      setSelected([...selected, playerId])
    }
  }

  async function saveSelection() {
    if (selected.length !== SELECTION_SIZE) {
      toast.error(`Select exactly ${SELECTION_SIZE} players`)
      return
    }
    setSaving(true)
    try {
      await supabase.from('team_match_selections').upsert({
        auction_room_id: roomId,
        team_id: user.teamId,
        match_id: selectedMatch.id,
        player_ids: selected,
        is_auto_selected: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'team_id,match_id' })
      toast.success('✅ Selection saved!')
      fetchMySelection()
      if (isAdmin) fetchAllSelections()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function autoSelectMyTeam() {
    // Auto-select first 15 alphabetically from my squad
    const squadPlayers = mySquad
      .map(id => PLAYERS.find(p => p.id === id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, SELECTION_SIZE)
      .map(p => p.id)
    setSelected(squadPlayers)
    toast.success('Auto-filled alphabetically — review and save')
  }

  async function autoSelectAllTeams() {
    // Admin: auto-select for all teams that haven't selected yet
    setAutoFilling(true)
    try {
      const selectedTeamIds = allSelections.map(s => s.team_id)
      const teamsToFill = teams.filter(t => !selectedTeamIds.includes(t.id))

      for (const team of teamsToFill) {
        const { data: squadData } = await supabase
          .from('auction_players')
          .select('player_id')
          .eq('auction_room_id', roomId)
          .eq('sold_to_team_id', team.id)
          .eq('status', 'sold')

        if (!squadData?.length) continue

        const squadPlayers = squadData
          .map(ap => PLAYERS.find(p => p.id === ap.player_id))
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, SELECTION_SIZE)
          .map(p => p.id)

        await supabase.from('team_match_selections').upsert({
          auction_room_id: roomId,
          team_id: team.id,
          match_id: selectedMatch.id,
          player_ids: squadPlayers,
          is_auto_selected: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'team_id,match_id' })
      }

      toast.success(`✅ Auto-selected for ${teamsToFill.length} teams`)
      fetchAllSelections()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAutoFilling(false)
    }
  }

  const mySquadPlayers = mySquad
    .map(id => PLAYERS.find(p => p.id === id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))

  const teamsWithSelection = allSelections.map(s => s.team_id)

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-xl mx-auto w-full p-4 space-y-5">

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-4xl text-gold">Team Selection</h1>
            <p className="text-white/40 font-mono text-sm mt-1">
              Pick your 15 before each match · Top 11 by points count
            </p>
          </div>
        </div>

        {/* Match selector */}
        <div className="card p-4">
          <div className="text-xs text-white/40 font-mono uppercase tracking-wider mb-3">Select Match</div>
          <div className="flex gap-2 flex-wrap max-h-40 overflow-y-auto">
            {matches.length === 0 && (
              <div className="text-white/30 text-sm font-mono">No matches found — sync schedule first from Admin</div>
            )}
            {matches.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMatch(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  selectedMatch?.id === m.id
                    ? 'bg-gold text-black font-bold'
                    : 'border border-bg-border text-white/50 hover:text-white hover:border-gold/30'
                }`}
              >
                M{m.match_number}: {m.team1} vs {m.team2}
                {m.match_date && <span className="ml-1 text-white/30">{new Date(m.match_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
              </button>
            ))}
          </div>
        </div>

        {selectedMatch && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* My selection */}
            <div className="space-y-4">
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-bold">
                      {isAdmin ? 'Your Squad' : 'Your 15'} 
                      <span className={`ml-2 text-sm font-mono ${selected.length === SELECTION_SIZE ? 'text-sold' : 'text-gold'}`}>
                        {selected.length}/{SELECTION_SIZE}
                      </span>
                    </h2>
                    {existingSelection && (
                      <div className="text-xs text-sold font-mono mt-0.5">
                        ✅ Selection saved {existingSelection.is_auto_selected ? '(auto)' : '(manual)'}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={autoSelectMyTeam}
                      className="btn-ghost text-xs py-1.5"
                    >
                      🔀 Auto-fill
                    </button>
                    <button
                      onClick={saveSelection}
                      disabled={saving || selected.length !== SELECTION_SIZE}
                      className="btn-gold text-xs py-1.5"
                    >
                      {saving ? 'Saving...' : 'Save ✓'}
                    </button>
                  </div>
                </div>

                {mySquadPlayers.length === 0 ? (
                  <div className="text-white/30 text-sm font-mono py-4 text-center">
                    No players in squad yet
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1 max-h-96 overflow-y-auto">
                    {mySquadPlayers.map(p => {
                      const isSelected = selected.includes(p.id)
                      const rc = ROLE_CLASS[p.role] || ROLE_CLASS.BAT
                      return (
                        <motion.div
                          key={p.id}
                          layout
                          onClick={() => togglePlayer(p.id)}
                          className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-gold/10 border border-gold/30'
                              : 'border border-bg-border hover:border-gold/20 hover:bg-bg-elevated'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all ${
                            isSelected ? 'bg-gold text-black' : 'border border-bg-border text-white/20'
                          }`}>
                            {isSelected ? '✓' : ''}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate ${isSelected ? 'text-gold' : 'text-white/80'}`}>
                              {p.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`${rc} text-xs`} style={{ fontSize: '9px', padding: '1px 4px' }}>{p.role}</span>
                              <span className="text-xs text-white/25 font-mono">{p.team}</span>
                              {p.is_foreign && <span className="text-xs">🌍</span>}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="bg-gold/5 border border-gold/20 rounded-xl p-3 text-xs text-gold/60 font-mono space-y-1">
                <div>· Select exactly 15 players from your squad</div>
                <div>· After the match, top 11 by points from your 15 count</div>
                <div>· Max 5 overseas players in your top 11</div>
                <div>· If you don't select, auto-fill runs alphabetically</div>
              </div>
            </div>

            {/* Admin: all teams status */}
            {isAdmin && (
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold">All Teams Status</h2>
                  <button
                    onClick={autoSelectAllTeams}
                    disabled={autoFilling}
                    className="btn-ghost text-xs py-1.5"
                  >
                    {autoFilling ? 'Filling...' : '🔀 Auto-fill Missing'}
                  </button>
                </div>
                <div className="space-y-2">
                  {teams.map(t => {
                    const sel = allSelections.find(s => s.team_id === t.id)
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                          viewingTeam === t.id ? 'border-gold/40 bg-gold/5' : 'border-bg-border hover:border-gold/20'
                        }`}
                        onClick={() => setViewingTeam(viewingTeam === t.id ? null : t.id)}
                      >
                        <div>
                          <div className="font-medium text-sm">{t.name}</div>
                          {sel ? (
                            <div className="text-xs font-mono text-sold mt-0.5">
                              ✅ {sel.player_ids.length} selected {sel.is_auto_selected ? '· auto' : '· manual'}
                            </div>
                          ) : (
                            <div className="text-xs font-mono text-danger mt-0.5">⚠️ Not selected yet</div>
                          )}
                        </div>
                        <span className="text-white/30 text-xs">{viewingTeam === t.id ? '▲' : '▼'}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Show selected players for a team */}
                <AnimatePresence>
                  {viewingTeam && (() => {
                    const sel = allSelections.find(s => s.team_id === viewingTeam)
                    if (!sel) return null
                    const selPlayers = sel.player_ids
                      .map(id => PLAYERS.find(p => p.id === id))
                      .filter(Boolean)
                      .sort((a, b) => a.name.localeCompare(b.name))
                    return (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 pt-3 border-t border-bg-border"
                      >
                        <div className="text-xs text-white/40 font-mono mb-2">
                          {teams.find(t => t.id === viewingTeam)?.name}'s 15:
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {selPlayers.map(p => (
                            <div key={p.id} className="text-xs text-white/60 font-mono flex items-center gap-1">
                              <span className={`${ROLE_CLASS[p.role]} text-xs`} style={{ fontSize: '8px', padding: '1px 3px' }}>{p.role}</span>
                              <span className="truncate">{p.name}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )
                  })()}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
