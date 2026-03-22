import { useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuction } from '../contexts/AuctionContext'
import { getNextBidAmount, isValidCustomBid, formatPrice, PURSE } from '../utils/auction'

export default function BidPanel({ currentPlayer }) {
  const { placeBid, useLifeline, myTeam, user } = useAuction()
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [bidding, setBidding] = useState(false)

  if (!currentPlayer || !myTeam) return null

  const currentBid = currentPlayer.current_bid || 0
  const nextBid = getNextBidAmount(currentBid)
  const isTopBidder = currentPlayer.current_bidder_team_id === myTeam.id
  const canAffordNext = myTeam.purse_remaining >= nextBid
  const isPlayerForeign = currentPlayer.players?.is_foreign
  const foreignFull = false // no overseas cap
  const squadFull = false // no squad cap
  const canBid = !isTopBidder && canAffordNext && !foreignFull && !squadFull

  const pursePercent = Math.round((myTeam.purse_remaining / PURSE) * 100)

  async function handleBid(amount) {
    if (bidding) return
    setBidding(true)
    await placeBid(amount)
    setTimeout(() => setBidding(false), 800)
  }

  async function handleCustomBid() {
    const amount = Math.round(parseFloat(customInput) * 100) // input in Cr, convert to L
    if (isNaN(amount)) return toast.error('Enter a valid amount')
    const { valid, reason } = isValidCustomBid(amount, currentBid)
    if (!valid) return toast.error(reason)
    setCustomInput('')
    setShowCustom(false)
    await handleBid(amount)
  }

  // Quick-bid presets (next 3 valid increments)
  const quickBids = [nextBid]
  let temp = nextBid
  for (let i = 0; i < 2; i++) {
    temp = getNextBidAmount(temp)
    quickBids.push(temp)
  }

  return (
    <div className="card p-4 space-y-4">
      {/* Purse tracker */}
      <div>
        <div className="flex justify-between text-xs font-mono text-white/40 mb-1">
          <span>PURSE REMAINING</span>
          <span>{pursePercent}%</span>
        </div>
        <div className="h-2 bg-bg-deep rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pursePercent}%`,
              background: pursePercent > 50 ? '#10b981' : pursePercent > 25 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="font-display text-xl text-white">{formatPrice(myTeam.purse_remaining)}</span>
          <span className="text-white/30 font-mono">{myTeam.player_count} players</span>
        </div>
      </div>

      {/* Status */}
      {isTopBidder && (
        <div className="bg-gold/10 border border-gold/30 rounded-lg p-3 text-center">
          <span className="text-gold font-bold text-sm">⚡ You're the highest bidder!</span>
        </div>
      )}
      {squadFull && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-center text-danger text-sm">
          
        </div>
      )}
      {foreignFull && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center text-yellow-500 text-sm">
          🌍 Foreign player limit reached (7/7)
        </div>
      )}

      {/* Main bid button */}
      {!isTopBidder && !squadFull && !foreignFull && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => handleBid(nextBid)}
          disabled={!canBid || bidding}
          className={`w-full py-4 rounded-xl font-display text-3xl transition-all ${
            canBid
              ? 'bg-gold text-black hover:bg-gold-bright glow-gold animate-pulse-gold'
              : 'bg-bg-elevated text-white/20 cursor-not-allowed'
          }`}
        >
          {bidding ? '...' : `BID ${formatPrice(nextBid)}`}
        </motion.button>
      )}

      {/* Quick bid presets */}
      {canBid && (
        <div className="flex gap-2">
          {quickBids.slice(1).map(amt => (
            <button
              key={amt}
              onClick={() => handleBid(amt)}
              disabled={myTeam.purse_remaining < amt || bidding}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                myTeam.purse_remaining >= amt
                  ? 'border border-gold/30 text-gold hover:bg-gold/10'
                  : 'border border-bg-border text-white/20 cursor-not-allowed'
              }`}
            >
              {formatPrice(amt)}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="flex-1 py-2 rounded-lg text-sm font-bold border border-bg-border text-white/40 hover:border-electric/40 hover:text-electric transition-all"
          >
            Custom
          </button>
        </div>
      )}

      {/* Custom bid input */}
      {showCustom && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-mono">₹</span>
            <input
              type="number"
              step="0.25"
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              placeholder="Cr (e.g. 1.5)"
              className="w-full bg-bg-deep border border-bg-border rounded-lg pl-7 pr-3 py-2 text-white font-mono text-sm focus:border-gold/50 outline-none"
              onKeyDown={e => e.key === 'Enter' && handleCustomBid()}
            />
          </div>
          <button onClick={handleCustomBid} className="btn-gold px-4 text-sm">Bid</button>
        </motion.div>
      )}

      {/* Lifeline */}
      <div className="flex items-center justify-between pt-2 border-t border-bg-border">
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                i < myTeam.lifelines
                  ? 'border-yellow-500 bg-yellow-500/20 text-yellow-500'
                  : 'border-bg-border text-bg-border'
              }`}
            >
              ⚡
            </div>
          ))}
          <span className="text-xs text-white/30 font-mono ml-1 self-center">lifelines</span>
        </div>
        {isTopBidder && myTeam.lifelines > 0 && (
          <button
            onClick={useLifeline}
            className="text-xs font-bold text-yellow-500 border border-yellow-500/30 hover:bg-yellow-500/10 px-3 py-1 rounded transition-all"
          >
            ⚡ Use Lifeline
          </button>
        )}
      </div>
    </div>
  )
}
