import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import PLAYERS from '../data/players'

const ROLE_CLASS = { BAT: 'role-badge-bat', BWL: 'role-badge-bwl', AR: 'role-badge-ar', WK: 'role-badge-wk' }
const SELECTION_SIZE = 15

export default function TeamSelection() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, teams, isAdmin, loadRoom } = useAuction()

  const [mySquad, setMySquad]             = useState([]) // player_ids I own
  const [selected, setSelected]           = useState([]) // player_ids I've chosen
  const [existing, setExisting]           = useState(null)
  const [allSelections, setAllSelections] = useState([])
  const [saving, setSaving]               = useState(false)
  const [isLocked, setIsLocked]           = useState(false)
  const [autoFilling, setAutoFilling]     = useState(false)
  const [roleFilter, setRoleFilter]       = useState('All')

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId)
  }, [roomId])

  useEffect(() => {
    if (user?.teamId) { fetchMySquad(); fetchMySelection() }
    if (isAdmin) fetchAllSelections()
  }, [user?.teamId, isAdmin])

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
    const { data } = await supabase
      .from('team_season_selections')
      .select('*')
      .eq('team_id', user.teamId)
      .eq('auction_room_id', roomId)
      .single()
    if (data) { setExisting(data); setSelected(data.player_ids); setIsLocked(data.locked || false) }
  }

  async function fetchAllSelections() {
    const { data } = await supabase
      .from('team_season_selections')
      .select('*, teams(name)')
      .eq('auction_room_id', roomId)
    if (data) setAllSelections(data)
  }

  function togglePlayer(playerId) {
    if (selected.includes(playerId)) {
      setSelected(selected.filter(id => id !== playerId))
    } else {
      if (selected.length >= SELECTION_SIZE) {
        toast.error(`Max ${SELECTION_SIZE} — remove one first`)
        return
      }
      setSelected([...selected, playerId])
    }
  }

  async function saveSelection() {
    if (isLocked) { toast.error('Squad is locked — contact admin to unlock'); return }
    if (selected.length !== SELECTION_SIZE) {
      toast.error(`Select exactly ${SELECTION_SIZE} players`)
      return
    }
    setSaving(true)
    try {
      await supabase.from('team_season_selections').upsert({
        auction_room_id: roomId,
        team_id: user.teamId,
        player_ids: selected,
        is_auto_selected: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'team_id,auction_room_id' })
      toast.success('✅ Season squad saved!')
      fetchMySelection()
      if (isAdmin) fetchAllSelections()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  function autoFillMine() {
    const auto = mySquad
      .map(id => PLAYERS.find(p => p.id === id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, SELECTION_SIZE)
      .map(p => p.id)
    setSelected(auto)
    toast.success('Auto-filled alphabetically — review and save')
  }

  async function autoFillAll() {
    setAutoFilling(true)
    try {
      const doneIds = allSelections.map(s => s.team_id)
      const todo = teams.filter(t => !doneIds.includes(t.id))

      for (const team of todo) {
        const { data: squadData } = await supabase
          .from('auction_players')
          .select('player_id')
          .eq('auction_room_id', roomId)
          .eq('sold_to_team_id', team.id)
          .eq('status', 'sold')
        if (!squadData?.length) continue

        const auto = squadData
          .map(ap => PLAYERS.find(p => p.id === ap.player_id))
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, SELECTION_SIZE)
          .map(p => p.id)

        await supabase.from('team_season_selections').upsert({
          auction_room_id: roomId,
          team_id: team.id,
          player_ids: auto,
          is_auto_selected: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'team_id,auction_room_id' })
      }

      toast.success(`✅ Auto-filled ${todo.length} teams`)
      fetchAllSelections()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAutoFilling(false)
    }
  }

  const squadPlayers = mySquad
    .map(id => PLAYERS.find(p => p.id === id))
    .filter(Boolean)
    .filter(p => roleFilter === 'All' || p.role === roleFilter)
    .sort((a, b) => a.name.localeCompare(b.name))

  const selectedPlayers = selected
    .map(id => PLAYERS.find(p => p.id === id))
    .filter(Boolean)

  const overseas = selectedPlayers.filter(p => p.is_foreign).length

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-xl mx-auto w-full p-4 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-4xl text-gold">Season Squad</h1>
            <p className="text-white/40 font-mono text-sm mt-1">
              Pick 15 from your full squad · Done once before the first match · Top 11 by points count each game
            </p>
          </div>
          {existing && (
            <div className={`border rounded-xl px-4 py-2 text-sm font-mono ${isLocked ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-sold/10 border-sold/30 text-sold'}`}>
              {isLocked ? '🔒 Squad locked — no changes allowed' : `✅ Squad saved ${existing.is_auto_selected ? '(auto)' : ''} — not yet locked`}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Left: pick from full squad */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">
                Your Full Squad
                <span className="ml-2 text-white/30 font-mono text-sm">{mySquad.length} players</span>
              </h2>
              {/* Role filter */}
              <div className="flex gap-1">
                {['All','BAT','BWL','AR','WK'].map(r => (
                  <button key={r} onClick={() => setRoleFilter(r)}
                    className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${roleFilter === r ? 'bg-gold text-black' : 'border border-bg-border text-white/40 hover:text-white'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-1 max-h-[500px] overflow-y-auto">
              {squadPlayers.length === 0 && (
                <div className="text-white/30 text-sm font-mono py-8 text-center">
                  No players in squad yet
                </div>
              )}
              {squadPlayers.map(p => {
                const isChosen = selected.includes(p.id)
                const rc = ROLE_CLASS[p.role] || ROLE_CLASS.BAT
                return (
                  <motion.div key={p.id} layout
                    onClick={() => togglePlayer(p.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                      isChosen ? 'bg-gold/10 border border-gold/30' : 'border border-bg-border hover:border-gold/20 hover:bg-bg-elevated'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all ${
                      isChosen ? 'bg-gold text-black' : 'border border-bg-border text-white/20'
                    }`}>
                      {isChosen ? '✓' : ''}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isChosen ? 'text-gold' : 'text-white/80'}`}>{p.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`${rc}`} style={{ fontSize: '9px', padding: '1px 4px' }}>{p.role}</span>
                        <span className="text-xs text-white/25 font-mono">{p.team}</span>
                        {p.is_foreign && <span className="text-xs">🌍</span>}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Right: selected 15 + save */}
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">
                  Selected Squad
                  <span className={`ml-2 font-mono text-sm ${selected.length === SELECTION_SIZE ? 'text-sold' : 'text-gold'}`}>
                    {selected.length}/{SELECTION_SIZE}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button onClick={autoFillMine} className="btn-ghost text-xs py-1.5">🔀 Auto-fill</button>
                  <button
                    onClick={saveSelection}
                    disabled={saving || selected.length !== SELECTION_SIZE || isLocked}
                    className="btn-gold text-xs py-1.5"
                  >
                    {saving ? 'Saving...' : isLocked ? '🔒 Squad Locked' : 'Lock Squad ✓'}
                  </button>
                </div>
              </div>

              {/* Stats bar */}
              <div className="flex gap-3 text-xs font-mono">
                <span className={selected.length === SELECTION_SIZE ? 'text-sold' : 'text-gold'}>
                  {selected.length}/{SELECTION_SIZE} players
                </span>
                <span className={overseas > 5 ? 'text-danger' : 'text-white/40'}>
                  {overseas} overseas {overseas > 5 ? '⚠️ top 11 capped at 5' : ''}
                </span>
              </div>

              {/* Selected list */}
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {selectedPlayers.length === 0 && (
                  <div className="text-white/20 text-xs font-mono py-4 text-center">
                    Click players on the left to add them
                  </div>
                )}
                {selectedPlayers.map((p, i) => {
                  const rc = ROLE_CLASS[p.role] || ROLE_CLASS.BAT
                  return (
                    <div key={p.id}
                      onClick={() => togglePlayer(p.id)}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gold/5 border border-gold/20 cursor-pointer hover:border-danger/40 hover:bg-danger/5 transition-all"
                    >
                      <span className="text-white/30 font-mono text-xs w-5 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gold truncate">{p.name}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={rc} style={{ fontSize: '9px', padding: '1px 4px' }}>{p.role}</span>
                          {p.is_foreign && <span className="text-xs text-yellow-400">🌍</span>}
                        </div>
                      </div>
                      <span className="text-white/20 text-xs hover:text-danger">✕</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Rules reminder */}
            <div className="bg-gold/5 border border-gold/20 rounded-xl p-3 text-xs text-gold/60 font-mono space-y-1">
              <div>· Select exactly 15 from your squad — done once</div>
              <div>· Each match: top 11 by points from your 15 count</div>
              <div>· Max 5 overseas in the top 11</div>
              <div>· If not selected before Match 1, admin auto-fills alphabetically</div>
            </div>

            {/* Admin panel: all teams status */}
            {isAdmin && (
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-sm">All Teams Status</h2>
                  <button onClick={autoFillAll} disabled={autoFilling} className="btn-ghost text-xs py-1.5">
                    {autoFilling ? 'Filling...' : '🔀 Auto-fill Missing'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {teams.map(t => {
                    const sel = allSelections.find(s => s.team_id === t.id)
                    return (
                      <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg border border-bg-border">
                        <span className="text-sm font-medium">{t.name}</span>
                        {sel ? (
                          <span className="text-xs text-sold font-mono">✅ {sel.player_ids.length} locked {sel.is_auto_selected ? '(auto)' : ''}</span>
                        ) : (
                          <span className="text-xs text-danger font-mono">⚠️ Not done</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
