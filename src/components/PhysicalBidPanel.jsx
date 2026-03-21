import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuction } from '../contexts/AuctionContext'
import { formatPrice, BASE_PRICE } from '../utils/auction'
import PLAYERS from '../data/players'

export default function PhysicalBidPanel({ currentPlayer }) {
  const { teams, markSoldPhysical, markUnsold, soldPlayers } = useAuction()
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [selling, setSelling] = useState(false)

  useEffect(() => {
    setSelectedTeamId('')
    setPriceInput('')
    setConfirming(false)
  }, [currentPlayer?.id])

  if (!currentPlayer) return null

  const playerName = currentPlayer.players?.name || 'Player'
  const isPlayerForeign = currentPlayer.players?.is_foreign
  const iplTeam = currentPlayer.players?.team
  const finalPriceLakhs = priceInput ? Math.round(parseFloat(priceInput) * 100) : 0
  const selectedTeam = teams.find(t => t.id === selectedTeamId)

  // Count how many players from this IPL team each fantasy team already has
  function iplTeamCount(teamId) {
    if (!iplTeam) return 0
    return (soldPlayers || []).filter(ap =>
      ap.sold_to_team_id === teamId &&
      PLAYERS.find(p => p.id === ap.player_id)?.team === iplTeam
    ).length
  }

  function teamStatus(team) {
    if (team.player_count >= 17) return { blocked: true, reason: 'Squad full (17/17)' }
    if (isPlayerForeign && team.foreign_count >= 7) return { blocked: true, reason: 'Overseas limit (7/7)' }
    if (iplTeam && iplTeamCount(team.id) >= 4) return { blocked: true, reason: `${iplTeam} limit (4/4)` }
    return { blocked: false, reason: null }
  }

  const canConfirm =
    selectedTeamId &&
    finalPriceLakhs >= BASE_PRICE &&
    selectedTeam &&
    selectedTeam.purse_remaining >= finalPriceLakhs &&
    !teamStatus(selectedTeam).blocked

  async function handleSell() {
    if (!canConfirm || selling) return
    setSelling(true)
    await markSoldPhysical(selectedTeamId, finalPriceLakhs)
    setSelling(false)
    setConfirming(false)
  }

  return (
    <div className="card p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-bg-border">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
        <span className="font-bold text-sm text-yellow-400">Physical Auction</span>
        <span className="text-xs text-white/25 font-mono ml-auto">Admin entry</span>
      </div>

      {/* Player */}
      <div className="bg-bg-deep rounded-xl px-4 py-3">
        <div className="text-xs text-white/30 font-mono uppercase tracking-wider mb-0.5">Now Bidding</div>
        <div className="font-display text-2xl text-white">{playerName}</div>
        <div className="text-xs text-white/30 font-mono">
          Base: ₹{BASE_PRICE}L{isPlayerForeign ? ' · 🌍 Overseas' : ''}
        </div>
      </div>

      {/* Step 1: Team selector */}
      <div>
        <div className="text-xs text-white/40 font-mono uppercase tracking-wider mb-2">
          Step 1 — Winning team
        </div>
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {teams.map(team => {
            const { blocked, reason } = teamStatus(team)
            const isSel = team.id === selectedTeamId
            return (
              <button
                key={team.id}
                onClick={() => !blocked && setSelectedTeamId(isSel ? '' : team.id)}
                disabled={blocked}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                  isSel
                    ? 'border-gold bg-gold/15'
                    : blocked
                    ? 'border-bg-border/50 opacity-40 cursor-not-allowed'
                    : 'border-bg-border hover:border-gold/40 hover:bg-bg-elevated'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSel ? 'border-gold' : 'border-bg-border'}`}>
                      {isSel && <div className="w-2 h-2 rounded-full bg-gold" />}
                    </div>
                    <span className={`font-bold text-sm ${isSel ? 'text-gold' : blocked ? 'text-white/30' : 'text-white/80'}`}>
                      {team.name}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xs font-mono font-bold ${team.purse_remaining < 100 ? 'text-danger' : 'text-sold'}`}>
                      {formatPrice(team.purse_remaining)}
                    </div>
                    <div className="text-xs text-white/25 font-mono">
                      {team.player_count}p · {team.foreign_count}🌍
                      {iplTeam ? ` · ${iplTeamCount(team.id)}/4 ${iplTeam}` : ''}
                    </div>
                  </div>
                </div>
                {blocked && reason && (
                  <div className="text-xs text-danger/70 font-mono mt-1 ml-6">{reason}</div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Step 2: Price input */}
      <AnimatePresence>
        {selectedTeamId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="text-xs text-white/40 font-mono uppercase tracking-wider mb-2">
              Step 2 — Final sold price
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display text-xl text-white/40">₹</span>
              <input
                type="number"
                min={0.2}
                step={0.25}
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                placeholder="e.g. 14.5"
                className="w-full bg-bg-deep border border-bg-border rounded-xl pl-9 pr-16 py-3 text-white font-display text-2xl focus:border-gold/50 outline-none tracking-wide transition-colors"
                onKeyDown={e => e.key === 'Enter' && canConfirm && setConfirming(true)}
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 font-mono text-sm">Cr</span>
            </div>
            {priceInput && (
              <div className="mt-1.5 text-xs font-mono">
                {finalPriceLakhs < BASE_PRICE
                  ? <span className="text-danger">Minimum is ₹{BASE_PRICE}L</span>
                  : selectedTeam && finalPriceLakhs > selectedTeam.purse_remaining
                  ? <span className="text-danger">{selectedTeam.name} only has {formatPrice(selectedTeam.purse_remaining)}</span>
                  : <span className="text-sold">= {formatPrice(finalPriceLakhs)} ✓</span>
                }
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SOLD button */}
      <AnimatePresence>
        {canConfirm && !confirming && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setConfirming(true)}
            className="w-full py-4 rounded-xl font-display text-2xl bg-sold text-black hover:bg-emerald-400 transition-all glow-sold"
          >
            🔨 SOLD — {selectedTeam?.name?.split(' ')[0]} for {formatPrice(finalPriceLakhs)}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Confirmation step — prevents accidental taps */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="bg-sold/10 border border-sold/40 rounded-xl p-4 space-y-3"
          >
            <div className="text-center">
              <div className="text-3xl mb-1">🔨</div>
              <div className="font-bold text-sm text-white">Confirm sale?</div>
              <div className="text-white/60 text-sm mt-1 font-mono">
                <span className="text-gold font-bold">{playerName}</span>
                {' → '}
                <span className="font-bold text-white">{selectedTeam?.name}</span>
              </div>
              <div className="font-display text-4xl text-gold mt-1">{formatPrice(finalPriceLakhs)}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 rounded-lg border border-bg-border text-white/50 hover:text-white text-sm font-bold transition-all"
              >
                ← Edit
              </button>
              <button
                onClick={handleSell}
                disabled={selling}
                className="flex-1 py-2.5 rounded-lg bg-sold text-black font-bold text-sm hover:bg-emerald-400 transition-all disabled:opacity-50"
              >
                {selling
                  ? <span className="flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Saving...
                    </span>
                  : '✓ Confirm SOLD'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pass */}
      {!confirming && (
        <button
          onClick={markUnsold}
          className="w-full text-xs text-white/20 hover:text-white/45 font-mono transition-colors py-1"
        >
          Pass — mark as unsold
        </button>
      )}
    </div>
  )
}
