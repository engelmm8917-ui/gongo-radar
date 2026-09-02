// K-Startup 통합공고 "사업" 정보 API 정찰 스크립트 — 511건 전량 수집 + 공고 조인 + 예산 파싱
// 실행: node scripts/recon-biz.mjs
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ENDPOINT_BIZ =
  'https://apis.data.go.kr/B552735/kisedKstartupService01/getBusinessInformation01'
const ENDPOINT_ANN =
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
const KEY = /%[0-9A-Fa-f]{2}/.test(RAW_KEY) ? decodeURIComponent(RAW_KEY) : RAW_KEY

const ATTEMPTS = [
  { label: 'page / perPage / returnType', pageKey: 'page', sizeKey: 'perPage', extra: { returnType: 'json' } },
  { label: 'pageNo / numOfRows / type', pageKey: 'pageNo', sizeKey: 'numOfRows', extra: { type: 'json' } },
]

function buildParams(attempt, pageNum, pageSize) {
  return { [attempt.pageKey]: String(pageNum), [attempt.sizeKey]: String(pageSize), ...attempt.extra }
}

async function fetchPage(endpoint, attempt, pageNum, pageSize) {
  const search = new URLSearchParams({ serviceKey: KEY, ...buildParams(attempt, pageNum, pageSize) })
  const url = `${endpoint}?${search.toString()}`
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

async function detectAttempt(endpoint, label) {
  for (const a of ATTEMPTS) {
    console.log(`\n[${label}] ${a.label} 파라미터로 요청 중...`)
    const r = await fetchPage(endpoint, a, 1, 10)
    if (r.ok) {
      console.log(`  → 성공 (HTTP ${r.status})`)
      return a
    }
    console.log(`  → 실패: ${r.reason}`)
  }
  return null
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

function truncate(str, max = 60) {
  const s = String(str).replace(/\s*[\r\n]+\s*/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function formatYYYYMMDD(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// ---- 전체 페이지 수집 ----
async function fetchAllPages(endpoint, attempt, pageSize, label) {
  let page = 1
  let totalCount = null
  const itemsById = new Map()
  while (true) {
    const r = await fetchPage(endpoint, attempt, page, pageSize)
    if (!r.ok) {
      console.log(`[${label}][페이지 ${page}] 요청 실패: ${r.reason} — 중단`)
      break
    }
    if (r.totalCount != null) totalCount = r.totalCount
    if (r.items.length === 0) break
    for (const it of r.items) {
      const key = it.id ?? it.pbanc_sn ?? `${page}:${itemsById.size}`
      itemsById.set(key, it)
    }
    console.log(`[${label}][페이지 ${page}] ${r.items.length}건 수신 (누적 ${itemsById.size}건)`)
    if (totalCount != null && itemsById.size >= totalCount) break
    if (page >= 100) {
      console.log(`[${label}] 안전 상한(100페이지) 도달 — 중단`)
      break
    }
    page++
  }
  return { items: [...itemsById.values()], totalCount, pages: page }
}

// ---- 최근 6개월 공고 수집 (recon.mjs 와 동일 로직) ----
async function fetchRecentAnnouncements(attempt) {
  const now = new Date()
  const cutoffDate = new Date(now)
  cutoffDate.setMonth(cutoffDate.getMonth() - 6)
  const cutoffStr = formatYYYYMMDD(cutoffDate)
  console.log(`\n[공고] 6개월 전 커트라인: ${cutoffStr}`)

  const PAGE_SIZE = 1000
  const itemsByKey = new Map()
  let consecutiveOldPages = 0

  for (let page = 1; page <= 60; page++) {
    const r = await fetchPage(ENDPOINT_ANN, attempt, page, PAGE_SIZE)
    if (!r.ok) {
      console.log(`[공고][페이지 ${page}] 요청 실패: ${r.reason} — 중단`)
      break
    }
    if (r.items.length === 0) break
    let pageHasRecent = false
    for (const it of r.items) {
      const key = it.pbanc_sn ?? `${page}:${it.id}`
      if (!itemsByKey.has(key)) itemsByKey.set(key, it)
      if (!isEmpty(it.pbanc_rcpt_bgng_dt) && it.pbanc_rcpt_bgng_dt >= cutoffStr) pageHasRecent = true
    }
    console.log(`[공고][페이지 ${page}] ${r.items.length}건 수신 (누적 고유 ${itemsByKey.size}건)`)
    if (!pageHasRecent) {
      consecutiveOldPages++
      if (consecutiveOldPages >= 2) break
    } else {
      consecutiveOldPages = 0
    }
  }

  const all = [...itemsByKey.values()]
  return all.filter((it) => !isEmpty(it.pbanc_rcpt_bgng_dt) && it.pbanc_rcpt_bgng_dt >= cutoffStr)
}

// ---- 이름 정규화 ----
// 이전 버전: 공백만 제거
function normalizeNameOld(str) {
  return String(str).replace(/\s+/g, '')
}
// 보강 버전: HTML 엔티티 디코딩 후 공백 제거 (&#40; → ( 등)
function decodeHtmlEntities(str) {
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return String(str)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED[name.toLowerCase()] ?? m)
}
function normalizeNameNew(str) {
  return decodeHtmlEntities(str).replace(/\s+/g, '')
}

// ---- biz_supt_bdgt_info 파서 ----
const UNIT_MULT = {
  천만원: 1e7,
  백만원: 1e6,
  만원: 1e4,
  천원: 1e3,
  억원: 1e8,
  억: 1e8,
  원: 1,
}
const UNIT_ALT_OLD = '천만원|백만원|만원|천원|억원|억|원'
// 보강 버전: 배수 단어와 '원' 사이에 공백 허용 ('백만 원' 등)
const UNIT_ALT_NEW = '천만\\s*원|백만\\s*원|만\\s*원|천\\s*원|억\\s*원|억|원'
// companyCount 보강 버전에서 인정하는 단위: 개사/개소/개실/개팀/개 기업
const COMPANY_UNIT_ALT_NEW = '사|소|실|팀|\\s*기업'

function parseBudgetValueOld(raw) {
  if (isEmpty(raw)) return null
  const label = /\(예산현황\)\s*([^()]*?)(?=\(|\r|\n|$)/.exec(raw)
  if (!label) return null
  const amt = new RegExp(`(?<![\\d.,])([\\d][\\d,]*\\.?\\d*)\\s*(${UNIT_ALT_OLD})`).exec(label[1])
  if (!amt) return null
  const num = parseFloat(amt[1].replace(/,/g, ''))
  if (Number.isNaN(num)) return null
  return Math.round(num * UNIT_MULT[amt[2]])
}

function parseBudgetValueNew(raw) {
  if (isEmpty(raw)) return null
  // (예산현황) 뒤, 괄호 안 내역은 여전히 무시 — 맨 앞 금액만 쓴다
  const label = /\(예산현황\)\s*([^()]*?)(?=\(|\r|\n|$)/.exec(raw)
  if (!label) return null
  const amt = new RegExp(`(?<![\\d.,])([\\d][\\d,]*\\.?\\d*)\\s*(${UNIT_ALT_NEW})`).exec(label[1])
  if (!amt) return null
  const num = parseFloat(amt[1].replace(/,/g, ''))
  if (Number.isNaN(num)) return null
  const unitKey = amt[2].replace(/\s+/g, '') // '백만 원' → '백만원' 으로 정규화 후 조회
  return Math.round(num * UNIT_MULT[unitKey])
}

function parseCompanyCountOld(raw) {
  if (isEmpty(raw)) return null
  const label = /\(지원규모\)\s*([^()]*?)(?=\(|\r|\n|$)/.exec(raw)
  if (!label) return null
  const matches = [...label[1].matchAll(/(?<![\d.,])(\d[\d,]*)\s*여?\s*개사/g)]
  if (matches.length === 0) return null
  let sum = 0
  for (const m of matches) {
    const n = parseInt(m[1].replace(/,/g, ''), 10)
    if (!Number.isNaN(n)) sum += n
  }
  return sum
}

function parseCompanyCountNew(raw) {
  if (isEmpty(raw)) return null
  // '(지원규모)' 이후 텍스트 전체를 본다. 괄호 안에 수치가 들어있는 경우가 있어서
  // (예: '입주기업(21개실)') budgetValue 파서와 달리 첫 '(' 에서 끊지 않는다.
  const label = /\(지원규모\)\s*([^\r\n]*)/.exec(raw)
  if (!label) return null
  const segment = label[1].trim()
  // '사업별 상이', '-', '미정' 은 명시적으로 null 처리
  if (segment === '-' || segment === '미정' || /^사업별\s*상이/.test(segment)) return null
  // '명' 은 기업 수로 인정하지 않는다 (개사/개소/개실/개팀/개 기업만 인정)
  const matches = [...segment.matchAll(new RegExp(`(?<![\\d.,])(\\d[\\d,]*)\\s*여?\\s*개(?:${COMPANY_UNIT_ALT_NEW})`, 'g'))]
  if (matches.length === 0) return null
  let sum = 0
  for (const m of matches) {
    const n = parseInt(m[1].replace(/,/g, ''), 10)
    if (!Number.isNaN(n)) sum += n
  }
  return sum
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

async function main() {
  // 1. 사업정보(통합공고) 전량 수집
  const bizAttempt = await detectAttempt(ENDPOINT_BIZ, '사업정보')
  if (!bizAttempt) {
    console.log('\n사업정보 API 파라미터 조합을 찾지 못했습니다.')
    process.exitCode = 1
    return
  }
  const bizCrawl = await fetchAllPages(ENDPOINT_BIZ, bizAttempt, 100, '사업정보')
  const bizItems = bizCrawl.items
  console.log(
    `\n[사업정보] 전체 ${bizCrawl.totalCount}건 중 ${bizItems.length}건 수집 (perPage=100, ${bizCrawl.pages}페이지)`
  )

  // 2. 공고 API 파라미터 조합 확인 + 최근 6개월 수집
  const annAttempt = await detectAttempt(ENDPOINT_ANN, '공고정보')
  if (!annAttempt) {
    console.log('\n공고정보 API 파라미터 조합을 찾지 못했습니다.')
    process.exitCode = 1
    return
  }
  const recentAnn = await fetchRecentAnnouncements(annAttempt)
  console.log(`\n[공고] 최근 6개월 공고 ${recentAnn.length}건 수집 완료`)

  // ---- [조인] 1. intg_pbanc_yn Y/N 건수 ----
  console.log('\n========== [조인] 1. intg_pbanc_yn 분포 ==========')
  const yItems = recentAnn.filter((it) => it.intg_pbanc_yn === 'Y')
  const nItems = recentAnn.filter((it) => it.intg_pbanc_yn === 'N')
  const otherCount = recentAnn.length - yItems.length - nItems.length
  console.log(`Y: ${yItems.length}건`)
  console.log(`N: ${nItems.length}건`)
  if (otherCount > 0) console.log(`그 외(빈값 등): ${otherCount}건`)

  // ---- [조인] 2. 이름 일치율 (보강 전후 비교) ----
  console.log('\n========== [조인] 2. intg_pbanc_biz_nm ↔ supt_biz_titl_nm 일치율 ==========')

  const bizNameSetOld = new Set(bizItems.map((b) => normalizeNameOld(b.supt_biz_titl_nm)).filter((v) => v))
  const matchedYItemsOld = yItems.filter(
    (it) => !isEmpty(it.intg_pbanc_biz_nm) && bizNameSetOld.has(normalizeNameOld(it.intg_pbanc_biz_nm))
  )
  const joinRateOld = yItems.length ? ((matchedYItemsOld.length / yItems.length) * 100).toFixed(1) : '확인 불가'

  const bizNameSetNew = new Set(bizItems.map((b) => normalizeNameNew(b.supt_biz_titl_nm)).filter((v) => v))
  const matchedYItemsNew = yItems.filter(
    (it) => !isEmpty(it.intg_pbanc_biz_nm) && bizNameSetNew.has(normalizeNameNew(it.intg_pbanc_biz_nm))
  )
  const joinRateNew = yItems.length ? ((matchedYItemsNew.length / yItems.length) * 100).toFixed(1) : '확인 불가'

  console.log(`[보강 전] 공백만 제거: ${matchedYItemsOld.length}/${yItems.length}건 일치 → ${joinRateOld}%`)
  console.log(`[보강 후] HTML 엔티티 디코딩 + 공백 제거: ${matchedYItemsNew.length}/${yItems.length}건 일치 → ${joinRateNew}%`)

  // ---- [조인] 3. 불일치 샘플 20개 (양쪽, 보강 후 기준) ----
  console.log('\n========== [조인] 3. 불일치 이름 샘플 20개 (양쪽, 보강 후 기준) ==========')
  const unmatchedAnnNames = yItems
    .filter((it) => !matchedYItemsNew.includes(it))
    .map((it) => it.intg_pbanc_biz_nm)
    .filter((v) => !isEmpty(v))
    .slice(0, 20)
  console.log('\n[공고 쪽] 사업정보에서 못 찾은 intg_pbanc_biz_nm:')
  unmatchedAnnNames.forEach((n, i) => console.log(`  ${i + 1}. ${truncate(n)}`))

  const matchedBizNormNamesNew = new Set(matchedYItemsNew.map((it) => normalizeNameNew(it.intg_pbanc_biz_nm)))
  const unmatchedBizNames = bizItems
    .filter((b) => !isEmpty(b.supt_biz_titl_nm) && !matchedBizNormNamesNew.has(normalizeNameNew(b.supt_biz_titl_nm)))
    .map((b) => b.supt_biz_titl_nm)
    .slice(0, 20)
  console.log('\n[사업정보 쪽] 공고(Y)에서 매칭되지 않은 supt_biz_titl_nm:')
  unmatchedBizNames.forEach((n, i) => console.log(`  ${i + 1}. ${truncate(n)}`))

  // ---- [파싱] biz_supt_bdgt_info 파싱 (보강 전후 비교) ----
  console.log('\n========== [파싱] biz_supt_bdgt_info ==========')
  const parsedOld = bizItems.map((b) => ({
    raw: b.biz_supt_bdgt_info,
    budgetValue: parseBudgetValueOld(b.biz_supt_bdgt_info),
    companyCount: parseCompanyCountOld(b.biz_supt_bdgt_info),
  }))
  const parsedNew = bizItems.map((b) => ({
    raw: b.biz_supt_bdgt_info,
    budgetValue: parseBudgetValueNew(b.biz_supt_bdgt_info),
    companyCount: parseCompanyCountNew(b.biz_supt_bdgt_info),
  }))

  function summarize(parsed) {
    const budgetOk = parsed.filter((p) => p.budgetValue !== null)
    const companyOk = parsed.filter((p) => p.companyCount !== null)
    const bothOk = parsed.filter((p) => p.budgetValue !== null && p.companyCount !== null && p.companyCount > 0)
    return { total: parsed.length, budgetOk, companyOk, bothOk }
  }
  const sOld = summarize(parsedOld)
  const sNew = summarize(parsedNew)
  const pct = (n, total) => ((n / total) * 100).toFixed(1)

  console.log('\n[5] 파싱 성공률 (보강 전 → 보강 후)')
  console.log(
    `  budgetValue 성공:   ${sOld.budgetOk.length}/${sOld.total}건 (${pct(sOld.budgetOk.length, sOld.total)}%)  →  ${sNew.budgetOk.length}/${sNew.total}건 (${pct(sNew.budgetOk.length, sNew.total)}%)`
  )
  console.log(
    `  companyCount 성공:  ${sOld.companyOk.length}/${sOld.total}건 (${pct(sOld.companyOk.length, sOld.total)}%)  →  ${sNew.companyOk.length}/${sNew.total}건 (${pct(sNew.companyOk.length, sNew.total)}%)`
  )
  console.log(
    `  둘 다 성공:         ${sOld.bothOk.length}/${sOld.total}건 (${pct(sOld.bothOk.length, sOld.total)}%)  →  ${sNew.bothOk.length}/${sNew.total}건 (${pct(sNew.bothOk.length, sNew.total)}%)`
  )

  console.log('\n[6] perCompany = budgetValue / companyCount (만원 단위, 보강 후 파서 · 둘 다 성공한 건 기준)')
  const OLD_MEDIAN_REF = 2170.0
  if (sNew.bothOk.length === 0) {
    console.log('  확인 불가 (둘 다 성공한 건이 없음)')
  } else {
    const perCompanyManwon = sNew.bothOk.map((p) => p.budgetValue / p.companyCount / 10000)
    const min = Math.min(...perCompanyManwon)
    const max = Math.max(...perCompanyManwon)
    const med = median(perCompanyManwon)
    console.log(`  표본 수: ${perCompanyManwon.length}건`)
    console.log(`  최소: ${min.toFixed(1)}만원`)
    console.log(`  중앙값: ${med.toFixed(1)}만원`)
    console.log(`  최대: ${max.toFixed(1)}만원`)

    const deviation = Math.abs(med - OLD_MEDIAN_REF) / OLD_MEDIAN_REF
    if (deviation > 0.3) {
      console.log(
        `  ⚠ 중앙값이 이전 결과(${OLD_MEDIAN_REF}만원)에서 ${(deviation * 100).toFixed(1)}% 벗어남 — 파서가 이상한 값을 섞어 넣었을 수 있음, 점검 필요`
      )
    } else {
      console.log(`  → 중앙값이 이전 결과(${OLD_MEDIAN_REF}만원)와 비슷한 범위(${(deviation * 100).toFixed(1)}% 차이) — 파서 정상으로 보임`)
    }
  }

  console.log('\n[7] 파싱 실패 (보강 후 기준, budgetValue 또는 companyCount 중 하나라도 null) 원문 15개 샘플')
  const failures = parsedNew.filter((p) => p.budgetValue === null || p.companyCount === null).slice(0, 15)
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. [budgetValue=${f.budgetValue}, companyCount=${f.companyCount}]`)
    console.log(`     ${truncate(f.raw, 120)}`)
  })

  console.log('\n=================================\n')
}

main().catch((err) => {
  console.error('스크립트 실행 중 오류:', err)
  process.exitCode = 1
})
