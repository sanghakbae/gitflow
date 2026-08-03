/**
 * 규칙의 단일 출처. 로컬 백엔드(server/lib/rules.js), GitHub 백엔드,
 * 화면(RulesTab) 이 모두 여기서 id·라벨·근거를 가져온다.
 *
 * 세 곳에 흩어져 있던 탓에 백엔드가 내는 규칙에 화면 라벨이 없어
 * 영문 id 가 그대로 노출된 적이 있다. 여기 한 곳만 고치면 되도록 모은다.
 */
export const RULES = {
  'branch-name': {
    label: '브랜치 네이밍',
    reason:
      '이름만으로 무슨 작업인지, 어디로 병합될지 알 수 없습니다. 이 도구를 포함한 자동화가 접두사로 브랜치 종류를 판별하므로, 규칙을 벗어난 브랜치는 feature/release/hotfix 어디에도 잡히지 않고 집계에서 빠집니다.',
  },
  'commit-message': {
    label: '커밋 메시지 컨벤션',
    reason:
      '릴리즈 노트 자동 생성과 변경 유형(기능/버그/문서) 분류가 커밋 접두사에 의존합니다. 규칙을 벗어난 커밋은 노트에서 누락되거나 엉뚱한 항목으로 분류되고, 나중에 "언제 무엇이 바뀌었나"를 되짚기 어려워집니다.',
  },
  'direct-commit': {
    label: '보호 브랜치 직접 커밋',
    reason:
      '보호 브랜치에 직접 커밋하면 리뷰와 CI를 건너뜁니다. 되돌릴 때도 병합 커밋 하나가 아니라 커밋을 골라내야 해서 복구가 느려지고, 배포된 코드가 어떤 리뷰를 거쳤는지 추적할 수 없습니다.',
  },
  'stale-branch': {
    label: '방치된 브랜치',
    reason:
      '오래 방치될수록 기준 브랜치와 멀어져 병합 시 충돌이 커집니다. 이미 다른 경로로 반영됐는데 지우지 않은 브랜치일 수도 있어, 남아 있으면 어떤 작업이 살아 있는지 판단이 흐려집니다.',
  },
  'gone-upstream': {
    label: '원격 삭제됨',
    reason:
      '원격에서 지워진 브랜치가 로컬에 남아 있으면 이미 끝난 작업을 다시 이어가거나, 병합된 브랜치를 미완료로 착각하기 쉽습니다.',
  },
  protected: {
    label: 'GitHub 브랜치 보호',
    reason:
      'GitHub 브랜치 보호가 걸려 있으면 이 도구의 직접 병합·삭제가 거부될 수 있습니다. 그 브랜치로는 PR 을 거쳐야 합니다.',
  },
}

export const RULE_IDS = Object.keys(RULES)

export const ruleLabel = (id) => RULES[id]?.label || id
export const ruleReason = (id) => RULES[id]?.reason || ''

/** 위반 항목에 라벨·근거를 붙여 화면이 따로 조립하지 않게 한다. */
export function makeViolation({ severity, rule, branch, message, hint = '' }) {
  if (!RULES[rule]) throw new Error(`알 수 없는 규칙 id: ${rule} (ruleCatalog 에 등록하세요)`)
  return { severity, rule, branch, message, hint, why: RULES[rule].reason }
}
