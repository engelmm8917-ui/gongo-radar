import { useEffect, useMemo, useRef, useState } from 'react'
import { judge } from '../lib/eligibility'
import { decodeHtmlEntities } from '../lib/text'
import { daysUntil } from '../lib/date'
import { formatAmount } from '../lib/format'
import { readAppliedSet } from '../lib/applied'
import { TARGET_OPTIONS } from '../lib/constants'
import './Home.css'

const PAGE_SIZE = 30
const DUE_SOON_DAYS = 7

function targetLabel(value) {
  return TARGET_OPTIONS.find((o) => o.value === value)?.label ?? value
}

function formatDday(days) {
  if (days === null) return ''
  if (days === 0) return 'D-day'
  if (days > 0) return `D-${days}`
  return `D+${Math.abs(days)}`
}

export default function Home({
  profile,
  onEditProfile,
  onOpenClosed,
  onOpenRegions,
  onOpenSettings,
  onOpenDetail,
}) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [judged, setJudged] = useState([])
  const [applied] = useState(readAppliedSet)
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

  // isOpen 이고 overall 이 '제외' 가 아닌 것 — '확인필요' 노란 태그는 화면에 만들지 않지만
  // 판정 자체는 3단계를 그대로 쓴다 (CLAUDE.md).
  const eligibleOpen = useMemo(
    () => judged.filter(({ item, result }) => item.isOpen && result.overall !== '제외'),
    [judged]
  )

  const dueThisWeek = useMemo(
    () =>
      eligibleOpen.filter(({ item }) => {
        const d = daysUntil(item.endAt)
        return d !== null && d <= DUE_SOON_DAYS
      }),
    [eligibleOpen]
  )

  // S2(ClosedEligible)의 activeItems 와 같은 기준: applied(신청했음) 로 체크한 건 뺀다.
  const closedEligibleWithAmount = useMemo(
    () =>
      judged.filter(
        ({ item, result }) =>
          !item.isOpen &&
          result.overall === '지원가능' &&
          item.amountPerCompany !== null &&
          !applied.has(item.id)
      ),
    [judged, applied]
  )

  // profile.fields 는 목록 필터로만 쓴다. 빈 배열이면 전체 분류를 다 보여준다.
  const listItems = useMemo(() => {
    const filtered =
      profile.fields && profile.fields.length > 0
        ? eligibleOpen.filter(({ item }) => profile.fields.includes(decodeHtmlEntities(item.category)))
        : eligibleOpen
    return [...filtered].sort((a, b) => (a.item.endAt ?? '').localeCompare(b.item.endAt ?? ''))
  }, [eligibleOpen, profile.fields])

  // listItems 가 바뀌면(필터/정렬 결과가 달라지면) 페이지를 처음부터 다시 그린다.
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

  if (status === 'loading') return <HomeSkeleton />

  if (status === 'error') {
    return (
      <main className="home">
        <p className="home__error">데이터를 불러오지 못했습니다.</p>
      </main>
    )
  }

  const summaryText = [
    profile.sido,
    profile.bizAge,
    targetLabel(profile.targetType),
    profile.fields?.length ? profile.fields.join(', ') : '전체',
  ].join(' · ')

  const visibleItems = listItems.slice(0, visibleCount)

  return (
    <main className="home">
      <header className="home__header">
        <h1 className="home__header-title">공고 레이더</h1>
        <button type="button" className="home__settings-btn" onClick={onOpenSettings}>
          설정
        </button>
      </header>

      <div className="home__summary">
        <span className="home__summary-chip">{summaryText}</span>
        <button type="button" className="home__edit-btn" onClick={onEditProfile}>
          조건 수정
        </button>
      </div>

      <section className="home__metrics">
        <div className="metric-card">
          <span className="metric-card__label">지원 가능 공고</span>
          <span className="metric-card__value">{eligibleOpen.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">이번 주 마감</span>
          <span className="metric-card__value">{dueThisWeek.length}</span>
        </div>
        <button type="button" className="metric-card metric-card--highlight" onClick={onOpenClosed}>
          <span className="metric-card__label">자격이 됐던 마감 공고</span>
          <span className="metric-card__value">{closedEligibleWithAmount.length}</span>
        </button>
      </section>

      <button type="button" className="home__regions-btn" onClick={onOpenRegions}>
        지역별 공고 분포 보기
        <span className="home__regions-btn-arrow" aria-hidden="true">
          →
        </span>
      </button>

      <section className="home__list">
        {visibleItems.length === 0 && (
          <p className="home__empty">조건에 맞는 진행 중인 공고가 없습니다.</p>
        )}
        {visibleItems.map(({ item }) => {
          const d = daysUntil(item.endAt)
          const dueSoon = d !== null && d <= DUE_SOON_DAYS
          return (
            <button
              type="button"
              key={item.id}
              className="announcement-card"
              onClick={() => onOpenDetail(item)}
            >
              <span
                className={`announcement-card__dday${dueSoon ? ' announcement-card__dday--soon' : ''}`}
              >
                {formatDday(d)}
              </span>
              <span className="announcement-card__title">{item.title}</span>
              <span className="announcement-card__org">{item.org}</span>
              <span className="announcement-card__amount">{formatAmount(item.amountPerCompany)}</span>
              <span className="announcement-card__category">{decodeHtmlEntities(item.category)}</span>
            </button>
          )
        })}
        {visibleCount < listItems.length && <div ref={sentinelRef} className="home__sentinel" />}
      </section>
    </main>
  )
}

function HomeSkeleton() {
  return (
    <main className="home">
      <div className="skeleton skeleton--summary" />
      <section className="home__metrics">
        <div className="skeleton skeleton--metric" />
        <div className="skeleton skeleton--metric" />
        <div className="skeleton skeleton--metric" />
      </section>
      <section className="home__list">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton skeleton--card" />
        ))}
      </section>
    </main>
  )
}
