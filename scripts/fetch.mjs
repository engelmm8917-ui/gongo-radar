// K-Startup 공고 + 통합공고 사업정보를 받아 public/data/announcements.json 을 만든다.
// recon.mjs / recon-biz.mjs 에서 검증된 요청/파싱 로직을 그대로 재사용한다.
// 실행: node scripts/fetch.mjs (npm run fetch)
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ENDPOINT_ANN =
  'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01'
const ENDPOINT_BIZ =
  'https://apis.data.go.kr/B552735/kisedKstartupService01/getBusinessInformation01'
const OUTPUT_PATH = join(ROOT, 'public', 'data', 'announcements.json')

// ---- .env.local 로드 (recon.mjs 와 동일) ----
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
// .env.local 에는 Encoding key(퍼센트 인코딩된 형태)가 들어있을 수 있다. URLSearchParams 가
// 값을 다시 인코딩하므로, 이미 인코딩된 문자열을 그대로 넘기면 이중 인코딩되어 인증이 깨진다.
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
    console.log(`[${label}] ${a.label} 파라미터로 요청 중...`)
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

function formatYYYYMMDD(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// YYYYMMDD -> ISO 문자열. 파싱 실패(형식/존재하지 않는 날짜) 시 null.
function toISODate(str) {
  if (isEmpty(str)) return null
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(str).trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return date.toISOString()
}

function splitCommaList(str) {
  if (isEmpty(str)) return []
  return String(str)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---- HTML 엔티티 디코딩 (recon-biz.mjs 보강판과 동일) ----
function decodeHtmlEntities(str) {
  if (isEmpty(str)) return ''
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return String(str)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED[name.toLowerCase()] ?? m)
}
function normalizeName(str) {
  return decodeHtmlEntities(str).replace(/\s+/g, '')
}

// ---- biz_supt_bdgt_info 파서 (recon-biz.mjs 보강판과 동일) ----
const UNIT_MULT = {
  천만원: 1e7,
  백만원: 1e6,
  만원: 1e4,
  천원: 1e3,
  억원: 1e8,
  억: 1e8,
  원: 1,
}
const UNIT_ALT = '천만\\s*원|백만\\s*원|만\\s*원|천\\s*원|억\\s*원|억|원'
const COMPANY_UNIT_ALT = '사|소|실|팀|\\s*기업'

function parseBudgetValue(raw) {
  if (isEmpty(raw)) return null
  const label = /\(예산현황\)\s*([^()]*?)(?=\(|\r|\n|$)/.exec(raw)
  if (!label) return null
  const amt = new RegExp(`(?<![\\d.,])([\\d][\\d,]*\\.?\\d*)\\s*(${UNIT_ALT})`).exec(label[1])
  if (!amt) return null
  const num = parseFloat(amt[1].replace(/,/g, ''))
  if (Number.isNaN(num)) return null
  const unitKey = amt[2].replace(/\s+/g, '')
  return Math.round(num * UNIT_MULT[unitKey])
}

function parseCompanyCount(raw) {
  if (isEmpty(raw)) return null
  const label = /\(지원규모\)\s*([^\r\n]*)/.exec(raw)
  if (!label) return null
  const segment = label[1].trim()
  if (segment === '-' || segment === '미정' || /^사업별\s*상이/.test(segment)) return null
  const matches = [...segment.matchAll(new RegExp(`(?<![\\d.,])(\\d[\\d,]*)\\s*여?\\s*개(?:${COMPANY_UNIT_ALT})`, 'g'))]
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

// ---- [수집] 1. 공고 전국 수집, pbanc_rcpt_end_dt 기준 최근 6개월 ----
async function fetchRecentAnnouncements(attempt) {
  const now = new Date()
  const cutoffDate = new Date(now)
  cutoffDate.setMonth(cutoffDate.getMonth() - 6)
  const cutoffStr = formatYYYYMMDD(cutoffDate)
  console.log(`[공고] 6개월 전 커트라인(pbanc_rcpt_end_dt 기준): ${cutoffStr}`)

  const PAGE_SIZE = 1000
  const itemsByKey = new Map()
  let consecutiveOldPages = 0
  let fatal = false

  for (let page = 1; page <= 60; page++) {
    const r = await fetchPage(ENDPOINT_ANN, attempt, page, PAGE_SIZE)
    if (!r.ok) {
      console.error(`[공고][페이지 ${page}] 요청 실패: ${r.reason}`)
      fatal = true
      break
    }
    if (r.items.length === 0) break
    let pageHasRecent = false
    for (const it of r.items) {
      const key = it.pbanc_sn ?? `${page}:${it.id}`
      if (!itemsByKey.has(key)) itemsByKey.set(key, it)
      if (!isEmpty(it.pbanc_rcpt_end_dt) && it.pbanc_rcpt_end_dt >= cutoffStr) pageHasRecent = true
    }
    console.log(`[공고][페이지 ${page}] ${r.items.length}건 수신 (누적 고유 ${itemsByKey.size}건)`)
    if (!pageHasRecent) {
      consecutiveOldPages++
      if (consecutiveOldPages >= 2) {
        console.log(`  → 연속 2페이지가 커트라인 이전 → 수집 종료`)
        break
      }
    } else {
      consecutiveOldPages = 0
    }
  }

  const all = [...itemsByKey.values()]
  const recent = all.filter((it) => !isEmpty(it.pbanc_rcpt_end_dt) && it.pbanc_rcpt_end_dt >= cutoffStr)
  return { items: recent, ok: !fatal }
}

// ---- [수집] 2. 통합공고 사업정보 511건 전량 수집 ----
async function fetchAllBusinessInfo(attempt) {
  let page = 1
  let totalCount = null
  const itemsById = new Map()
  let fatal = false

  while (true) {
    const r = await fetchPage(ENDPOINT_BIZ, attempt, page, 100)
    if (!r.ok) {
      console.error(`[사업정보][페이지 ${page}] 요청 실패: ${r.reason}`)
      fatal = true
      break
    }
    if (r.totalCount != null) totalCount = r.totalCount
    if (r.items.length === 0) break
    for (const it of r.items) {
      const key = it.id ?? it.pbanc_sn ?? `${page}:${itemsById.size}`
      itemsById.set(key, it)
    }
    console.log(`[사업정보][페이지 ${page}] ${r.items.length}건 수신 (누적 ${itemsById.size}건)`)
    if (totalCount != null && itemsById.size >= totalCount) break
    if (page >= 100) {
      console.error('[사업정보] 안전 상한(100페이지) 도달')
      fatal = true
      break
    }
    page++
  }

  const items = [...itemsById.values()]
  const complete = !fatal && totalCount != null && items.length >= totalCount
  return { items, totalCount, ok: complete }
}

async function main() {
  const annAttempt = await detectAttempt(ENDPOINT_ANN, '공고정보')
  if (!annAttempt) {
    console.error('공고정보 API 파라미터 조합을 찾지 못했습니다. announcements.json 을 갱신하지 않습니다.')
    process.exitCode = 1
    return
  }
  const annCrawl = await fetchRecentAnnouncements(annAttempt)
  if (!annCrawl.ok) {
    console.error('공고 수집이 도중에 실패했습니다. announcements.json 을 갱신하지 않습니다.')
    process.exitCode = 1
    return
  }
  console.log(`[공고] 최근 6개월 공고 ${annCrawl.items.length}건 수집 완료\n`)

  const bizAttempt = await detectAttempt(ENDPOINT_BIZ, '사업정보')
  if (!bizAttempt) {
    console.error('사업정보 API 파라미터 조합을 찾지 못했습니다. announcements.json 을 갱신하지 않습니다.')
    process.exitCode = 1
    return
  }
  const bizCrawl = await fetchAllBusinessInfo(bizAttempt)
  if (!bizCrawl.ok) {
    console.error(
      `사업정보 수집이 불완전합니다 (전체 ${bizCrawl.totalCount}건 중 ${bizCrawl.items.length}건). announcements.json 을 갱신하지 않습니다.`
    )
    process.exitCode = 1
    return
  }
  console.log(`[사업정보] 전체 ${bizCrawl.totalCount}건 중 ${bizCrawl.items.length}건 수집 완료\n`)

  // ---- [수집] 3. 사업정보에서 budgetValue / companyCount 파싱 ----
  const bizByNormName = new Map()
  for (const b of bizCrawl.items) {
    if (isEmpty(b.supt_biz_titl_nm)) continue
    const key = normalizeName(b.supt_biz_titl_nm)
    if (!bizByNormName.has(key)) bizByNormName.set(key, b)
  }

  // ---- [수집] 4. + [정규화] ----
  const items = annCrawl.items.map((a) => {
    const isY = a.intg_pbanc_yn === 'Y'
    let matchedBiz = null
    if (isY && !isEmpty(a.intg_pbanc_biz_nm)) {
      matchedBiz = bizByNormName.get(normalizeName(a.intg_pbanc_biz_nm)) ?? null
    }

    let amountBasis = null
    let amountBudget = null
    let amountCount = null
    let amountPerCompany = null
    if (matchedBiz) {
      amountBasis = matchedBiz.biz_supt_bdgt_info ?? null
      amountBudget = parseBudgetValue(amountBasis)
      amountCount = parseCompanyCount(amountBasis)
      if (amountBudget !== null && amountCount !== null && amountCount > 0) {
        amountPerCompany = Math.round(amountBudget / amountCount)
      }
    }

    return {
      id: a.pbanc_sn,
      title: decodeHtmlEntities(a.biz_pbanc_nm),
      org: decodeHtmlEntities(a.pbanc_ntrp_nm),
      region: a.supt_regin ?? null,
      startAt: toISODate(a.pbanc_rcpt_bgng_dt),
      endAt: toISODate(a.pbanc_rcpt_end_dt),
      targetCodes: splitCommaList(a.aply_trgt),
      targetText: decodeHtmlEntities(a.aply_trgt_ctnt),
      exclText: decodeHtmlEntities(a.aply_excl_trgt_ctnt),
      bizAges: splitCommaList(a.biz_enyy),
      ages: splitCommaList(a.biz_trgt_age),
      category: a.supt_biz_clsfc ?? null,
      isOpen: a.rcrt_prgs_yn === 'Y',
      amountPerCompany,
      amountBasis,
      amountBudget,
      amountCount,
      url: a.detl_pg_url ?? null,
    }
  })

  const output = { fetchedAt: new Date().toISOString(), items }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, JSON.stringify(output), 'utf-8')

  // ---- [리포트] ----
  const total = items.length
  const openCount = items.filter((it) => it.isOpen).length
  const closedCount = total - openCount

  const yCount = annCrawl.items.filter((a) => a.intg_pbanc_yn === 'Y').length
  const joinedCount = items.filter((it) => it.amountBasis !== null).length
  const joinRate = yCount ? ((joinedCount / yCount) * 100).toFixed(1) : '확인 불가'

  const amountOkItems = items.filter((it) => it.amountPerCompany !== null)
  const amountRate = ((amountOkItems.length / total) * 100).toFixed(1)

  const fileSizeMB = (statSync(OUTPUT_PATH).size / (1024 * 1024)).toFixed(2)

  console.log('\n========== 리포트 ==========')
  console.log(`총 건수: ${total}`)
  console.log(`진행중(Y): ${openCount}`)
  console.log(`마감(N): ${closedCount}`)
  console.log(`조인 성공률: ${joinedCount}/${yCount}건 (${joinRate}%)`)
  console.log(`amountPerCompany 파싱 성공률: ${amountOkItems.length}/${total}건 (${amountRate}%)`)
  if (amountOkItems.length > 0) {
    const manwon = amountOkItems.map((it) => it.amountPerCompany / 10000)
    console.log(
      `amountPerCompany 최소/중앙값/최대: ${Math.min(...manwon).toFixed(1)}만원 / ${median(manwon).toFixed(1)}만원 / ${Math.max(...manwon).toFixed(1)}만원`
    )
  } else {
    console.log('amountPerCompany 최소/중앙값/최대: 확인 불가')
  }
  console.log(`파일 크기: ${fileSizeMB}MB (${OUTPUT_PATH})`)
  console.log('=============================\n')
}

main().catch((err) => {
  console.error('스크립트 실행 중 오류:', err)
  process.exitCode = 1
})
