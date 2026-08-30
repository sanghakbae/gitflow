import { useEffect, useState } from 'react'
import { applyUpdate, onPwaState } from '../pwa.js'
import { isIos, isStandalone } from '../lib/platform.js'

const IOS_HINT_KEY = 'pwa.iosHintDismissedAt'
const ONE_DAY = 24 * 60 * 60 * 1000

/** iOS 공유 버튼 아이콘. 유니코드 문자는 기기마다 다른 글자로 나와서 직접 그린다. */
function ShareIcon() {
  return (
    <svg className="pwa-share-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M8 10H6.4A1.4 1.4 0 0 0 5 11.4v7.2A1.4 1.4 0 0 0 6.4 20h11.2a1.4 1.4 0 0 0 1.4-1.4v-7.2A1.4 1.4 0 0 0 17.6 10H16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 14V4.2M12 4.2 9.3 6.9M12 4.2l2.7 2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 화면 아래 띄우는 PWA 안내 두 가지.
 *  - 새 버전이 받아졌을 때: 누르면 그때 교체한다 (자동 새로고침 안 함).
 *  - 아이폰에서 아직 홈 화면에 안 넣었을 때: 설치 방법을 알려준다.
 *    아이폰 사파리에는 설치 버튼이 없어서 직접 알려주지 않으면 방법을 모른다.
 */
export default function PwaBanner() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => onPwaState((s) => setNeedRefresh(s.needRefresh)), [])

  useEffect(() => {
    if (!isIos() || isStandalone()) return
    // 닫으면 하루 동안 다시 띄우지 않는다. 영영 숨기면 나중에 설치하려는
    // 사람이 방법을 찾지 못하고, 매번 띄우면 성가시다.
    try {
      const at = Number(localStorage.getItem(IOS_HINT_KEY) || 0)
      if (at && Date.now() - at < ONE_DAY) return
    } catch {
      /* 저장소가 막혀 있어도 안내는 띄운다 */
    }
    // 열자마자 띄우면 성가시다. 잠깐 써 본 뒤에 알린다.
    const id = setTimeout(() => setShowIosHint(true), 4000)
    return () => clearTimeout(id)
  }, [])

  const dismissIos = () => {
    setShowIosHint(false)
    try {
      localStorage.setItem(IOS_HINT_KEY, String(Date.now()))
    } catch {
      /* 무시 */
    }
  }

  if (needRefresh) {
    return (
      <div className="pwa-banner" role="status">
        <span>새 버전이 준비됐습니다.</span>
        <button type="button" className="pwa-cta" onClick={applyUpdate}>
          지금 새로고침
        </button>
        <button type="button" className="pwa-x" onClick={() => setNeedRefresh(false)} aria-label="닫기">
          ✕
        </button>
      </div>
    )
  }

  if (showIosHint) {
    return (
      <div className="pwa-banner pwa-install" role="status">
        {/* 홈 화면에 어떤 아이콘·이름으로 깔리는지 미리 보여준다. */}
        <div className="pwa-preview" aria-hidden="true">
          <img src="/icon-192.png" alt="" width="44" height="44" />
          <span>GitFlow</span>
        </div>
        <div className="pwa-install-body">
          <b className="pwa-install-title">홈 화면에 추가하면 앱처럼 쓸 수 있습니다</b>
          <p className="pwa-install-why">주소창 없이 전체화면으로 열리고, 신호가 없어도 실행됩니다.</p>
          <ol className="pwa-steps">
            <li>
              화면 아래 <ShareIcon /> <b>공유</b> 를 누릅니다
            </li>
            <li>
              목록을 아래로 내려 <b>홈 화면에 추가</b> 를 고릅니다
              <span className="pwa-step-note">
                안 보이면 맨 아래 <b>더 보기</b> 를 누르세요
              </span>
            </li>
          </ol>
        </div>
        <button type="button" className="pwa-x" onClick={dismissIos} aria-label="안내 닫기">
          ✕
        </button>
      </div>
    )
  }

  return null
}
