// All prices in LAKHS (1 Cr = 100 L)

export const BASE_PRICE = 20 // 20 Lakhs
export const PURSE = 10000  // 100 Cr in Lakhs
export const MAX_PLAYERS = 17
export const MIN_PLAYERS = 14
export const MAX_FOREIGN = 7
export const MAX_FOREIGN_XI = 5
export const MAX_XI = 11
export const TIMER_SECONDS = 10
export const LIFELINES_PER_TEAM = 3

/** Returns the minimum valid next bid given current highest bid */
export function getNextBidAmount(currentBid) {
  if (currentBid === 0) return BASE_PRICE
  if (currentBid < 200) return currentBid + 20
  if (currentBid < 700) return currentBid + 25
  return currentBid + 50
}

/** Validates a custom bid amount */
export function isValidCustomBid(amount, currentBid) {
  const min = getNextBidAmount(currentBid)
  if (amount < min) return { valid: false, reason: `Minimum bid is ${formatPrice(min)}` }

  // Check increment is valid
  if (amount < 200 && amount % 20 !== 0)
    return { valid: false, reason: 'Bids below ₹2Cr must be in multiples of ₹20L' }
  if (amount >= 200 && amount < 700 && (amount - 200) % 25 !== 0) {
    // Allow any amount that is min + multiple of 25
    const nearestValid = Math.ceil((amount - 200) / 25) * 25 + 200
    return { valid: false, reason: `Try ₹${formatPrice(nearestValid)} instead` }
  }
  if (amount >= 700 && (amount - 700) % 50 !== 0) {
    const nearestValid = Math.ceil((amount - 700) / 50) * 50 + 700
    return { valid: false, reason: `Try ${formatPrice(nearestValid)} instead` }
  }
  return { valid: true }
}

/** Format lakhs to display string */
export function formatPrice(lakhs) {
  if (!lakhs && lakhs !== 0) return '—'
  if (lakhs === 0) return '₹0'
  if (lakhs >= 100) {
    const cr = lakhs / 100
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2)}Cr`
  }
  return `₹${lakhs}L`
}

/** Get seconds remaining from last_bid_at timestamp */
export function getSecondsRemaining(lastBidAt) {
  if (!lastBidAt) return null
  const elapsed = (Date.now() - new Date(lastBidAt).getTime()) / 1000
  return Math.max(0, TIMER_SECONDS - elapsed)
}

/** Role display config */
export const ROLE_CONFIG = {
  BAT: { label: 'Batsman', class: 'role-badge-bat', color: '#3b82f6' },
  BWL: { label: 'Bowler', class: 'role-badge-bwl', color: '#ef4444' },
  AR:  { label: 'All-Rounder', class: 'role-badge-ar', color: '#10b981' },
  WK:  { label: 'Wicket Keeper', class: 'role-badge-wk', color: '#8b5cf6' },
}

/** IPL team abbreviations */
export const TEAM_COLORS = {
  'MI':   { bg: '#004ba0', text: '#fff', name: 'Mumbai Indians' },
  'CSK':  { bg: '#ffc72c', text: '#000', name: 'Chennai Super Kings' },
  'RCB':  { bg: '#c8102e', text: '#fff', name: 'Royal Challengers Bengaluru' },
  'KKR':  { bg: '#2e0854', text: '#f9cd00', name: 'Kolkata Knight Riders' },
  'DC':   { bg: '#004c97', text: '#ef4444', name: 'Delhi Capitals' },
  'SRH':  { bg: '#f26522', text: '#fff', name: 'Sunrisers Hyderabad' },
  'RR':   { bg: '#ea1d8f', text: '#fff', name: 'Rajasthan Royals' },
  'PBKS': { bg: '#aa4545', text: '#fff', name: 'Punjab Kings' },
  'LSG':  { bg: '#00adef', text: '#fff', name: 'Lucknow Super Giants' },
  'GT':   { bg: '#1c1c1c', text: '#d4af37', name: 'Gujarat Titans' },
}

/** Barrel animation fun texts */
export const DRAMA_TEXTS = [
  'Looking around the room... 👀',
  'Any takers? Going, going...',
  "Don't let this one slip away! 🏏",
  'The crowd holds its breath...',
  'Is that your final answer?',
  'Last chance to make history!',
  'The gavel is trembling... 🔨',
  'Anyone? Anyone at all?',
  'A steal at this price! 💸',
  'Make your move before it\'s too late...',
]

export function getAdminCode(roomId) {
  return `ADMIN_${roomId?.slice(-4)?.toUpperCase()}`
}
