import { useState, useEffect, useRef, useCallback } from 'react'
import { TIMER_SECONDS, DRAMA_TEXTS } from '../utils/auction'

const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function CountdownTimer({ lastBidAt, onExpire, isAdmin, onSold }) {
  const [seconds, setSeconds] = useState(TIMER_SECONDS)
  const [phase, setPhase] = useState('bidding')
  const [dramaText, setDramaText] = useState('')
  const expiredRef   = useRef(false)
  const soldCalledRef = useRef(false)  // prevent double markSold
  const intervalRef  = useRef(null)
  const timeoutsRef  = useRef([])
  // Keep onExpire in a ref so it never goes in the dependency array
  const onExpireRef  = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire }, [onExpire])

  function clearAllTimeouts() {
    timeoutsRef.current.forEach(t => clearTimeout(t))
    timeoutsRef.current = []
  }

  useEffect(() => {
    // Reset everything when player changes (including when lastBidAt goes null)
    clearInterval(intervalRef.current)
    clearAllTimeouts()
    expiredRef.current = false
    soldCalledRef.current = false
    setSeconds(TIMER_SECONDS)
    setPhase('bidding')
    setDramaText('')

    if (!lastBidAt) return

    function tick() {
      const elapsed = (Date.now() - new Date(lastBidAt).getTime()) / 1000
      const remaining = Math.max(0, TIMER_SECONDS - elapsed)
      setSeconds(remaining)

      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true
        clearInterval(intervalRef.current)
        setPhase('going_once')

        const t1 = setTimeout(() => setPhase('going_twice'), 2000)
        const t2 = setTimeout(() => {
          const text = DRAMA_TEXTS[Math.floor(Math.random() * DRAMA_TEXTS.length)]
          setDramaText(text)
          setPhase('drama')
        }, 4000)
        const t3 = setTimeout(() => {
          setPhase('sold')
          if (!soldCalledRef.current) {
            soldCalledRef.current = true
            onExpireRef.current?.()
          }
        }, 9000)
        timeoutsRef.current = [t1, t2, t3]
      }
    }

    tick()
    intervalRef.current = setInterval(tick, 100)

    return () => {
      clearInterval(intervalRef.current)
      clearAllTimeouts()
    }
  }, [lastBidAt]) // ← onExpire intentionally NOT here

  const progress = Math.max(0, Math.min(1, seconds / TIMER_SECONDS))
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress)
  const timerColor = seconds > 6 ? '#10b981' : seconds > 3 ? '#f59e0b' : '#ef4444'
  const isCritical = seconds <= 3 && phase === 'bidding'

  function handleSellEarly() {
    clearInterval(intervalRef.current)
    clearAllTimeouts()
    setPhase('sold')
    if (!soldCalledRef.current) {
      soldCalledRef.current = true
      onExpireRef.current?.()
    }
  }

  if (phase === 'sold') {
    return (
      <div className="flex flex-col items-center gap-3 animate-sold-pop">
        <div className="text-7xl">🔨</div>
        <div className="font-display text-5xl text-sold glow-sold px-6 py-2 rounded-lg">
          SOLD!
        </div>
        {isAdmin && (
          <button onClick={onSold} className="btn-sold mt-2">
            Confirm Sale & Continue
          </button>
        )}
      </div>
    )
  }

  if (phase === 'going_once' || phase === 'going_twice' || phase === 'drama') {
    const text = phase === 'going_once' ? 'Going once...' :
                 phase === 'going_twice' ? 'Going twice...' : dramaText
    return (
      <div className="flex flex-col items-center gap-3 animate-countdown-pulse">
        <div className="text-5xl">{phase === 'drama' ? '👀' : '🔨'}</div>
        <div className="font-display text-3xl text-gold text-center px-4">{text}</div>
        <div className="text-white/40 font-mono text-xs tracking-widest uppercase animate-pulse">
          Last chance to bid...
        </div>
        {isAdmin && (
          <button onClick={handleSellEarly} className="btn-sold mt-1 text-sm py-2">
            🔨 Sell Now
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="arc-timer w-full h-full" viewBox="0 0 120 120">
          <circle className="arc-timer-track" cx="60" cy="60" r={RADIUS} />
          <circle
            className="arc-timer-fill"
            cx="60" cy="60" r={RADIUS}
            stroke={timerColor}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className={`absolute inset-0 flex flex-col items-center justify-center ${isCritical ? 'animate-countdown-pulse' : ''}`}>
          <span className="font-display text-5xl leading-none" style={{ color: timerColor }}>
            {Math.ceil(seconds)}
          </span>
          <span className="font-mono text-xs text-white/30 uppercase tracking-wider">secs</span>
        </div>
      </div>
      {isAdmin && (
        <button
          onClick={handleSellEarly}
          className="text-xs text-white/30 hover:text-gold border border-bg-border hover:border-gold/30 px-3 py-1 rounded transition-all"
        >
          🔨 Sell Early
        </button>
      )}
    </div>
  )
}
