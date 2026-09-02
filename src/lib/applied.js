export const APPLIED_STORAGE_KEY = 'applied'

// '신청했음' 체크 상태 (공고 id 배열). S1(노란 카드)과 S2(목록)가 같은 저장소를 읽는다.
export function readAppliedSet() {
  try {
    const raw = localStorage.getItem(APPLIED_STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function writeAppliedSet(set) {
  localStorage.setItem(APPLIED_STORAGE_KEY, JSON.stringify([...set]))
}

export function clearApplied() {
  localStorage.setItem(APPLIED_STORAGE_KEY, '[]')
}
