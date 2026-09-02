import { useEffect, useMemo, useRef, useState } from 'react'
import { judge } from '../lib/eligibility'
import { formatAmountEok, formatKoreanAmountSum, formatDate } from '../lib/format'
import './ClosedEligible.css'

const PAGE_SIZE = 30
const APPLIED_KEY = 'applied'

function readApplied() {
  try {
    const raw = localStorage.getItem(APPLIED_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export default function ClosedEligible({ profile, onBack }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [judged, setJudged] = useState([])
  const [applied, setApplied] = useState(readApplied)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/announcements.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const list = (data.items ?? []).map((item) => ({ item, result: judge(item, profile) }))
        setJudged(list)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  // 마감(isOpen=false) + 지원가능 (profile.fields 필터는 적용하지 않는다)
  const closedEligible = useMemo(
    () => judged.filter(({ item, result }) => !item.isOpen && result.overall === '지원가능'),
    [judged]
  )

  const closedEligibleWithAmount = useMemo(
    () => closedEligible.filter(({ item }) => item.amountPerCompany !== null),
    [closedEligible]
  )

  const excludedNoAmountCount = closedEligible.length - closedEligibleWithAmount.length

  // 마감일 최신순
  const listItems = useMemo(
    () => [...closedEligibleWithAmount].sort((a, b) => (b.item.endAt ?? '').localeCompare(a.item.endAt ?? '')),
    [closedEligibleWithAmount]
  )

  // 체크(신청함) 표시한 것은 건수/합계에서 즉시 빠진다.
  const activeItems = useMemo(
    () => listItems.filter(({ item }) => !applied.has(item.id)),
    [listItems, applied]
  )
  const count = activeItems.length
  const sum = activeItems.reduce((acc, { item }) => acc + (item.amountPerCompany ?? 0), 0)

  const toggleApplied = (id) => {
    setApplied((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(APPLIED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const [renderedListItems, setRenderedListItems] = useState(listItems)
  if (listItems !== renderedListItems) {
    setRenderedListItems(listItems)
    setVisibleCount(PAGE_SIZE)
  }

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((v) => Math.min(v + PAGE_SIZE, listItems.length))
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [listItems.length])

  if (status === 'loading') return <ClosedEligibleSkeleton onBack={onBack} />

  if (status === 'error') {
    return (
      <main className="closed">
        <Header onBack={onBack} />
        <p className="closed__error">데이터를 불러오지 못했습니다.</p>
      </main>
    )
  }

  const visibleItems = listItems.slice(0, visibleCount)

  return (
    <main className="closed">
      <Header onBack={onBack} />

      <section className="closed__hero">
        <p className="closed__subtitle">지난 6개월, 우리 회사가 지원 자격이 됐던 마감 공고</p>
        <div className="closed__count">
          <span className="closed__count-number">{count}</span>
          <span className="closed__count-unit">건</span>
        </div>
        <p className="closed__sum">{formatKoreanAmountSum(sum)}</p>
        <div className="closed__hint-group">
          <p className="closed__hint">기업당 추정 지원금 기준입니다</p>
          <p className="closed__hint">지원금이 표기되지 않은 {excludedNoAmountCount}건은 제외했습니다</p>
        </div>
      </section>

      <section className="closed__list">
        {visibleItems.length === 0 && <p className="closed__empty">해당하는 공고가 없습니다.</p>}
        {visibleItems.map(({ item }) => {
          const isApplied = applied.has(item.id)
          return (
            <label
              key={item.id}
              className={`closed-row${isApplied ? ' closed-row--applied' : ''}`}
            >
              <input
                type="checkbox"
                className="closed-row__checkbox"
                checked={isApplied}
                onChange={() => toggleApplied(item.id)}
              />
              <span className="closed-row__main">
                <span className="closed-row__date">{formatDate(item.endAt)}</span>
                <span className="closed-row__title">{item.title}</span>
                <span className="closed-row__org">{item.org}</span>
              </span>
              <span className="closed-row__amount">{formatAmountEok(item.amountPerCompany)}</span>
            </label>
          )
        })}
        {visibleCount < listItems.length && <div ref={sentinelRef} className="closed__sentinel" />}
      </section>
    </main>
  )
}

function Header({ onBack }) {
  return (
    <header className="closed__header">
      <button type="button" className="closed__back" onClick={onBack}>
        ← 홈으로
      </button>
      <h1 className="closed__title">자격이 됐던 마감 공고</h1>
      <span className="closed__header-spacer" aria-hidden="true" />
    </header>
  )
}

function ClosedEligibleSkeleton({ onBack }) {
  return (
    <main className="closed">
      <Header onBack={onBack} />
      <div className="skeleton skeleton--hero" />
      <section className="closed__list">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton skeleton--row" />
        ))}
      </section>
    </main>
  )
}
