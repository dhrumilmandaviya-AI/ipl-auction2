import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import PLAYERS from '../data/players'
import { formatPrice } from '../utils/auction'

const AuctionContext = createContext(null)

export function AuctionProvider({ children }) {
  const [user, setUser]             = useState(() => {
    try { return JSON.parse(localStorage.getItem('ipl_user') || 'null') } catch { return null }
  })
  const [room, setRoom]             = useState(null)
  const [teams, setTeams]           = useState([])
  const [currentPlayer, setCurrentPlayer] = useState(null)
  const [pendingPlayers, setPendingPlayers] = useState([])
  const [soldPlayers, setSoldPlayers]       = useState([])
  const [bids, setBids]             = useState([])
  const [loading, setLoading]       = useState(false)
  const channelRef                  = useRef(null)
  // Track previous top bidder for outbid detection
  const prevTopBidderRef            = useRef(null)
  const userRef                     = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  const saveUser = useCallback((u) => {
    setUser(u)
    if (u) localStorage.setItem('ipl_user', JSON.stringify(u))
    else    localStorage.removeItem('ipl_user')
  }, [])

  const logout = useCallback(() => { saveUser(null); setRoom(null); setTeams([]) }, [saveUser])

  /** Subscribe to a room for real-time updates */
  const subscribeToRoom = useCallback((roomId) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_rooms', filter: `id=eq.${roomId}` },
        payload => { setRoom(r => ({ ...r, ...payload.new })) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `auction_room_id=eq.${roomId}` },
        async () => { await refreshTeams(roomId) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_players', filter: `auction_room_id=eq.${roomId}` },
        async (payload) => {
          const ap = payload.new
          // ── OUTBID NOTIFICATION ──
          // If someone just placed a bid and the previous top bidder was me → I've been outbid
          if (ap.status === 'active' && ap.current_bidder_team_id) {
            const myTeamId = userRef.current?.teamId
            const wasTopBidder = prevTopBidderRef.current === myTeamId
            const isStillTopBidder = ap.current_bidder_team_id === myTeamId
            if (wasTopBidder && !isStillTopBidder) {
              // Find who outbid me
              const playerName = PLAYERS.find(p => p.id === ap.player_id)?.name || 'this player'
              toast(`⚡ You've been outbid on ${playerName}! New bid: ₹${ap.current_bid >= 100 ? (ap.current_bid/100).toFixed(2)+'Cr' : ap.current_bid+'L'}`, {
                icon: '🔔',
                duration: 5000,
                style: {
                  background: '#1e2a3a',
                  border: '1px solid rgba(245,158,11,0.5)',
                  color: '#fff',
                  fontFamily: 'Outfit, sans-serif',
                },
              })
            }
            prevTopBidderRef.current = ap.current_bidder_team_id
          }
          if (ap.status === 'active')  { await refreshCurrentPlayer(ap.id, roomId) }
          if (ap.status === 'sold')    { await refreshAllPlayers(roomId) }
          if (ap.status === 'pending') { await refreshAllPlayers(roomId) }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_room_id=eq.${roomId}` },
        async () => { await refreshCurrentPlayer(null, roomId, true) })
      .subscribe()

    channelRef.current = channel
    return channel
  }, [])

  const refreshTeams = useCallback(async (roomId) => {
    const { data } = await supabase.from('teams').select('*').eq('auction_room_id', roomId).order('purse_remaining', { ascending: false })
    if (data) setTeams(data)
  }, [])

  const refreshCurrentPlayer = useCallback(async (apId, roomId, fromBid = false) => {
    const { data: roomData } = await supabase.from('auction_rooms').select('current_auction_player_id').eq('id', roomId).single()
    const playerId = apId || roomData?.current_auction_player_id
    if (!playerId) { setCurrentPlayer(null); return }

    const { data } = await supabase
      .from('auction_players')
      .select('*, players(*), current_bidder:teams!auction_players_current_bidder_team_id_fkey(*)')
      .eq('id', playerId)
      .single()

    if (data) {
      setCurrentPlayer(data)
      if (fromBid) {
        setBids(prev => [...prev.slice(-19)])
      }
    }
  }, [])

  const refreshAllPlayers = useCallback(async (roomId) => {
    const { data } = await supabase
      .from('auction_players')
      .select('*, players(*), sold_to_team:teams!auction_players_sold_to_team_id_fkey(name, id)')
      .eq('auction_room_id', roomId)
      .order('order_index')

    if (data) {
      setPendingPlayers(data.filter(p => p.status === 'pending'))
      setSoldPlayers(data.filter(p => p.status === 'sold').slice(-30))
    }
  }, [])

  const loadRoom = useCallback(async (roomId) => {
    setLoading(true)
    try {
      const { data: roomData, error } = await supabase.from('auction_rooms').select('*').eq('id', roomId).single()
      if (error || !roomData) throw new Error('Room not found')
      setRoom(roomData)

      await Promise.all([
        refreshTeams(roomId),
        refreshAllPlayers(roomId),
        refreshCurrentPlayer(roomData.current_auction_player_id, roomId),
      ])

      subscribeToRoom(roomId)
    } catch (err) {
      toast.error(err.message || 'Failed to load room')
    } finally {
      setLoading(false)
    }
  }, [refreshTeams, refreshAllPlayers, refreshCurrentPlayer, subscribeToRoom])

  /** Place a bid */
  const placeBid = useCallback(async (amount) => {
    if (!user?.teamId || !currentPlayer) return
    const team = teams.find(t => t.id === user.teamId)
    if (!team) return

    // Squad lock: bidding only allowed during active or reauction phases
    if (room && !['active', 'reauction'].includes(room.status)) {
      toast.error('Auction is not active')
      return
    }

    if (team.purse_remaining < amount) {
      toast.error(`Insufficient purse! You have ${team.purse_remaining}L remaining`)
      return
    }
    if (team.player_count >= 17) {
      toast.error('Squad full (17 players max)')
      return
    }
    // Foreign player limit
    if (team.foreign_count >= 7) {
      const player = currentPlayer.players
      if (player?.is_foreign) {
        toast.error('Foreign player limit reached (7 max)')
        return
      }
    }
    if (currentPlayer.current_bidder_team_id === user.teamId) {
      toast.error("You're already the highest bidder!")
      return
    }

    const { error } = await supabase.rpc('place_bid', {
      p_auction_player_id: currentPlayer.id,
      p_team_id: user.teamId,
      p_amount: amount,
      p_room_id: room.id,
    })
    if (error) toast.error(error.message || 'Bid failed')
    else toast.success(`Bid placed: ${amount}L`)
  }, [user, currentPlayer, teams, room])

  /** Admin: place a bid on behalf of any team (physical auction mode) */
  const placeBidForTeam = useCallback(async (teamId, amount) => {
    if (!currentPlayer || !room) return
    if (!['active', 'reauction'].includes(room.status)) {
      toast.error('Auction is not active')
      return
    }
    const team = teams.find(t => t.id === teamId)
    if (!team) return
    if (team.purse_remaining < amount) {
      toast.error(`${team.name} only has ${formatPrice(team.purse_remaining)} remaining`)
      return
    }
    if (team.player_count >= 17) {
      toast.error(`${team.name}'s squad is full`)
      return
    }
    if (team.foreign_count >= 7 && currentPlayer.players?.is_foreign) {
      toast.error(`${team.name} has reached overseas player limit`)
      return
    }
    const { error } = await supabase.rpc('place_bid', {
      p_auction_player_id: currentPlayer.id,
      p_team_id: teamId,
      p_amount: amount,
      p_room_id: room.id,
    })
    if (error) toast.error(error.message || 'Bid failed')
    else toast.success(`${team.name} bid ${formatPrice(amount)}`)
  }, [currentPlayer, teams, room])

  /** Admin: mark sold (physical mode) — direct team + price, no incremental bidding */
  const markSoldPhysical = useCallback(async (teamId, finalPrice) => {
    if (!currentPlayer || !room) return
    if (!teamId) { toast.error('Select the winning team'); return }
    if (!finalPrice || finalPrice < 20) { toast.error('Enter a valid sold price (min ₹20L)'); return }
    const team = teams.find(t => t.id === teamId)
    if (team && team.purse_remaining < finalPrice) {
      toast.error(`${team.name} only has ${formatPrice(team.purse_remaining)} — can't afford ${formatPrice(finalPrice)}`)
      return
    }
    const { error } = await supabase.rpc('mark_sold_physical', {
      p_auction_player_id: currentPlayer.id,
      p_team_id:           teamId,
      p_final_price:       finalPrice,
      p_room_id:           room.id,
    })
    if (error) toast.error(error.message)
    else toast.success(`🔨 Sold to ${team?.name} for ${formatPrice(finalPrice)}!`)
  }, [currentPlayer, room, teams])

  const markSold = useCallback(async () => {
    if (!currentPlayer || !room) return
    const { error } = await supabase.rpc('mark_sold', {
      p_auction_player_id: currentPlayer.id,
      p_room_id: room.id,
    })
    if (error) toast.error(error.message)
    else toast.success('Player sold!')
  }, [currentPlayer, room])

  /** Admin: move to next player */
  const nextPlayer = useCallback(async (playerId) => {
    if (!room) return
    const { error } = await supabase.rpc('set_active_player', {
      p_room_id: room.id,
      p_auction_player_id: playerId,
    })
    if (error) toast.error(error.message)
  }, [room])

  /** Admin: mark current player as unsold */
  const markUnsold = useCallback(async () => {
    if (!currentPlayer || !room) return
    const { error } = await supabase
      .from('auction_players')
      .update({ status: 'unsold' })
      .eq('id', currentPlayer.id)
    if (!error) {
      setCurrentPlayer(null)
      await refreshAllPlayers(room.id)
    }
  }, [currentPlayer, room, refreshAllPlayers])

  /** Use a lifeline (winning team rejects their bid) */
  const useLifeline = useCallback(async () => {
    if (!user?.teamId || !currentPlayer || !room) return
    if (currentPlayer.current_bidder_team_id !== user.teamId) {
      toast.error("Only the current highest bidder can use a lifeline")
      return
    }
    const team = teams.find(t => t.id === user.teamId)
    if (!team || team.lifelines <= 0) {
      toast.error('No lifelines remaining!')
      return
    }

    const { error } = await supabase.rpc('use_lifeline', {
      p_auction_player_id: currentPlayer.id,
      p_team_id: user.teamId,
      p_room_id: room.id,
    })
    if (error) toast.error(error.message)
    else toast('🎯 Lifeline used!', { icon: '⚡' })
  }, [user, currentPlayer, teams, room])

  /** Admin: start auction */
  const startAuction = useCallback(async () => {
    if (!room) return
    const { error } = await supabase
      .from('auction_rooms')
      .update({ status: 'active' })
      .eq('id', room.id)
    if (error) toast.error(error.message)
    else toast.success('Auction started!')
  }, [room])

  /** Admin: close auction */
  const closeAuction = useCallback(async () => {
    if (!room) return
    const { error } = await supabase
      .from('auction_rooms')
      .update({ status: 'closed' })
      .eq('id', room.id)
    if (error) toast.error(error.message)
  }, [room])

  const myTeam = teams.find(t => t.id === user?.teamId)
  const isAdmin = user?.isAdmin && room?.admin_team_id === user?.teamId
  const auctionMode = room?.auction_mode || 'virtual'

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  return (
    <AuctionContext.Provider value={{
      user, saveUser, logout,
      room, setRoom,
      teams, myTeam,
      isAdmin,
      auctionMode,
      currentPlayer,
      pendingPlayers,
      soldPlayers,
      bids,
      loading,
      loadRoom,
      placeBid,
      placeBidForTeam,
      markSold,
      markSoldPhysical,
      markUnsold,
      nextPlayer,
      useLifeline,
      startAuction,
      closeAuction,
      refreshTeams: () => room && refreshTeams(room.id),
      refreshAllPlayers: () => room && refreshAllPlayers(room.id),
    }}>
      {children}
    </AuctionContext.Provider>
  )
}

export function useAuction() {
  const ctx = useContext(AuctionContext)
  if (!ctx) throw new Error('useAuction must be used inside AuctionProvider')
  return ctx
}
