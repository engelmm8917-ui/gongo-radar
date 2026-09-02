// ISO 문자열 endAt 이 오늘부터 며칠 남았는지. 파싱 실패 시 null.
export function daysUntil(isoString) {
  if (!isoString) return null
  const end = new Date(isoString)
  if (Number.isNaN(end.getTime())) return null
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((endMidnight - todayMidnight) / 86400000)
}
