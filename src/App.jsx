import { useState } from 'react'
import ProfileSetup from './screens/ProfileSetup'

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

  if (!profile) {
    return <ProfileSetup onComplete={setProfile} />
  }

  // S1(홈) 화면은 아직 만들지 않았다.
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <p>조건이 저장되어 있습니다. S1 화면은 아직 준비 중입니다.</p>
      <pre>{JSON.stringify(profile, null, 2)}</pre>
      <button
        type="button"
        onClick={() => {
          localStorage.removeItem('profile')
          setProfile(null)
        }}
      >
        조건 다시 설정
      </button>
    </main>
  )
}

export default App
