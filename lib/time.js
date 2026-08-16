export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function fmtClock(date) {
  if (!date) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

export function fmtTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function fmtDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function fmtDateLong(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// Minutes between two ISO/date values, floored, never negative.
export function minutesBetween(start, end) {
  if (!start || !end) return 0
  const mins = Math.floor((new Date(end) - new Date(start)) / 60000)
  return Math.max(0, mins)
}

// "1h 42m" style duration string from a minute count.
export function fmtDuration(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Live "since 3:05 PM" style label for an in-progress shift.
export function fmtSince(startIso) {
  return `since ${fmtTime(startIso)}`
}
