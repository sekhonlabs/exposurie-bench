import { enqueue, pending } from './queue.js'

const ZONE = 'Europe/Lisbon'
const SATURDAY = 6
const HOUR = 8

const lisbon = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const partsOf = (date) =>
  Object.fromEntries(lisbon.formatToParts(date).map((p) => [p.type, Number(p.value)]))

function offsetMs(date) {
  const p = partsOf(date)
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    Math.floor(date.getTime() / 1000) * 1000
  )
}

// Saturday 08:00 on the Lisbon calendar, as a UTC instant. The offset is read
// for that date, so the clock changes in March and October land right.
export function nextDigestTime(from = new Date()) {
  const p = partsOf(from)
  const today = Date.UTC(p.year, p.month - 1, p.day)
  const weekday = new Date(today).getUTCDay()
  for (let add = 0; add <= 7; add += 1) {
    if ((weekday + add) % 7 !== SATURDAY) continue
    const wall = today + add * 86_400_000 + HOUR * 3_600_000
    const at = new Date(wall - offsetMs(new Date(wall)))
    if (at > from) return at
  }
}

export function scheduleFirstDigest(db, now = new Date()) {
  if (pending(db, 'weekly_digest')) return null
  return enqueue(db, 'weekly_digest', {}, { runAt: nextDigestTime(now) })
}
