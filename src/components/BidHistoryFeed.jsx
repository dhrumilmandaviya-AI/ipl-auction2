import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { formatPrice } from '../utils/auction'

export default function BidHistoryFeed({ auctionPlayerId, teams }) {
  const [bids, setBids] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!auctionPlayerId) { setBids([]); return }

    // Fetch existing bids
    supabase
      .from('bids')
      .select('*, team:teams(name)')
      .eq('auction_player_id', auctionPlayerId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setBids(data)
      })

    // Subscribe to new bids
    const channel = supabase
      .channel(`bids-${auctionPlayerId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bids',
        filter: `auction_player_id=eq.${auctionPlayerId}`,
      }, async (payload) => {
        // Fetch team name for the new bid
        const { data: team } = await supabase
          .from('teams')
          .select('name')
          .eq('id', payload.new.team_id)
          .single()

        const newBid = { ...payload.new, team }
        setBids(prev => [newBid, ...prev].slice(0, 20))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [auctionPlayerId])

  if (!auctionPlayerId) return null

  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-xs uppercase tracking-wider text-white/50 font-bold">Bid History</h3>
        {bids.length > 0 && (
          <span className="text-xs text-white/30 font-mono">{bids.length} bids</span>
        )}
      </div>

      {bids.length === 0 && (
        <div className="text-center text-white/20 font-mono text-xs py-4">
          Waiting for first bid...
        </div>
      )}

      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        <AnimatePresence initial={false}>
          {bids.map((bid, i) => {
            const isTop = i === 0
            const time = new Date(bid.created_at).toLocaleTimeString('en-IN', {
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            })
            return (
              <motion.div
                key={bid.id}
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                  isTop
                    ? 'bg-gold/15 border border-gold/30'
                    : 'bg-bg-deep border border-bg-border/40'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isTop && <div className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0 animate-pulse" />}
                  <span className={`font-bold truncate ${isTop ? 'text-gold' : 'text-white/70'}`}>
                    {bid.team?.name || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`font-display text-lg ${isTop ? 'text-gold' : 'text-white/50'}`}>
                    {formatPrice(bid.amount)}
                  </span>
                  <span className="text-white/20 font-mono text-xs">{time}</span>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
