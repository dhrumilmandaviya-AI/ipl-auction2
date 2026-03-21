import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuction } from '../contexts/AuctionContext'
import { PLAYERS } from '../data/players'
import { PURSE, LIFELINES_PER_TEAM } from '../utils/auction'

export default function Landing() {
  const navigate = useNavigate()
  const { saveUser } = useAuction()
  const [tab, setTab] = useState('join') // 'join' | 'create'
  const [loading, setLoading] = useState(false)

  // Join form
  const [roomCode, setRoomCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [adminCode, setAdminCode] = useState('')

  // Create form
  const [auctionName, setAuctionName] = useState('')
  const [creatorTeam, setCreatorTeam] = useState('')
  const [auctionMode, setAuctionMode] = useState('virtual') // 'virtual' | 'physical'

  async function handleJoin(e) {
    e.preventDefault()
    if (!roomCode.trim() || !teamName.trim()) return toast.error('Fill in all fields')
    setLoading(true)
    try {
      // Find room
      const { data: room, error: rErr } = await supabase
        .from('auction_rooms')
        .select('*')
        .eq('code', roomCode.trim().toUpperCase())
        .single()
      if (rErr || !room) throw new Error('Room not found. Check the code.')

      // Check if team name exists
      const { data: existing } = await supabase
        .from('teams')
        .select('id, name')
        .eq('auction_room_id', room.id)
        .ilike('name', teamName.trim())
        .single()

      let teamId
      let isAdmin = false

      if (existing) {
        // Rejoin existing team
        teamId = existing.id
        isAdmin = adminCode.trim() !== '' && 
                  adminCode.trim() === `ADMIN_${room.code.slice(-4)}`
      } else {
        // Create new team
        const { data: newTeam, error: tErr } = await supabase
          .from('teams')
          .insert({
            auction_room_id: room.id,
            name: teamName.trim(),
            purse_remaining: PURSE,
            player_count: 0,
            foreign_count: 0,
            lifelines: LIFELINES_PER_TEAM,
          })
          .select()
          .single()
        if (tErr) throw new Error('Failed to create team')
        teamId = newTeam.id
        isAdmin = adminCode.trim() === `ADMIN_${room.code.slice(-4)}`
      }

      saveUser({ teamId, teamName: existing?.name || teamName.trim(), roomId: room.id, isAdmin })
      navigate(`/room/${room.id}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!auctionName.trim() || !creatorTeam.trim()) return toast.error('Fill in all fields')
    setLoading(true)
    try {
      // Generate 6-char code
      const code = Math.random().toString(36).slice(2, 8).toUpperCase()

      // Create room
      const { data: room, error: rErr } = await supabase
        .from('auction_rooms')
        .insert({ name: auctionName.trim(), code, status: 'waiting', auction_mode: auctionMode })
        .select()
        .single()
      if (rErr) throw new Error('Failed to create room')

      // Create admin team
      const { data: team, error: tErr } = await supabase
        .from('teams')
        .insert({
          auction_room_id: room.id,
          name: creatorTeam.trim(),
          purse_remaining: PURSE,
          player_count: 0,
          foreign_count: 0,
          lifelines: LIFELINES_PER_TEAM,
        })
        .select()
        .single()
      if (tErr) throw new Error('Failed to create team')

      // Set admin
      await supabase.from('auction_rooms').update({ admin_team_id: team.id }).eq('id', room.id)

      // Seed all players into auction_players
      const auctionPlayers = PLAYERS.map((p, i) => ({
        auction_room_id: room.id,
        player_id: p.id,
        status: 'pending',
        current_bid: 0,
        order_index: i,
      }))

      // Insert in batches
      for (let i = 0; i < auctionPlayers.length; i += 50) {
        await supabase.from('auction_players').insert(auctionPlayers.slice(i, i + 50))
      }

      saveUser({ teamId: team.id, teamName: creatorTeam.trim(), roomId: room.id, isAdmin: true })
      toast.success(`Room created! Code: ${code}`)
      navigate(`/room/${room.id}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="text-8xl mb-4">🏏</div>
        <h1 className="font-display text-7xl text-gold leading-none tracking-wide">
          IPL AUCTION
        </h1>
        <p className="text-white/40 font-mono text-sm mt-3 tracking-widest uppercase">
          Live Fantasy Bidding · 100Cr Per Team · Real-time
        </p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="card w-full max-w-md p-6"
      >
        {/* Tab switcher */}
        <div className="flex bg-bg-deep rounded-lg p-1 mb-6">
          {['join', 'create'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-md text-sm font-bold transition-all capitalize ${
                tab === t ? 'bg-gold text-black' : 'text-white/40 hover:text-white'
              }`}
            >
              {t === 'join' ? '🎯 Join Room' : '⚡ Create Room'}
            </button>
          ))}
        </div>

        {tab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="text-xs text-white/50 font-mono uppercase tracking-wider block mb-1">Room Code</label>
              <input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB3X9K"
                maxLength={8}
                className="w-full bg-bg-deep border border-bg-border rounded-lg px-4 py-3 text-white font-mono text-lg tracking-widest focus:border-gold/50 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 font-mono uppercase tracking-wider block mb-1">Your Team Name</label>
              <input
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="e.g. Dhrumil's Demons"
                className="w-full bg-bg-deep border border-bg-border rounded-lg px-4 py-3 text-white focus:border-gold/50 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 font-mono uppercase tracking-wider block mb-1">Admin Code <span className="text-white/30">(optional)</span></label>
              <input
                value={adminCode}
                onChange={e => setAdminCode(e.target.value)}
                placeholder="Only if you're the auctioneer"
                type="password"
                className="w-full bg-bg-deep border border-bg-border rounded-lg px-4 py-3 text-white focus:border-gold/50 outline-none"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-gold w-full py-3 text-lg mt-2">
              {loading ? 'Joining...' : 'Enter Auction Room →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-xs text-white/50 font-mono uppercase tracking-wider block mb-1">Auction Name</label>
              <input
                value={auctionName}
                onChange={e => setAuctionName(e.target.value)}
                placeholder="e.g. IPL 2026 Mega Auction"
                className="w-full bg-bg-deep border border-bg-border rounded-lg px-4 py-3 text-white focus:border-gold/50 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 font-mono uppercase tracking-wider block mb-1">Your Team Name</label>
              <input
                value={creatorTeam}
                onChange={e => setCreatorTeam(e.target.value)}
                placeholder="e.g. Batman's Batsmen"
                className="w-full bg-bg-deep border border-bg-border rounded-lg px-4 py-3 text-white focus:border-gold/50 outline-none"
              />
            </div>

            {/* Auction mode selector */}
            <div>
              <label className="text-xs text-white/50 font-mono uppercase tracking-wider block mb-2">Auction Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: 'virtual',
                    emoji: '💻',
                    title: 'Virtual',
                    desc: 'Everyone bids from their own device in real-time',
                  },
                  {
                    id: 'physical',
                    emoji: '🔨',
                    title: 'Physical',
                    desc: 'In-person bidding — admin enters bids, app tracks everything',
                  },
                ].map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setAuctionMode(mode.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      auctionMode === mode.id
                        ? 'border-gold bg-gold/10'
                        : 'border-bg-border hover:border-gold/30'
                    }`}
                  >
                    <div className="text-xl mb-1">{mode.emoji}</div>
                    <div className={`font-bold text-sm ${auctionMode === mode.id ? 'text-gold' : 'text-white/70'}`}>{mode.title}</div>
                    <div className="text-xs text-white/35 mt-0.5 leading-tight">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gold/5 border border-gold/20 rounded-lg p-3 text-xs text-gold/70 font-mono">
              💡 You'll get an admin code after creation.
              Each team gets ₹100Cr · 3 Lifelines · Max 17 players
            </div>
            <button type="submit" disabled={loading} className="btn-gold w-full py-3 text-lg">
              {loading ? 'Creating...' : 'Create Auction Room ⚡'}
            </button>
          </form>
        )}
      </motion.div>

      <p className="mt-6 text-white/20 text-xs font-mono">
        {PLAYERS.length} IPL 2025 players · Real-time Supabase · All prices in Lakhs
      </p>
    </div>
  )
}
