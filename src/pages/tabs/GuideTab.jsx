import { Badge } from '../../components/ui.jsx'

/**
 * 저장소의 현재 브랜치 구성을 진단하고, git-flow 로 넘어가려면 무엇을
 * 해야 하는지 알려준다. 경고만 띄우고 끝내면 사용자는 무엇을 고쳐야
 * 하는지 알 수 없다.
 */
export default function GuideTab({ data, onGoBranches }) {
  const { repo, summary, branches } = data
  const flow = repo.flow

  const hasDevelop = summary.developExists
  const active = summary.counts.feature + summary.counts.release + summary.counts.hotfix
  const mainOnly = !hasDevelop && active === 0

  const stage = mainOnly ? 'main-only' : !hasDevelop ? 'partial' : active === 0 ? 'ready' : 'running'

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>현재 상태</h2>
        <div className="row" style={{ gap: 6, marginBottom: 10 }}>
          <Badge kind={summary.mainExists ? 'main' : 'err'}>
            {flow.main} {summary.mainExists ? '있음' : '없음'}
          </Badge>
          <Badge kind={hasDevelop ? 'develop' : 'warn'}>
            {flow.develop} {hasDevelop ? '있음' : '없음'}
          </Badge>
          <Badge>브랜치 {branches.length}개</Badge>
          {active > 0 && <Badge kind="feature">진행 중 {active}개</Badge>}
        </div>

        <p className="why" style={{ margin: 0 }}>
          {stage === 'main-only' &&
            `${flow.main} 하나로만 작업하고 있습니다. 아래 설명을 읽고 git-flow 로 넘어갈지 판단하세요.`}
          {stage === 'partial' &&
            `작업 브랜치는 쓰고 있지만 ${flow.develop} 이 없습니다. 완료한 작업이 곧바로 ${flow.main} 으로 들어가므로, 배포 시점을 고를 수 없습니다.`}
          {stage === 'ready' &&
            `git-flow 구조는 갖췄고 진행 중인 작업이 없습니다. 새 작업은 "브랜치" 탭의 feature 시작으로 여세요.`}
          {stage === 'running' && `git-flow 구조로 작업 중입니다. 완료된 브랜치는 finish 로 닫아 주세요.`}
        </p>
      </div>

      {!hasDevelop && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>{flow.main} 하나로만 쓰면 생기는 일</h2>
          <ol className="guide-list">
            <li>
              <strong>배포와 개발이 한 브랜치에 섞입니다.</strong> 급한 버그 하나만 내보내고 싶어도, 그 시점의{' '}
              {flow.main} 에 아직 검증되지 않은 커밋이 함께 올라가 있으면 같이 나갑니다.
            </li>
            <li>
              <strong>릴리즈 범위를 고를 수 없습니다.</strong> 태그를 붙이는 순간의 {flow.main} 이 곧 배포본이라 "이
              기능은 빼고 내보내기"가 불가능합니다. 빼려면 커밋을 되돌렸다가 나중에 다시 넣어야 합니다.
            </li>
            <li>
              <strong>되돌리기가 커밋 단위가 됩니다.</strong> 기능이 병합 커밋 하나로 묶이지 않으므로, 문제가 생기면
              어느 커밋들이 그 기능인지 직접 골라내야 합니다.
            </li>
          </ol>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            혼자 쓰는 저장소이고 배포 시점을 따로 고를 일이 없다면, main 하나로 두는 편이 단순해서 나을 수도 있습니다.
            아래 구조가 필요해질 때 넘어가면 됩니다.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>git-flow 가 나누는 방식</h2>
        <div className="guide-flow">
          <Row
            branch={flow.main}
            kind="main"
            role="배포된 것만"
            desc={`실제로 나간 코드만 올라갑니다. 여기 붙는 태그(${flow.tagPrefix}1.2.0)가 곧 릴리즈 이력입니다.`}
          />
          <Row
            branch={flow.develop}
            kind="develop"
            role="다음 릴리즈"
            desc="완료된 기능이 모이는 곳입니다. 아직 배포된 건 아니지만 통합은 끝난 상태입니다."
          />
          <Row
            branch={`${flow.prefixes.feature}*`}
            kind="feature"
            role="기능 하나"
            desc={`${flow.develop} 에서 갈라져 ${flow.develop} 으로 돌아갑니다. 기능 단위로 병합되니 통째로 되돌릴 수 있습니다.`}
          />
          <Row
            branch={`${flow.prefixes.release}*`}
            kind="release"
            role="배포 준비"
            desc={`${flow.develop} 을 잘라내 굳히는 구간입니다. 여기서 버그를 잡는 동안 ${flow.develop} 에는 다음 기능을 계속 넣을 수 있습니다.`}
          />
          <Row
            branch={`${flow.prefixes.hotfix}*`}
            kind="hotfix"
            role="긴급 수정"
            desc={`${flow.main} 에서 갈라져 ${flow.main} 과 ${flow.develop} 양쪽으로 돌아갑니다. 진행 중인 개발을 기다리지 않고 나갈 수 있습니다.`}
          />
        </div>
      </div>

      <div className="card">
        <h2>다음에 할 일</h2>
        <ol className="guide-list">
          {!hasDevelop && (
            <li>
              <strong>git-flow 초기화</strong> — 지금 {flow.main} 과 같은 지점에서 {flow.develop} 브랜치를 만듭니다.
              이력을 바꾸거나 기존 커밋을 건드리지 않고, 브랜치 하나만 추가합니다. 되돌리려면 그 브랜치를 지우면
              끝입니다.
            </li>
          )}
          <li>
            <strong>feature 시작</strong> — 작업 이름을 넣으면 {flow.develop} 에서 {flow.prefixes.feature}이름 브랜치를
            만듭니다.
          </li>
          <li>
            <strong>feature 완료</strong> — {flow.develop} 로 <code>--no-ff</code> 병합하고 브랜치를 지웁니다. 병합
            커밋이 남아 기능 단위로 추적됩니다.
          </li>
          <li>
            <strong>release 완료</strong> — {flow.main} 병합 → 태그 → {flow.develop} 역병합까지 한 번에 실행합니다.
          </li>
        </ol>
        <p className="muted" style={{ fontSize: 12.5 }}>
          어떤 동작이든 실행 전에 <strong>실행 계획 보기</strong>로 어떤 git 명령이 돌지 먼저 확인할 수 있습니다.
        </p>
        <button className="primary" onClick={onGoBranches}>
          브랜치 탭으로 이동
        </button>
      </div>
    </>
  )
}

function Row({ branch, kind, role, desc }) {
  return (
    <div className="guide-row">
      <div className="guide-row-head">
        <Badge kind={kind}>{branch}</Badge>
        <span className="muted" style={{ fontSize: 12 }}>
          {role}
        </span>
      </div>
      <div className="sub">{desc}</div>
    </div>
  )
}
