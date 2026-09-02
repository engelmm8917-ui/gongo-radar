import { useEffect } from 'react'
import { judge } from '../lib/eligibility'
import { formatDate, formatAmountEok, formatEokTerm } from '../lib/format'
import './Detail.css'

// amountBasis 원문의 줄바꿈을 한 줄로 (요약이 아니라 표시용 정리).
function oneLine(str) {
  if (!str) return ''
  return String(str).replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

export default function Detail({ item, profile, onClose }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!item) return null

  const result = judge(item, profile)
  const hasAmount = item.amountPerCompany !== null
  const hasExcl = Boolean(item.exclText?.trim())

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="detail-panel__close" onClick={onClose} aria-label="닫기">
          ✕
        </button>

        <div className="detail-panel__body">
          <div className="detail-panel__header">
            <h1 className="detail-panel__title">{item.title}</h1>
            <p className="detail-panel__org">{item.org}</p>
          </div>

          <p className="detail-panel__period">
            {formatDate(item.startAt)} ~ {formatDate(item.endAt)}
          </p>

          <div className="detail-panel__amount-row">
            <span className="detail-panel__amount-label">기업당 추정 지원금</span>
            <span className="detail-panel__amount-value">{formatAmountEok(item.amountPerCompany)}</span>
          </div>

          <section className="detail-panel__section">
            <h2 className="detail-panel__heading">지원금 산출 근거</h2>
            {hasAmount ? (
              <div className="detail-panel__calc-box">
                <p>
                  <span className="detail-panel__calc-label">원문</span>
                  {oneLine(item.amountBasis)}
                </p>
                <p>
                  <span className="detail-panel__calc-label">계산</span>
                  {formatEokTerm(item.amountBudget)} ÷ {item.amountCount?.toLocaleString('ko-KR')}개사
                </p>
                <p>
                  <span className="detail-panel__calc-label">결과</span>
                  기업당 약 {formatAmountEok(item.amountPerCompany)} (추정)
                </p>
              </div>
            ) : (
              <p className="detail-panel__muted">
                이 공고는 통합공고 예산 정보가 없어 지원금을 추정할 수 없습니다.
              </p>
            )}
          </section>

          <section className="detail-panel__section">
            <h2 className="detail-panel__heading">자격 판정 근거</h2>
            <div className="detail-panel__reasons">
              {result.reasons.map((r) => (
                <p key={r.조건} className="detail-panel__reason">
                  <span className="detail-panel__reason-tag">[{r.조건}]</span> {r.판정} — {r.근거}
                </p>
              ))}
            </div>
          </section>

          <section className="detail-panel__section">
            <h2 className="detail-panel__heading">지원대상 원문</h2>
            <p className="detail-panel__text">{item.targetText}</p>
          </section>

          {hasExcl && (
            <section className="detail-panel__section">
              <h2 className="detail-panel__heading">제외대상 원문</h2>
              <p className="detail-panel__text">{item.exclText}</p>
            </section>
          )}

          <a className="detail-panel__cta" href={item.url} target="_blank" rel="noopener noreferrer">
            K-Startup에서 공고문 보기
          </a>

          <p className="detail-panel__disclaimer">
            이 판정은 공고 목록 정보만으로 한 것입니다. 최종 자격 요건은 공고문에서 확인하십시오.
          </p>
        </div>
      </div>
    </div>
  )
}
