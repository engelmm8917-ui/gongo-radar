// eligibility.js 테스트 + 실제 데이터 분포 확인. 외부 프레임워크 없이 node 로 바로 실행한다.
// 실행: node scripts/test-eligibility.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judge } from '../src/lib/eligibility.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

let passCount = 0
let failCount = 0

function assertEqual(actual, expected, label) {
  const ok = actual === expected
  if (ok) {
    passCount++
    console.log(`  ✓ ${label}`)
  } else {
    failCount++
    console.log(`  ✗ ${label}  (기대: ${JSON.stringify(expected)}, 실제: ${JSON.stringify(actual)})`)
  }
}

function assertTrue(condition, label) {
  if (condition) {
    passCount++
    console.log(`  ✓ ${label}`)
  } else {
    failCount++
    console.log(`  ✗ ${label}`)
  }
}

console.log('========== eligibility.js 테스트 ==========')

// 1. 모든 배열이 빈 공고 → overall '확인필요' ('지원가능'이면 실패)
{
  console.log('\n[1] 전부 빈 값인 공고')
  const item = { region: '', bizAges: [], targetCodes: [], ages: [] }
  const profile = { sido: '서울', bizAge: '3년미만', targetType: '일반기업', ageBand: '만 40세 이상' }
  const result = judge(item, profile)
  assertTrue(result.overall !== '지원가능', "overall 이 '지원가능' 이 아님")
  assertEqual(result.overall, '확인필요', "overall === '확인필요'")
}

// 2. 지역만 미해당, 나머지 전부 충족 → overall '제외'
{
  console.log('\n[2] 지역만 미해당인 공고')
  const item = {
    region: '경기',
    bizAges: ['3년미만'],
    targetCodes: ['일반기업'],
    ages: ['만 40세 이상'],
  }
  const profile = { sido: '서울', bizAge: '3년미만', targetType: '일반기업', ageBand: '만 40세 이상' }
  const result = judge(item, profile)
  assertEqual(result.region, '미해당', '지역 판정 = 미해당')
  assertEqual(result.bizAge, '충족', '업력 판정 = 충족')
  assertEqual(result.target, '충족', '신청대상 판정 = 충족')
  assertEqual(result.age, '충족', '연령 판정 = 충족')
  assertEqual(result.overall, '제외', "overall === '제외'")
}

// 3. 부분 문자열 매칭 방지: bizAges=['10년미만'], profile.bizAge='1년미만' → 미해당
{
  console.log('\n[3] 부분 문자열 매칭 방지 (10년미만 vs 1년미만)')
  const item = { region: '전국', bizAges: ['10년미만'], targetCodes: ['일반기업'], ages: ['만 40세 이상'] }
  const profile = { sido: '서울', bizAge: '1년미만', targetType: '일반기업', ageBand: '만 40세 이상' }
  const result = judge(item, profile)
  assertEqual(result.bizAge, '미해당', "bizAge 판정 = 미해당 ('1년미만' 이 '10년미만' 에 부분일치하면 안 됨)")
}

// 4. '전남광주' 는 전남/광주 둘 다 충족
{
  console.log("\n[4] region === '전남광주' 특수 처리")
  const item = { region: '전남광주', bizAges: ['3년미만'], targetCodes: ['일반기업'], ages: ['만 40세 이상'] }
  const base = { bizAge: '3년미만', targetType: '일반기업', ageBand: '만 40세 이상' }
  assertEqual(judge(item, { ...base, sido: '전남' }).region, '충족', "sido='전남' → 충족")
  assertEqual(judge(item, { ...base, sido: '광주' }).region, '충족', "sido='광주' → 충족")
  assertEqual(judge(item, { ...base, sido: '경기' }).region, '미해당', "sido='경기' → 미해당")
}

// 5. reasons 의 근거가 원문과 문자 그대로 같은가
{
  console.log('\n[5] reasons.근거 원문 일치 검증')
  const item = {
    region: '경기,서울',
    bizAges: ['1년미만', '2년미만', '10년미만'],
    targetCodes: ['일반기업', '1인 창조기업'],
    ages: ['만 20세 이상 ~ 만 39세 이하', '만 40세 이상'],
  }
  const profile = { sido: '경기', bizAge: '1년미만', targetType: '일반기업', ageBand: '만 40세 이상' }
  const result = judge(item, profile)
  const byLabel = Object.fromEntries(result.reasons.map((r) => [r.조건, r.근거]))
  assertEqual(byLabel['지원지역'], item.region, '지역 근거가 item.region 과 문자 그대로 동일')
  assertEqual(byLabel['사업업력'], item.bizAges.join(', '), '업력 근거가 item.bizAges.join(", ") 과 동일')
  assertEqual(byLabel['신청대상'], item.targetCodes.join(', '), '신청대상 근거가 item.targetCodes.join(", ") 과 동일')
  assertEqual(byLabel['대상연령'], item.ages.join(', '), '연령 근거가 item.ages.join(", ") 과 동일')
}

console.log(`\n========== 테스트 결과: ${passCount}개 통과 / ${failCount}개 실패 ==========\n`)

// ---- 분포 출력 ----
const DATA_PATH = join(ROOT, 'public', 'data', 'announcements.json')
let data
try {
  data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
} catch (err) {
  console.error(`\npublic/data/announcements.json 을 읽지 못했습니다: ${err.message}`)
  console.error('npm run fetch 로 먼저 데이터를 받으세요.')
  process.exitCode = failCount > 0 ? 1 : 0
  process.exit()
}

const PROFILES = {
  A: { sido: '전남', bizAge: '3년미만', targetType: '일반기업', ageBand: '만 40세 이상' },
  B: { sido: '전남', bizAge: '7년미만', targetType: '일반기업', ageBand: '만 20세 이상 ~ 만 39세 이하' },
  C: { sido: '광주', bizAge: '예비창업자', targetType: '예비창업자', ageBand: '만 40세 이상' },
}

const CONDITION_LABELS = ['지원지역', '사업업력', '신청대상', '대상연령']

console.log('========== 프로필별 판정 분포 ==========')

for (const [key, profile] of Object.entries(PROFILES)) {
  console.log(`\n■ 프로필 ${key}: ${JSON.stringify(profile)}`)

  const results = data.items.map((item) => ({ item, result: judge(item, profile) }))

  const okCount = results.filter((r) => r.result.overall === '지원가능').length
  const needCount = results.filter((r) => r.result.overall === '확인필요').length
  const excludeCount = results.filter((r) => r.result.overall === '제외').length

  console.log(`  전체 판정: 지원가능 ${okCount} / 확인필요 ${needCount} / 제외 ${excludeCount}`)

  const openOk = results.filter((r) => r.item.isOpen && r.result.overall === '지원가능').length
  const closedOk = results.filter((r) => !r.item.isOpen && r.result.overall === '지원가능').length
  console.log(`  진행중(isOpen=true) 중 지원가능: ${openOk}건  ← S1 홈에 뜰 건수`)
  console.log(`  마감(isOpen=false) 중 지원가능: ${closedOk}건  ← S2 대상 건수`)

  const closedOkWithAmount = results.filter(
    (r) => !r.item.isOpen && r.result.overall === '지원가능' && r.item.amountPerCompany !== null
  )
  const amountSum = closedOkWithAmount.reduce((sum, r) => sum + r.item.amountPerCompany, 0)
  console.log(
    `  그중 amountPerCompany 있는 건수: ${closedOkWithAmount.length}건, 합계: ${(amountSum / 1e8).toFixed(2)}억원`
  )

  const excludeReasons = results.filter((r) => r.result.overall === '제외')
  const reasonCounts = Object.fromEntries(CONDITION_LABELS.map((l) => [l, 0]))
  for (const r of excludeReasons) {
    for (const reason of r.result.reasons) {
      if (reason.판정 === '미해당') reasonCounts[reason.조건]++
    }
  }
  console.log(
    `  제외(${excludeCount}건) 원인 (중복 집계): 지역 ${reasonCounts['지원지역']} / 업력 ${reasonCounts['사업업력']} / 대상 ${reasonCounts['신청대상']} / 연령 ${reasonCounts['대상연령']}`
  )
}

// ---- ageBand 값이 실제 ages 배열 값과 문자 그대로 일치하는지 확인 ----
console.log('\n========== ageBand 값 검증 ==========')
const actualAgeValues = new Set()
for (const item of data.items) {
  for (const a of item.ages ?? []) actualAgeValues.add(a)
}
console.log('실제 데이터의 ages 고유값:')
for (const v of actualAgeValues) console.log(`  "${v}"`)

for (const [key, profile] of Object.entries(PROFILES)) {
  const exists = actualAgeValues.has(profile.ageBand)
  if (exists) {
    console.log(`\n프로필 ${key} ageBand "${profile.ageBand}" → 일치함`)
  } else {
    console.log(`\n프로필 ${key} ageBand "${profile.ageBand}" → 불일치! 실제 값과 다름`)
    for (const v of actualAgeValues) {
      if (v.replace(/\s/g, '') === profile.ageBand.replace(/\s/g, '')) {
        console.log(`  공백만 다름: 실제 "${v}" (char codes: ${[...v].map((c) => c.charCodeAt(0)).join(',')})`)
        console.log(`               프로필 "${profile.ageBand}" (char codes: ${[...profile.ageBand].map((c) => c.charCodeAt(0)).join(',')})`)
      }
    }
  }
}

console.log('\n=============================\n')

if (failCount > 0) process.exitCode = 1
