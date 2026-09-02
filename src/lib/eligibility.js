const SIDO_ALIASES = {
  전남광주: ['전남', '광주'], // 두 시도명이 붙어버린 데이터 오류. 양쪽 모두 충족으로 처리한다.
}

function isEmptyValue(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

function isEmptyArray(arr) {
  return !Array.isArray(arr) || arr.length === 0
}

function regionTokens(region) {
  if (SIDO_ALIASES[region]) return SIDO_ALIASES[region]
  return String(region)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function judgeRegion(item, profile) {
  if (isEmptyValue(item.region)) {
    return { 조건: '지원지역', 판정: '확인필요', 근거: item.region ?? '' }
  }
  const tokens = regionTokens(item.region)
  const ok = tokens.includes('전국') || tokens.includes(profile.sido)
  return { 조건: '지원지역', 판정: ok ? '충족' : '미해당', 근거: item.region }
}

function judgeBizAge(item, profile) {
  if (isEmptyArray(item.bizAges)) {
    return { 조건: '사업업력', 판정: '확인필요', 근거: (item.bizAges ?? []).join(', ') }
  }
  const ok = item.bizAges.includes(profile.bizAge)
  return { 조건: '사업업력', 판정: ok ? '충족' : '미해당', 근거: item.bizAges.join(', ') }
}

function judgeTarget(item, profile) {
  if (isEmptyArray(item.targetCodes)) {
    return { 조건: '신청대상', 판정: '확인필요', 근거: (item.targetCodes ?? []).join(', ') }
  }
  const ok = item.targetCodes.includes(profile.targetType)
  return { 조건: '신청대상', 판정: ok ? '충족' : '미해당', 근거: item.targetCodes.join(', ') }
}

function judgeAge(item, profile) {
  if (isEmptyArray(item.ages)) {
    return { 조건: '대상연령', 판정: '확인필요', 근거: (item.ages ?? []).join(', ') }
  }
  const ok = item.ages.includes(profile.ageBand)
  return { 조건: '대상연령', 판정: ok ? '충족' : '미해당', 근거: item.ages.join(', ') }
}

function overallOf(reasons) {
  if (reasons.some((r) => r.판정 === '미해당')) return '제외'
  if (reasons.every((r) => r.판정 === '충족')) return '지원가능'
  return '확인필요'
}

// profile.fields(사업 분야)는 판정에 쓰지 않는다. 목록 필터에만 쓴다.
export function judge(item, profile) {
  const regionResult = judgeRegion(item, profile)
  const bizAgeResult = judgeBizAge(item, profile)
  const targetResult = judgeTarget(item, profile)
  const ageResult = judgeAge(item, profile)

  const reasons = [regionResult, bizAgeResult, targetResult, ageResult]

  return {
    region: regionResult.판정,
    bizAge: bizAgeResult.판정,
    target: targetResult.판정,
    age: ageResult.판정,
    overall: overallOf(reasons),
    reasons,
  }
}
