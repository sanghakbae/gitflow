/** 아이폰·아이패드인지. iPadOS 는 데스크톱 사파리로 위장하므로 터치 여부로 걸러낸다. */
export function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || iPadOS
}

/** 이미 홈 화면 앱으로 실행 중인지 (주소창 없는 상태) */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS 사파리는 표준 대신 이 비표준 값을 쓴다.
    window.navigator.standalone === true
  )
}
