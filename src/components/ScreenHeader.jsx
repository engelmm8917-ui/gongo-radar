import './ScreenHeader.css'

export default function ScreenHeader({ title, onBack }) {
  return (
    <header className="screen-header">
      <button type="button" className="screen-header__back" onClick={onBack}>
        ← 홈으로
      </button>
      <h1 className="screen-header__title">{title}</h1>
      <span className="screen-header__spacer" aria-hidden="true" />
    </header>
  )
}
