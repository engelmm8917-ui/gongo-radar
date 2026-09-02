export function formatAmount(value) {
  if (value === null || value === undefined) return '미표기'
  return `기업당 추정 ${Math.round(value / 10000).toLocaleString('ko-KR')}만원`
}

function manwonToEokString(manwon) {
  const eok = Math.floor(manwon / 10000)
  const rest = manwon % 10000
  if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString('ko-KR')}만원`
  if (eok > 0) return `${eok}억원`
  return `${manwon.toLocaleString('ko-KR')}만원`
}

// 원 단위 합계를 "55억 3,000만원" 형태로 (억 단위로 읽히게).
export function formatKoreanAmountSum(value) {
  return manwonToEokString(Math.round((value ?? 0) / 10000))
}

// 개별 금액을 "1억 833만원" 형태로. 1억 미만은 만원 그대로.
export function formatAmountEok(value) {
  if (value === null || value === undefined) return '미표기'
  return manwonToEokString(Math.round(value / 10000))
}

// 나눗셈 계산식용 표기. "10억" 처럼 억 단위가 딱 떨어지면 '원' 을 붙이지 않는다.
export function formatEokTerm(value) {
  if (value === null || value === undefined) return ''
  const manwon = Math.round(value / 10000)
  const eok = Math.floor(manwon / 10000)
  const rest = manwon % 10000
  if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString('ko-KR')}만원`
  if (eok > 0) return `${eok}억`
  return `${manwon.toLocaleString('ko-KR')}만원`
}

export function formatDate(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}
