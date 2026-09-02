import { useEffect, useState } from 'react'
import { decodeHtmlEntities } from '../lib/text'
import './ProfileSetup.css'

const SIDO_OPTIONS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]

const BIZ_AGE_OPTIONS = [
  '예비창업자', '1년미만', '2년미만', '3년미만', '5년미만', '7년미만', '10년미만', '10년이상',
]

// 화면 표기와 저장 값을 분리한다: '개인(일반인)' 을 고르면 저장/판정 값은 '일반인'.
const TARGET_OPTIONS = [
  { value: '일반기업', label: '일반기업' },
  { value: '1인 창조기업', label: '1인 창조기업' },
  { value: '일반인', label: '개인(일반인)' },
]

export default function ProfileSetup({ onComplete }) {
  const [sido, setSido] = useState('')
  const [bizAge, setBizAge] = useState('')
  const [targetType, setTargetType] = useState('')
  const [fields, setFields] = useState([])
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

  const isComplete = sido !== '' && bizAge !== '' && targetType !== '' && fields.length > 0

  const handleSubmit = () => {
    if (!isComplete) return
    const profile = { sido, bizAge, targetType, fields }
    localStorage.setItem('profile', JSON.stringify(profile))
    onComplete(profile)
  }

  return (
    <main className="profile-setup">
      <p className="profile-setup__intro">딱 4개만 고르면 됩니다. 30초면 끝납니다.</p>

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
