import { useState } from 'react'
import ProfileSetup from './screens/ProfileSetup'
import Home from './screens/Home'
import ClosedEligible from './screens/ClosedEligible'
import Regions from './screens/Regions'
import Detail from './screens/Detail'

function readProfile() {
  try {
    const raw = localStorage.getItem('profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function App() {
  const [profile, setProfile] = useState(readProfile)
  const [view, setView] = useState('home') // 'home' | 'setup' | 'closed' | 'regions'
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

  let screen
  if (view === 'closed') {
    screen = (
      <ClosedEligible profile={profile} onBack={() => setView('home')} onOpenDetail={setDetailItem} />
    )
  } else if (view === 'regions') {
    screen = <Regions profile={profile} onBack={() => setView('home')} />
  } else {
    screen = (
      <Home
        profile={profile}
        onEditProfile={() => setView('setup')}
        onOpenClosed={() => setView('closed')}
        onOpenRegions={() => setView('regions')}
        onOpenDetail={setDetailItem}
      />
    )
  }

  // 상세(S4)는 S1/S2 화면 위에 시트/패널로 겹쳐서 뜬다 (별도 화면 전환이 아니다).
  return (
    <>
      {screen}
      {detailItem && (
        <Detail item={detailItem} profile={profile} onClose={() => setDetailItem(null)} />
      )}
    </>
  )
}

export default App
