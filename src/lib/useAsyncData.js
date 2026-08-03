import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 키(저장소 id, 탭 등)가 바뀔 때마다 다시 불러오는 비동기 조회.
 *
 * 직접 useEffect 로 짜면 두 가지를 매번 틀린다:
 *  - 늦게 도착한 이전 요청이 새 화면을 덮어쓴다 (저장소를 빠르게 전환할 때)
 *  - 로딩 상태를 만들려고 effect 안에서 곧바로 setState 해 렌더가 한 번 더 돈다
 * 응답에 순번을 매겨 마지막 것만 반영하고, 이전 키의 결과는 렌더 중에 버린다.
 */
export function useAsyncData(loader, deps) {
  const [state, setState] = useState({ key: null, data: null, error: null })
  const seq = useRef(0)
  const key = JSON.stringify(deps)

  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const data = await loader()
      if (seq.current === mine) setState({ key, data, error: null })
    } catch (e) {
      if (seq.current === mine) setState({ key, data: null, error: e.message })
    }
    // loader 는 매 렌더 새로 만들어지는 화살표 함수라 deps 에 넣으면 무한 루프가 된다.
    // 대신 호출자가 넘긴 deps 를 직렬화한 key 로만 갱신을 판단한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    // load 는 await 이후에만 setState 한다 (동기 setState 아님)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // 키가 바뀐 직후에는 이전 결과를 노출하지 않는다 (effect 에서 비우지 않아도 된다)
  const fresh = state.key === key
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, reload: load }
}
