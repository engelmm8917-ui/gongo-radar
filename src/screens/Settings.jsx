import { useEffect, useState } from 'react'
import { formatDateTime } from '../lib/format'
import ScreenHeader from '../components/ScreenHeader'
import './Settings.css'

const APPLIED_KEY = 'applied'

async function loadMeta() {
  const res = await fetch(`/data/announcements.json?_=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return { fetchedAt: data.fetchedAt ?? null, totalCount: (data.items ?? []).length }
}

export default function Settings({ onBack, onEditProfile }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [meta, setMeta] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadMeta()
      .then((m) => {
        if (cancelled) return
        setMeta(m)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const m = await loadMeta()
      setMeta(m)
      setStatus('ready')
    } catch {
      setStatus('error')
    } finally {
      setRefreshing(false)
    }
  }

  const handleClearApplied = () => {
    const ok = window.confirm("체크한 '신청했음' 표시를 모두 해제합니다. 계속할까요?")
    if (!ok) return
    localStorage.setItem(APPLIED_KEY, '[]')
    setCleared(true)
  }

  return (
    <main className="settings">
      <ScreenHeader title="설정" onBack={onBack} />

      <div className="settings__list">
        <button type="button" className="settings-row" onClick={onEditProfile}>
          <span className="settings-row__label">회사 조건 수정</span>
        </button>

        <div className="settings-row">
          <span className="settings-row__label">데이터 기준 시각</span>
          {status === 'loading' && <span className="settings-row__sub">불러오는 중...</span>}
          {status === 'error' && <span className="settings-row__sub">불러오지 못했습니다</span>}
          {status === 'ready' && meta && (
            <>
              <span className="settings-row__sub">{formatDateTime(meta.fetchedAt)} 기준</span>
              <span className="settings-row__sub">총 {meta.totalCount.toLocaleString('ko-KR')}건</span>
            </>
          )}
        </div>

        <button
          type="button"
          className="settings-row"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <span className="settings-row__label">데이터 새로고침</span>
          {refreshing && <span className="settings-row__sub">새로고침 중...</span>}
        </button>

        <button type="button" className="settings-row" onClick={handleClearApplied}>
          <span className="settings-row__label">'신청했음' 전체 해제</span>
          {cleared && <span className="settings-row__sub">모두 해제되었습니다</span>}
        </button>
      </div>
    </main>
  )
}
