// 서비스워커 등록과 '새 버전' 알림.
//
// registerType: 'prompt' 이라 새 버전이 받아져도 자동으로 갈아치우지 않는다.
// 작성 중이던 입력이 새로고침에 날아가면 안 되므로, 사용자가 누를 때 교체한다.

import { registerSW } from 'virtual:pwa-register'

let updateSW = null
const listeners = new Set()
let state = { needRefresh: false, offlineReady: false }

function emit(next) {
  state = { ...state, ...next }
  for (const fn of listeners) fn(state)
}

/** 상태 변화를 구독한다. 해제 함수를 돌려준다. */
export function onPwaState(fn) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

/** 사용자가 '지금 새로고침' 을 눌렀을 때만 교체한다. */
export function applyUpdate() {
  if (updateSW) updateSW(true)
}

export function initPwa() {
  // 서비스워커를 지원하지 않는 환경(구형 브라우저, 비보안 컨텍스트)에서는 조용히 넘어간다.
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      emit({ needRefresh: true })
    },
    onOfflineReady() {
      emit({ offlineReady: true })
    },
  })
}
