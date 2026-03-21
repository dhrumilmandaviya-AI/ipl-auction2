import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import PLAYERS from '../data/players'
import { formatPrice } from '../utils/auction'

export default function TransferWindow() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, room, teams, myTeam, loadRoom, refreshTeams } = useAuction()

  const [offers, setOffers] = useState([])
  const [allSquads, setAllSquads] = useState({}) // teamId -> [auctionPlayer]
  const [showNewOffer, setShowNewOffer] = useState(false)
  const [loading, setLoading] = useState(true)

  // New offer state
  const [targetTeamId, setTargetTeamId] = useState('')
  const [offerType, setOfferType] = useState('direct') // direct | swap
  const [myOfferedPlayerIds, setMyOfferedPlayerIds] = useState([])
  const [requestedPlayerIds, setRequestedPlayerIds] = useState([])
  const [offeredPurse, setOfferedPurse] = useState(0)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId).then(() => {
      loadData()
      subscribeToOffers()
    })
  }, [roomId])

  async function loadData() {
    setLoading(true)
    const [{ data: offerData }, { data: squadData }] = await Promise.all([
      supabase.from('transfer_offers')
        .select('*')
        .eq('auction_room_id', roomId)
        .order('created_at', { ascending: false }),
      supabase.from('auction_players')
        .select('*, players(*)')
        .eq('auction_room_id', roomId)
        .eq('status', 'sold'),
    ])

    if (offerData) setOffers(offerData)
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

  function subscribeToOffers() {
    const channel = supabase
      .channel(`transfers-${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transfer_offers',
        filter: `auction_room_id=eq.${roomId}`
      }, () => loadData())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }

  async function submitOffer() {
    if (!targetTeamId) return toast.error('Select a team to trade with')
    if (myOfferedPlayerIds.length === 0 && offeredPurse === 0)
      return toast.error('You must offer at least one player or some purse')
    if (requestedPlayerIds.length === 0)
      return toast.error('Select at least one player you want in return')

    // Validate foreign player constraints post-trade
    const myCurrentForeign = (allSquads[myTeam?.id] || []).filter(ap => ap.playerData?.is_foreign).length
    const offeringForeign = myOfferedPlayerIds.filter(id => {
      const ap = (allSquads[myTeam?.id] || []).find(p => p.id === id)
      return ap?.playerData?.is_foreign
    }).length
    const gettingForeign = requestedPlayerIds.filter(id => {
      const ap = (allSquads[targetTeamId] || []).find(p => p.id === id)
      return ap?.playerData?.is_foreign
    }).length
    const newForeignCount = myCurrentForeign - offeringForeign + gettingForeign
    if (newForeignCount > 7) {
      return toast.error(`This trade would put you at ${newForeignCount} overseas players (max 7)`)
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('transfer_offers').insert({
        auction_room_id: roomId,
        offering_team_id: myTeam.id,
        receiving_team_id: targetTeamId,
        offer_type: offerType,
        offered_player_ids: myOfferedPlayerIds,
        requested_player_ids: requestedPlayerIds,
        offered_purse: offeredPurse,
        note: note.trim() || null,
        status: 'pending',
      })
      if (error) throw error
      toast.success('Trade offer sent!')
      setShowNewOffer(false)
      resetForm()
      loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to send offer')
    } finally {
      setSubmitting(false)
    }
  }

  async function respondToOffer(offerId, action) {
    if (action === 'accept') {
      const { error } = await supabase.rpc('accept_transfer', { p_offer_id: offerId })
      if (error) toast.error(error.message)
      else {
        toast.success('🤝 Trade accepted! Squads updated.')
        loadData()
        refreshTeams()
      }
    } else {
      const { error } = await supabase.from('transfer_offers')
        .update({ status: action === 'reject' ? 'rejected' : 'withdrawn', updated_at: new Date().toISOString() })
        .eq('id', offerId)
      if (error) toast.error(error.message)
      else {
        toast(action === 'reject' ? 'Offer rejected' : 'Offer withdrawn')
        loadData()
      }
    }
  }

  function resetForm() {
    setTargetTeamId('')
    setMyOfferedPlayerIds([])
    setRequestedPlayerIds([])
    setOfferedPurse(0)
    setNote('')
  }

  function togglePlayer(arr, setArr, id) {
    setArr(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const isTransferOpen = room?.transfer_window_open
  const mySquad = allSquads[myTeam?.id] || []
  const targetSquad = allSquads[targetTeamId] || []
  const otherTeams = teams.filter(t => t.id !== myTeam?.id)

  const incomingOffers = offers.filter(o => o.receiving_team_id === myTeam?.id && o.status === 'pending')
  const outgoingOffers = offers.filter(o => o.offering_team_id === myTeam?.id && o.status === 'pending')
  const completedOffers = offers.filter(o =>
    (o.offering_team_id === myTeam?.id || o.receiving_team_id === myTeam?.id) &&
    o.status !== 'pending'
  ).slice(0, 10)

  if (!isTransferOpen) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="text-7xl mb-6">🔒</div>
            <h2 className="font-display text-4xl text-white/60 mb-3">Transfer Window Closed</h2>
            <p className="text-white/30 font-mono text-sm">
              Admin opens the transfer window after 7 matches.<br />
              Check back soon — trades unlock exciting squad reshuffles!
            </p>
            {/* Admin can open it */}
            {user?.isAdmin && (
              <button
                className="btn-gold mt-6"
                onClick={async () => {
                  await supabase.from('auction_rooms')
                    .update({ transfer_window_open: true })
                    .eq('id', roomId)
                  toast.success('Transfer window opened!')
                  loadRoom(roomId)
                }}
              >
                ⚡ Open Transfer Window (Admin)
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="max-w-screen-xl mx-auto w-full p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl text-gold">Transfer Window</h1>
            <p className="text-white/40 font-mono text-sm">
              Historical points follow the player · Purse + overseas limits apply
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-sold/10 border border-sold/30 rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-sold animate-pulse" />
              <span className="text-sold text-sm font-bold">Window Open</span>
            </div>
            <button
              onClick={() => { setShowNewOffer(true); resetForm() }}
              className="btn-gold"
            >
              + New Offer
            </button>
          </div>
        </div>

        {/* Incoming offers — highlighted */}
        {incomingOffers.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-bold text-gold flex items-center gap-2">
              📬 Incoming Offers
              <span className="bg-gold text-black text-xs px-2 py-0.5 rounded-full font-mono">{incomingOffers.length}</span>
            </h2>
            {incomingOffers.map(offer => (
              <OfferCard
                key={offer.id}
                offer={offer}
                teams={teams}
                allSquads={allSquads}
                myTeamId={myTeam?.id}
                onAccept={() => respondToOffer(offer.id, 'accept')}
                onReject={() => respondToOffer(offer.id, 'reject')}
                isIncoming
              />
            ))}
          </div>
        )}

        {/* Outgoing */}
        {outgoingOffers.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-bold text-white/60">📤 Your Pending Offers</h2>
            {outgoingOffers.map(offer => (
              <OfferCard
                key={offer.id}
                offer={offer}
                teams={teams}
                allSquads={allSquads}
                myTeamId={myTeam?.id}
                onWithdraw={() => respondToOffer(offer.id, 'withdraw')}
                isIncoming={false}
              />
            ))}
          </div>
        )}

        {/* History */}
        {completedOffers.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-bold text-white/40">📋 Trade History</h2>
            {completedOffers.map(offer => (
              <OfferCard
                key={offer.id}
                offer={offer}
                teams={teams}
                allSquads={allSquads}
                myTeamId={myTeam?.id}
                isHistory
              />
            ))}
          </div>
        )}

        {incomingOffers.length === 0 && outgoingOffers.length === 0 && completedOffers.length === 0 && (
          <div className="card p-12 text-center">
            <div className="text-5xl mb-4">🤝</div>
            <h3 className="font-display text-2xl text-white/40 mb-2">No trades yet</h3>
            <p className="text-white/20 font-mono text-sm">Click "New Offer" to propose a trade with another team</p>
          </div>
        )}
      </div>

      {/* New offer modal */}
      <AnimatePresence>
        {showNewOffer && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-bg-deep/90 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto"
            onClick={e => e.target === e.currentTarget && setShowNewOffer(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="card w-full max-w-3xl my-8 p-6 space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-3xl text-gold">New Trade Offer</h2>
                <button onClick={() => setShowNewOffer(false)} className="text-white/30 hover:text-white text-xl">✕</button>
              </div>

              {/* Offer type */}
              <div className="flex gap-2">
                {[
                  { id: 'direct', label: '💰 Direct Trade', desc: 'Player(s) + optional purse for player(s)' },
                  { id: 'swap', label: '🔄 Mutual Swap', desc: 'Exchange players, no purse' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setOfferType(t.id); if (t.id === 'swap') setOfferedPurse(0) }}
                    className={`flex-1 p-3 rounded-xl border text-left transition-all ${offerType === t.id ? 'border-gold bg-gold/10' : 'border-bg-border hover:border-gold/30'}`}
                  >
                    <div className="font-bold text-sm">{t.label}</div>
                    <div className="text-xs text-white/40 mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>

              {/* Target team */}
              <div>
                <label className="text-xs text-white/40 font-mono uppercase tracking-wider block mb-2">Trade With</label>
                <div className="flex gap-2 flex-wrap">
                  {otherTeams.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setTargetTeamId(t.id); setRequestedPlayerIds([]) }}
                      className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${targetTeamId === t.id ? 'bg-gold text-black' : 'border border-bg-border text-white/50 hover:text-white'}`}
                    >
                      {t.name}
                      <span className={`ml-1 text-xs ${targetTeamId === t.id ? 'text-black/50' : 'text-white/20'}`}>
                        ({(allSquads[t.id] || []).length}p)
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Two-column selection */}
              <div className="grid grid-cols-2 gap-4">
                {/* My players to offer */}
                <div>
                  <label className="text-xs text-white/40 font-mono uppercase tracking-wider block mb-2">
                    You Give ({myOfferedPlayerIds.length} selected)
                  </label>
                  <div className="bg-bg-deep rounded-xl p-3 max-h-52 overflow-y-auto space-y-1">
                    {mySquad.map(ap => (
                      <PlayerSelectRow
                        key={ap.id}
                        ap={ap}
                        selected={myOfferedPlayerIds.includes(ap.id)}
                        onToggle={() => togglePlayer(myOfferedPlayerIds, setMyOfferedPlayerIds, ap.id)}
                      />
                    ))}
                    {mySquad.length === 0 && <p className="text-white/20 text-xs text-center py-4">No players in squad</p>}
                  </div>

                  {/* Purse offered (direct trade only) */}
                  {offerType === 'direct' && (
                    <div className="mt-3">
                      <label className="text-xs text-white/40 font-mono uppercase tracking-wider block mb-1">
                        + Purse Sweetener (Lakhs)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={myTeam?.purse_remaining || 0}
                          step={20}
                          value={offeredPurse}
                          onChange={e => setOfferedPurse(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-bg-card border border-bg-border rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-gold/40 outline-none"
                        />
                        <span className="text-xs text-white/30 font-mono whitespace-nowrap">
                          {offeredPurse > 0 ? formatPrice(offeredPurse) : ''}
                        </span>
                      </div>
                      <p className="text-xs text-white/20 mt-1 font-mono">Max: {formatPrice(myTeam?.purse_remaining || 0)}</p>
                    </div>
                  )}
                </div>

                {/* Their players you want */}
                <div>
                  <label className="text-xs text-white/40 font-mono uppercase tracking-wider block mb-2">
                    You Receive ({requestedPlayerIds.length} selected)
                  </label>
                  <div className="bg-bg-deep rounded-xl p-3 max-h-52 overflow-y-auto space-y-1">
                    {targetTeamId ? (
                      targetSquad.length === 0
                        ? <p className="text-white/20 text-xs text-center py-4">Team has no players</p>
                        : targetSquad.map(ap => (
                          <PlayerSelectRow
                            key={ap.id}
                            ap={ap}
                            selected={requestedPlayerIds.includes(ap.id)}
                            onToggle={() => togglePlayer(requestedPlayerIds, setRequestedPlayerIds, ap.id)}
                          />
                        ))
                    ) : (
                      <p className="text-white/20 text-xs text-center py-4">Select a team first</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Trade summary */}
              {(myOfferedPlayerIds.length > 0 || offeredPurse > 0) && requestedPlayerIds.length > 0 && (
                <div className="bg-gold/5 border border-gold/20 rounded-xl p-3 text-sm font-mono">
                  <div className="text-gold font-bold mb-1">Trade Summary</div>
                  <div className="text-white/60 space-y-0.5">
                    <div>You give: {myOfferedPlayerIds.map(id => mySquad.find(ap => ap.id === id)?.playerData?.name).join(', ')}{offeredPurse > 0 ? ` + ${formatPrice(offeredPurse)}` : ''}</div>
                    <div>You get: {requestedPlayerIds.map(id => targetSquad.find(ap => ap.id === id)?.playerData?.name).join(', ')}</div>
                  </div>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="text-xs text-white/40 font-mono uppercase tracking-wider block mb-1">Note (optional)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Fair deal — Bumrah for Rashid + 50L"
                  className="w-full bg-bg-deep border border-bg-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold/40 outline-none"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowNewOffer(false)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={submitOffer} disabled={submitting} className="btn-gold flex-1">
                  {submitting ? 'Sending...' : '🤝 Send Trade Offer'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PlayerSelectRow({ ap, selected, onToggle }) {
  const p = ap.playerData
  const ROLE_CLASS = { BAT: 'role-badge-bat', BWL: 'role-badge-bwl', AR: 'role-badge-ar', WK: 'role-badge-wk' }
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${selected ? 'bg-gold/15 border border-gold/40' : 'hover:bg-bg-elevated'}`}
    >
      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${selected ? 'bg-gold border-gold text-black' : 'border-bg-border'}`}>
        {selected && '✓'}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-bold truncate ${selected ? 'text-gold' : 'text-white'}`}>{p?.name}</div>
        <div className="flex items-center gap-1">
          <span className={`${ROLE_CLASS[p?.role]} text-xs`} style={{ fontSize: '9px', padding: '0 4px' }}>{p?.role}</span>
          {p?.is_foreign && <span style={{ fontSize: '9px' }}>🌍</span>}
        </div>
      </div>
      <div className="text-xs text-gold/70 font-mono flex-shrink-0">{formatPrice(ap.final_price)}</div>
    </button>
  )
}

function OfferCard({ offer, teams, allSquads, myTeamId, onAccept, onReject, onWithdraw, isIncoming, isHistory }) {
  const offeringTeam = teams.find(t => t.id === offer.offering_team_id)
  const receivingTeam = teams.find(t => t.id === offer.receiving_team_id)

  function getPlayerName(id, teamId) {
    const ap = (allSquads[teamId] || []).find(ap => ap.id === id)
    return ap?.playerData?.name || id.slice(0, 8)
  }

  const statusColor = {
    pending: 'text-yellow-400',
    accepted: 'text-sold',
    rejected: 'text-danger',
    withdrawn: 'text-white/30',
  }[offer.status] || 'text-white/40'

  const statusEmoji = {
    pending: '⏳',
    accepted: '✅',
    rejected: '❌',
    withdrawn: '↩️',
  }[offer.status] || '?'

  return (
    <div className={`card p-4 ${isIncoming && !isHistory ? 'border-gold/30 bg-gold/5' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Trade flow */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-bold text-sm">{offeringTeam?.name}</span>
            <span className="text-white/30 text-xs">→</span>
            <span className="font-bold text-sm">{receivingTeam?.name}</span>
            <span className={`text-xs font-mono ml-1 ${statusColor}`}>{statusEmoji} {offer.status}</span>
            {offer.offer_type === 'swap' && <span className="text-xs text-electric border border-electric/30 px-1.5 py-0.5 rounded">Swap</span>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-bg-deep rounded-lg p-2">
              <div className="text-white/30 mb-1">Offering gives:</div>
              {offer.offered_player_ids.map(id => (
                <div key={id} className="text-white/70">{getPlayerName(id, offer.offering_team_id)}</div>
              ))}
              {offer.offered_purse > 0 && (
                <div className="text-gold">+ {formatPrice(offer.offered_purse)}</div>
              )}
            </div>
            <div className="bg-bg-deep rounded-lg p-2">
              <div className="text-white/30 mb-1">Wants in return:</div>
              {offer.requested_player_ids.map(id => (
                <div key={id} className="text-white/70">{getPlayerName(id, offer.receiving_team_id)}</div>
              ))}
            </div>
          </div>

          {offer.note && (
            <div className="mt-2 text-xs text-white/40 italic">"{offer.note}"</div>
          )}
        </div>

        {/* Actions */}
        {!isHistory && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            {isIncoming && offer.status === 'pending' && (
              <>
                <button onClick={onAccept} className="btn-sold text-sm py-1.5 px-4">✓ Accept</button>
                <button onClick={onReject} className="btn-danger text-sm py-1.5 px-4">✕ Reject</button>
              </>
            )}
            {!isIncoming && offer.status === 'pending' && (
              <button onClick={onWithdraw} className="btn-ghost text-sm py-1.5 px-4">↩ Withdraw</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
