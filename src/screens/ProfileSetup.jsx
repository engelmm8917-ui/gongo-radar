import { useEffect, useState } from 'react'
import { decodeHtmlEntities } from '../lib/text'
import { SIDO_OPTIONS, BIZ_AGE_OPTIONS, TARGET_OPTIONS } from '../lib/constants'
import './ProfileSetup.css'

export default function ProfileSetup({ onComplete, initialProfile = null }) {
  const [sido, setSido] = useState(initialProfile?.sido ?? '')
  const [bizAge, setBizAge] = useState(initialProfile?.bizAge ?? '')
  const [targetType, setTargetType] = useState(initialProfile?.targetType ?? '')
  const [fields, setFields] = useState(initialProfile?.fields ?? [])
  const [categories, setCategories] = useState([])
  const [categoriesStatus, setCategoriesStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    let cancelled = false
    fetch('/data/announcements.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const set = new Set()
        for (const item of data.items ?? []) {
          if (item.category) set.add(decodeHtmlEntities(item.category))
        }
        setCategories([...set])
        setCategoriesStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setCategoriesStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleField = (value) => {
    setFields((prev) => (prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value]))
  }

  const isComplete = sido !== '' && bizAge !== '' && targetType !== ''

  const handleSubmit = () => {
    if (!isComplete) return
    const profile = { sido, bizAge, targetType, fields }
    localStorage.setItem('profile', JSON.stringify(profile))
    onComplete(profile)
  }

  return (
    <main className="profile-setup">
      <p className="profile-setup__intro">3개만 고르면 됩니다. 사업 분야는 나중에 골라도 됩니다.</p>

      <section className="profile-setup__section">
        <h2>소재지</h2>
        <select
          className="profile-setup__select"
          value={sido}
          onChange={(e) => setSido(e.target.value)}
        >
          <option value="" disabled>
            시/도를 선택하세요
          </option>
          {SIDO_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </section>

      <section className="profile-setup__section">
        <h2>업력</h2>
        <div className="chip-group">
          {BIZ_AGE_OPTIONS.map((v) => (
            <button
              key={v}
              type="button"
              className={`chip${bizAge === v ? ' chip--selected' : ''}`}
              onClick={() => setBizAge(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <section className="profile-setup__section">
        <h2>신청 자격</h2>
        <div className="chip-group">
          {TARGET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`chip${targetType === opt.value ? ' chip--selected' : ''}`}
              onClick={() => setTargetType(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="profile-setup__section">
        <h2>사업 분야</h2>
        {categoriesStatus === 'loading' && <p className="profile-setup__hint">불러오는 중...</p>}
        {categoriesStatus === 'error' && (
          <p className="profile-setup__hint">사업 분야 목록을 불러오지 못했습니다.</p>
        )}
        {categoriesStatus === 'ready' && (
          <div className="chip-group">
            {categories.map((v) => (
              <button
                key={v}
                type="button"
                className={`chip${fields.includes(v) ? ' chip--selected' : ''}`}
                onClick={() => toggleField(v)}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        className="profile-setup__submit"
        disabled={!isComplete}
        onClick={handleSubmit}
      >
        시작하기
      </button>
    </main>
  )
}
