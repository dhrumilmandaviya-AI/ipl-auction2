import { useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'
import PurseTicker from '../components/PurseTicker'
import PlayerCard from '../components/PlayerCard'
import CountdownTimer from '../components/CountdownTimer'
import BidPanel from '../components/BidPanel'
import PhysicalBidPanel from '../components/PhysicalBidPanel'
import PlayerQueue from '../components/PlayerQueue'
import BidHistoryFeed from '../components/BidHistoryFeed'
import PLAYERS from '../data/players'
import { ROLE_CONFIG } from '../utils/auction'

const ROLE_CLASS = { BAT: 'role-badge-bat', BWL: 'role-badge-bwl', AR: 'role-badge-ar', WK: 'role-badge-wk' }

/** Seeded shuffle — same random order for everyone in the room per player */
function seededSample(arr, n, seed) {
  const copy = [...arr]
  let s = seed
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

export default function AuctionRoom() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const {
    user, room, loading, loadRoom,
    currentPlayer, pendingPlayers, teams,
    markSold, markUnsold, nextPlayer,
    isAdmin, auctionMode,
  } = useAuction()
  const prevPlayerRef = useRef(null)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadRoom(roomId)
  }, [roomId])

  // Confetti on sold
  useEffect(() => {
    if (!currentPlayer) return
    const prevId = prevPlayerRef.current
    if (prevId && prevId !== currentPlayer.id) {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } })
    }
    prevPlayerRef.current = currentPlayer?.id
  }, [currentPlayer?.id])

  // Randomly sample 4 upcoming players — seed changes with each new player
  const upcomingPreview = useMemo(() => {
    if (!pendingPlayers.length) return []
    const seed = currentPlayer?.id
      ? currentPlayer.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      : 42
    return seededSample(pendingPlayers, 4, seed).map(ap => ({
      ...ap,
      playerData: PLAYERS.find(p => p.id === ap.player_id) || ap.players,
    }))
  }, [pendingPlayers, currentPlayer?.id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="font-display text-5xl text-gold animate-pulse mb-4">🏏</div>
          <p className="text-white/40 font-mono animate-pulse">Loading auction room...</p>
        </div>
      </div>
    )
  }

  const topBidder = teams.find(t => t.id === currentPlayer?.current_bidder_team_id)

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <PurseTicker />

      {/* Mode / status banners */}
      {auctionMode === 'physical' && room?.status === 'active' && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 text-center py-2 text-yellow-400 font-mono text-xs flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />
          Physical Auction Mode — Admin is entering bids live
        </div>
      )}
      {room?.status === 'waiting' && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 text-center py-3 text-yellow-500 font-mono text-sm">
          ⏳ Waiting for admin to start the auction...
          {isAdmin && (
            <button
              onClick={() => useAuction().startAuction()}
              className="ml-4 bg-yellow-500 text-black font-bold px-4 py-1 rounded text-sm hover:bg-yellow-400 transition-all"
            >
              Start Auction
            </button>
          )}
        </div>
      )}
      {room?.status === 'closed' && (
        <div className="bg-sold/10 border-b border-sold/30 text-center py-3 text-sold font-mono text-sm">
          🏆 Auction complete! Check the leaderboard.
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 max-w-screen-2xl mx-auto w-full p-4 grid grid-cols-1 lg:grid-cols-[1fr_360px_280px] gap-4">

        {/* CENTER: Player spotlight + timer + upcoming */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {currentPlayer ? (
              <motion.div key={currentPlayer.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <PlayerCard
                  player={currentPlayer.players}
                  currentBid={currentPlayer.current_bid}
                  topBidderName={topBidder?.name}
                />
              </motion.div>
            ) : (
              <div className="card p-12 text-center rounded-2xl">
                <div className="text-6xl mb-4">🏏</div>
                <h2 className="font-display text-3xl text-white/40">No Player Up</h2>
                <p className="text-white/20 font-mono text-sm mt-2">
                  {isAdmin ? 'Select a player from the queue →' : 'Waiting for next player...'}
                </p>
              </div>
            )}
          </AnimatePresence>

          {/* Timer + admin pass button */}
          {currentPlayer && room?.status === 'active' && (
            <div className="card p-6 flex flex-col items-center gap-3">
              <CountdownTimer
                lastBidAt={currentPlayer.last_bid_at}
                isAdmin={isAdmin}
                onExpire={async () => { if (isAdmin && currentPlayer.current_bid > 0) await markSold() }}
                onSold={async () => { if (isAdmin && currentPlayer.current_bid > 0) await markSold() }}
              />
              {isAdmin && (
                <button
                  onClick={markUnsold}
                  className="text-xs text-white/25 hover:text-white/55 border border-bg-border hover:border-bg-border/80 px-4 py-1.5 rounded-lg font-mono transition-all"
                >
                  Pass — mark unsold
                </button>
              )}
            </div>
          )}

          {/* ── Upcoming Players (random sample) ── */}
          {upcomingPreview.length > 0 && room?.status === 'active' && (
            <div className="card p-3">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-white/35 uppercase tracking-wider">Coming Up</span>
                  <span className="text-xs text-white/20 font-mono">(random preview · {pendingPlayers.length} remaining)</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {upcomingPreview.map((ap, i) => {
                  const p = ap.playerData
                  if (!p) return null
                  const rc = ROLE_CLASS[p.role] || ROLE_CLASS.BAT
                  return (
                    <motion.div
                      key={ap.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      onClick={() => isAdmin && nextPlayer(ap.id)}
                      className={`bg-bg-deep border border-bg-border rounded-xl p-3 transition-all ${
                        isAdmin ? 'cursor-pointer hover:border-gold/40 hover:bg-bg-elevated group' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <span className={`${rc} text-xs`} style={{ fontSize: '9px', padding: '1px 5px' }}>{p.role}</span>
                        {p.is_foreign && <span className="text-xs leading-none">🌍</span>}
                      </div>
                      <div className="font-bold text-sm leading-tight truncate">{p.name}</div>
                      <div className="text-xs text-white/30 font-mono mt-0.5">{p.team}</div>
                      {isAdmin && (
                        <div className="text-xs text-white/0 group-hover:text-gold/70 font-mono mt-1.5 transition-colors">
                          Up next →
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Bid controls + history */}
        <div className="space-y-4">
          {room?.status === 'active' && currentPlayer && (() => {
            if (auctionMode === 'physical') {
              if (isAdmin) return <PhysicalBidPanel currentPlayer={currentPlayer} />
              return (
                <div className="card p-5 text-center border-yellow-500/20 bg-yellow-500/5">
                  <div className="text-3xl mb-2">🔨</div>
                  <div className="font-bold text-yellow-400 text-sm mb-1">Physical Auction</div>
                  <div className="text-xs text-white/40 font-mono">
                    Bidding is happening in the room.<br/>
                    Watch this screen for live updates.
                  </div>
                </div>
              )
            }
            return <BidPanel currentPlayer={currentPlayer} />
          })()}
          <BidHistoryFeed auctionPlayerId={currentPlayer?.id} teams={teams} />
        </div>

        {/* FAR RIGHT: Player queue */}
        <div className="hidden lg:flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
          <PlayerQueue onSelectPlayer={ap => nextPlayer(ap.id)} />
        </div>
      </div>
    </div>
  )
}
