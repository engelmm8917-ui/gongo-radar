import { useState } from 'react'
import ProfileSetup from './screens/ProfileSetup'
import Home from './screens/Home'
import ClosedEligible from './screens/ClosedEligible'
import Regions from './screens/Regions'

function readProfile() {
  try {
    const raw = localStorage.getItem('profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function StubScreen({ title, onBack }) {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <p>{title} — 다음 STEP에서 만듭니다.</p>
      <button type="button" onClick={onBack}>
        홈으로
      </button>
    </main>
  )
}

function App() {
  const [profile, setProfile] = useState(readProfile)
  const [view, setView] = useState('home') // 'home' | 'setup' | 'closed' | 'regions' | 'detail'
  const [detailItem, setDetailItem] = useState(null)

  if (!profile || view === 'setup') {
    return (
      <ProfileSetup
        initialProfile={profile}
        onComplete={(p) => {
          setProfile(p)
          setView('home')
        }}
      />
    )
  }

  if (view === 'closed') {
    return <ClosedEligible profile={profile} onBack={() => setView('home')} />
  }

  if (view === 'regions') {
    return <Regions profile={profile} onBack={() => setView('home')} />
  }

  if (view === 'detail') {
    return (
      <StubScreen
        title={`공고 상세 (S4) — ${detailItem?.title ?? ''}`}
        onBack={() => setView('home')}
      />
    )
  }

  return (
    <Home
      profile={profile}
      onEditProfile={() => setView('setup')}
      onOpenClosed={() => setView('closed')}
      onOpenRegions={() => setView('regions')}
      onOpenDetail={(item) => {
        setDetailItem(item)
        setView('detail')
      }}
    />
  )
}

export default App
