import { useEffect, useMemo, useState } from 'react'
import { regionTokens } from '../lib/region'
import { SIDO_OPTIONS } from '../lib/constants'
import ScreenHeader from '../components/ScreenHeader'
import './Regions.css'

export default function Regions({ profile, onBack }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [items, setItems] = useState([])

  useEffect(() => {
    let cancelled = false
    fetch('/data/announcements.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setItems(data.items ?? [])
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 판정/fields 필터 없이 announcements.json 전체를 region 값으로 집계한다.
  // '전남광주' 는 전남/광주 양쪽에 각각 +1.
  const counts = useMemo(() => {
    const map = new Map([['전국', 0], ...SIDO_OPTIONS.map((s) => [s, 0])])
    for (const item of items) {
      if (!item.region) continue
      for (const token of regionTokens(item.region)) {
        if (map.has(token)) map.set(token, map.get(token) + 1)
      }
    }
    return map
  }, [items])

  const nationwideCount = counts.get('전국') ?? 0
  const ourSidoCount = counts.get(profile.sido) ?? 0

  const rows = useMemo(() => {
    const sidoRows = SIDO_OPTIONS.map((name) => ({ name, count: counts.get(name) ?? 0 })).sort(
      (a, b) => b.count - a.count
    )
    return [{ name: '전국', count: nationwideCount }, ...sidoRows]
  }, [counts, nationwideCount])

  const maxCount = Math.max(1, ...rows.map((r) => r.count))

  if (status === 'loading') return <RegionsSkeleton onBack={onBack} />

  if (status === 'error') {
    return (
      <main className="regions">
        <ScreenHeader title="지역별 공고 분포" onBack={onBack} />
        <p className="regions__error">데이터를 불러오지 못했습니다.</p>
      </main>
    )
  }

  return (
    <main className="regions">
      <ScreenHeader title="지역별 공고 분포" onBack={onBack} />

      <section className="regions__metrics">
        <div className="region-metric">
          <span className="region-metric__label">우리 지역({profile.sido}) 지정 공고</span>
          <span className="region-metric__value">{ourSidoCount}</span>
        </div>
        <div className="region-metric">
          <span className="region-metric__label">전국 대상 공고</span>
          <span className="region-metric__value">{nationwideCount}</span>
        </div>
      </section>

      <section className="regions__bars">
        {rows.map((row) => {
          const highlight = row.name === profile.sido
          return (
            <div
              key={row.name}
              className={`region-bar-row${highlight ? ' region-bar-row--highlight' : ''}`}
            >
              <span className="region-bar-row__label">{row.name}</span>
              <span className="region-bar-row__track">
                <span
                  className="region-bar-row__fill"
                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                />
              </span>
              <span className="region-bar-row__count">{row.count}</span>
            </div>
          )
        })}
      </section>

      <p className="regions__note">지역 사이트만 보면 전국 공고 {nationwideCount}건을 놓칩니다</p>
    </main>
  )
}

function RegionsSkeleton({ onBack }) {
  return (
    <main className="regions">
      <ScreenHeader title="지역별 공고 분포" onBack={onBack} />
      <div className="skeleton skeleton--metrics" />
      <div className="skeleton skeleton--bars" />
    </main>
  )
}
