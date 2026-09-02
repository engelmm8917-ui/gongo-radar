// K-Startup 공고 API 정찰 스크립트 — 최근 6개월치 공고를 전부 받아 필드별 분포를 찍는다.
// 실행: node scripts/recon.mjs
// 파일 저장은 하지 않는다. 콘솔 출력만 한다.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ENDPOINT =
  'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01'

function loadEnvLocal() {
  const path = join(ROOT, '.env.local')
  if (!existsSync(path)) {
    throw new Error('.env.local 파일이 없습니다.')
  }
  const text = readFileSync(path, 'utf-8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const env = loadEnvLocal()
const RAW_KEY = env.KSTARTUP_KEY
if (!RAW_KEY) {
  throw new Error('.env.local 에 KSTARTUP_KEY 가 없습니다.')
}
// .env.local 에는 공공데이터포털의 Encoding key(퍼센트 인코딩된 형태)가 들어있을 수 있다.
// URLSearchParams 는 값을 다시 퍼센트 인코딩하므로, 이미 인코딩된 문자열을 그대로 넘기면
// 이중 인코딩되어 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 난다. 그래서 항상 한 번 디코딩한
// "Decoding key" 형태로 맞춘 뒤 URLSearchParams 에 넘긴다.
const KEY = /%[0-9A-Fa-f]{2}/.test(RAW_KEY) ? decodeURIComponent(RAW_KEY) : RAW_KEY

// 시도할 파라미터 조합. pageKey/sizeKey 는 페이지 번호/페이지 크기 파라미터명이다.
const ATTEMPTS = [
  { label: 'page / perPage / returnType', pageKey: 'page', sizeKey: 'perPage', extra: { returnType: 'json' } },
  { label: 'pageNo / numOfRows / type', pageKey: 'pageNo', sizeKey: 'numOfRows', extra: { type: 'json' } },
]

// 요청 수를 줄이기 위해 한 페이지당 1000건씩 받는다 (테스트로 확인됨).
const PAGE_SIZE = 1000
const HARD_PAGE_CAP = 60 // 안전 상한 (60 * 1000 = 60,000건, totalCount 약 3만건보다 충분히 큼)

function buildParams(attempt, pageNum, pageSize) {
  return { [attempt.pageKey]: String(pageNum), [attempt.sizeKey]: String(pageSize), ...attempt.extra }
}

async function fetchPage(attempt, pageNum, pageSize) {
  const search = new URLSearchParams({ serviceKey: KEY, ...buildParams(attempt, pageNum, pageSize) })
  const url = `${ENDPOINT}?${search.toString()}`
  for (let retry = 0; retry < 3; retry++) {
    let status, text
    try {
      const res = await fetch(url)
      status = res.status
      text = await res.text()
    } catch (err) {
      if (retry === 2) return { ok: false, reason: `네트워크 오류: ${err.message}` }
      continue
    }
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      // JSON 파싱 실패 (인증 오류 시 XML 응답)
    }
    if (status !== 200 || !json) {
      if (retry === 2) return { ok: false, status, text, reason: status !== 200 ? `HTTP ${status}` : 'JSON 파싱 실패' }
      continue
    }
    const items = findItemsArray(json)
    if (!items) {
      if (retry === 2) return { ok: false, status, json, reason: '아이템 배열을 찾지 못함' }
      continue
    }
    const totalCount = findTotalCountFields(json)[0]?.value ?? null
    return { ok: true, status, json, items, totalCount }
  }
  return { ok: false, reason: '재시도 초과' }
}

function findItemsArray(node, best = null) {
  if (Array.isArray(node)) {
    const isObjectArray =
      node.length > 0 && node.every((el) => el && typeof el === 'object' && !Array.isArray(el))
    if (isObjectArray && (!best || node.length > best.length)) {
      best = node
    }
    for (const el of node) {
      best = findItemsArray(el, best)
    }
    return best
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) {
      best = findItemsArray(value, best)
    }
  }
  return best
}

function findTotalCountFields(node, path = '', out = []) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      const nextPath = path ? `${path}.${key}` : key
      if (/total/i.test(key) && /count/i.test(key)) {
        out.push({ path: nextPath, value })
      }
      if (value && typeof value === 'object') {
        findTotalCountFields(value, nextPath, out)
      }
    }
  } else if (Array.isArray(node)) {
    node.forEach((el, i) => findTotalCountFields(el, `${path}[${i}]`, out))
  }
  return out
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

function formatYYYYMMDD(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function countUnique(items, field) {
  const counts = new Map()
  for (const it of items) {
    const v = isEmpty(it[field]) ? '(빈값)' : String(it[field])
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function printCountTable(label, rows, total) {
  console.log(`\n■ ${label} — 고유값 ${rows.length}개 (표본 ${total}건 기준)`)
  for (const [value, count] of rows) {
    console.log(`  ${count}건  ${value}`)
  }
}

const SIDO_LIST = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전국',
]

async function main() {
  // 1. 통하는 파라미터 조합 찾기
  let attempt = null
  for (const a of ATTEMPTS) {
    console.log(`\n[시도] ${a.label} 파라미터로 요청 중...`)
    const r = await fetchPage(a, 1, 10)
    if (r.ok) {
      console.log(`  → 성공 (HTTP ${r.status})`)
      attempt = a
      break
    }
    console.log(`  → 실패: ${r.reason}`)
  }
  if (!attempt) {
    console.log('\n모든 파라미터 조합이 실패했습니다.')
    process.exitCode = 1
    return
  }

  // 2. 최근 6개월 커트라인 계산 (접수시작일시 pbanc_rcpt_bgng_dt 기준)
  const now = new Date()
  const cutoffDate = new Date(now)
  cutoffDate.setMonth(cutoffDate.getMonth() - 6)
  const cutoffStr = formatYYYYMMDD(cutoffDate)
  console.log(`\n오늘: ${formatYYYYMMDD(now)}, 6개월 전 커트라인: ${cutoffStr}`)
  console.log(`페이지 크기: ${PAGE_SIZE}건/요청 (요청 수를 줄이려고 100에서 늘림)`)

  // 3. 페이지네이션 크롤링
  const itemsByKey = new Map()
  let prevDate = null
  let sortViolations = 0
  let comparedPairs = 0
  let consecutiveOldPages = 0
  let apiTotalCount = null
  let pagesFetched = 0

  for (let page = 1; page <= HARD_PAGE_CAP; page++) {
    const r = await fetchPage(attempt, page, PAGE_SIZE)
    if (!r.ok) {
      console.log(`\n[페이지 ${page}] 요청 실패: ${r.reason} — 크롤링 중단`)
      break
    }
    pagesFetched = page
    if (r.totalCount != null) apiTotalCount = r.totalCount
    if (r.items.length === 0) {
      console.log(`\n[페이지 ${page}] 빈 페이지 — 데이터 끝`)
      break
    }

    let pageHasRecent = false
    for (const it of r.items) {
      const d = it.pbanc_rcpt_bgng_dt
      if (prevDate !== null && d) {
        comparedPairs++
        if (d > prevDate) sortViolations++
      }
      if (d) prevDate = d

      const key = it.pbanc_sn ?? `${page}:${it.id}`
      if (!itemsByKey.has(key)) itemsByKey.set(key, it)
      if (d && d >= cutoffStr) pageHasRecent = true
    }

    console.log(`[페이지 ${page}] ${r.items.length}건 수신 (누적 고유 ${itemsByKey.size}건)`)

    if (!pageHasRecent) {
      consecutiveOldPages++
      if (consecutiveOldPages >= 2) {
        console.log(`  → 연속 2페이지가 모두 커트라인(${cutoffStr}) 이전 → 크롤링 종료`)
        break
      }
    } else {
      consecutiveOldPages = 0
    }
  }

  const allItems = [...itemsByKey.values()]
  const recentItems = allItems.filter(
    (it) => !isEmpty(it.pbanc_rcpt_bgng_dt) && it.pbanc_rcpt_bgng_dt >= cutoffStr
  )

  console.log('\n========== 크롤링 결과 ==========')
  console.log(`API 응답의 totalCount(전체 공고 수): ${apiTotalCount ?? '확인 불가'}`)
  console.log(`받은 페이지 수 (perPage=${PAGE_SIZE} 기준): ${pagesFetched}페이지`)
  console.log(`받은 전체 고유 아이템: ${allItems.length}건`)
  console.log(`이 중 pbanc_rcpt_bgng_dt >= ${cutoffStr} (최근 6개월) 인 아이템: ${recentItems.length}건`)

  // 정렬 여부 판정
  console.log('\n========== 응답 정렬 여부 ==========')
  console.log(
    `pbanc_rcpt_bgng_dt 기준으로 이전 아이템보다 값이 "더 큰(=더 최신인)" 역전 사례: ${sortViolations}/${comparedPairs}건`
  )
  if (comparedPairs === 0) {
    console.log('확인 불가 (비교할 데이터가 부족함)')
  } else {
    const violationRate = ((sortViolations / comparedPairs) * 100).toFixed(1)
    console.log(`역전 비율: ${violationRate}%`)
    if (sortViolations === 0) {
      console.log('→ pbanc_rcpt_bgng_dt 기준 완전한 내림차순(최신순) 정렬로 확인됨')
    } else {
      console.log(
        '→ 완전히 정렬되어 있진 않음: 페이지를 넘길수록 날짜가 대체로 과거로 가지만, 그 안에서 국지적으로 순서가 섞이는 사례가 있음'
      )
    }
  }

  // pbanc_rcpt_end_dt 최소/최대 (최근 6개월 표본 기준)
  console.log('\n========== pbanc_rcpt_end_dt 최소/최대 (최근 6개월 표본) ==========')
  const endDates = recentItems.map((it) => it.pbanc_rcpt_end_dt).filter((v) => !isEmpty(v)).sort()
  if (endDates.length === 0) {
    console.log('확인 불가 (값 없음)')
  } else {
    console.log(`최소값: ${endDates[0]}`)
    console.log(`최대값: ${endDates[endDates.length - 1]}`)
  }

  // 필드별 고유값/건수 (최근 6개월 표본 기준)
  console.log('\n========== 필드별 고유값과 건수 (최근 6개월 표본 기준) ==========')

  const regionRows = countUnique(recentItems, 'supt_regin')
  printCountTable('supt_regin (지원지역)', regionRows, recentItems.length)
  const sigunguHits = []
  for (const [value] of regionRows) {
    if (value === '(빈값)') continue
    for (const token of value.split(',').map((t) => t.trim())) {
      if (!SIDO_LIST.includes(token)) sigunguHits.push(token)
    }
  }
  if (sigunguHits.length === 0) {
    console.log('  → 시군구 단위 값: 없음 확인됨 (모든 값이 17개 시/도 + 전국 수준)')
  } else {
    console.log(`  → 시군구 단위로 보이는 값 발견: ${[...new Set(sigunguHits)].join(', ')}`)
  }

  printCountTable('aply_trgt (신청대상)', countUnique(recentItems, 'aply_trgt'), recentItems.length)
  printCountTable('biz_enyy (사업업력)', countUnique(recentItems, 'biz_enyy'), recentItems.length)
  printCountTable('biz_trgt_age (대상연령)', countUnique(recentItems, 'biz_trgt_age'), recentItems.length)
  printCountTable('supt_biz_clsfc (지원사업분류)', countUnique(recentItems, 'supt_biz_clsfc'), recentItems.length)

  const progressRows = countUnique(recentItems, 'rcrt_prgs_yn')
  printCountTable('rcrt_prgs_yn (모집진행여부)', progressRows, recentItems.length)
  const yCount = progressRows.find(([v]) => v === 'Y')?.[1] ?? 0
  const nCount = progressRows.find(([v]) => v === 'N')?.[1] ?? 0
  console.log(`  → Y: ${yCount}건, N: ${nCount}건`)

  console.log('\n=================================\n')
}

main().catch((err) => {
  console.error('스크립트 실행 중 오류:', err)
  process.exitCode = 1
})
