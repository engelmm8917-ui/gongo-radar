export const SIDO_ALIASES = {
  전남광주: ['전남', '광주'], // 두 시도명이 붙어버린 데이터 오류. 양쪽 모두 센다.
}

// region 원문 값을 시/도 토큰 배열로. '전남광주' 는 ['전남','광주'] 둘 다로 쪼갠다.
export function regionTokens(region) {
  if (SIDO_ALIASES[region]) return SIDO_ALIASES[region]
  return String(region)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
