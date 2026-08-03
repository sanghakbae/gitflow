import { git } from './exec.js'
import { classify, listBranches } from './repo.js'

const SEP = '\x1f'
const DAY = 24 * 60 * 60 * 1000

/**
 * 규칙마다 "왜 문제인지"를 붙인다. 위반 목록만 보여주면 사람은 규칙을 지키는
 * 대신 규칙을 끄기 때문에, 근거가 화면에 함께 나와야 한다.
 */
export const RULE_REASONS = {
  'branch-name':
    '이름만으로 무슨 작업인지, 어디로 병합될지 알 수 없습니다. 이 도구를 포함한 자동화가 접두사로 브랜치 종류를 판별하므로, 규칙을 벗어난 브랜치는 feature/release/hotfix 어디에도 잡히지 않고 집계에서 빠집니다.',
  'commit-message':
    '릴리즈 노트 자동 생성과 변경 유형(기능/버그/문서) 분류가 커밋 접두사에 의존합니다. 규칙을 벗어난 커밋은 노트에서 누락되거나 엉뚱한 항목으로 분류되고, 나중에 "언제 무엇이 바뀌었나"를 되짚기 어려워집니다.',
  'direct-commit':
    '보호 브랜치에 직접 커밋하면 리뷰와 CI를 건너뜁니다. 되돌릴 때도 병합 커밋 하나가 아니라 커밋을 골라내야 해서 복구가 느려지고, 배포된 코드가 어떤 리뷰를 거쳤는지 추적할 수 없습니다.',
  'stale-branch':
    '오래 방치될수록 기준 브랜치와 멀어져 병합 시 충돌이 커집니다. 이미 다른 경로로 반영됐는데 지우지 않은 브랜치일 수도 있어, 남아 있으면 어떤 작업이 살아 있는지 판단이 흐려집니다.',
  'gone-upstream':
    '원격에서 지워진 브랜치가 로컬에 남아 있으면 이미 끝난 작업을 다시 이어가거나, 병합된 브랜치를 미완료로 착각하기 쉽습니다.',
}

const violation = (severity, rule, branch, message, hint) => ({
  severity,
  rule,
  branch,
  message,
  hint,
  why: RULE_REASONS[rule] || '',
})

/**
 * 팀 규칙 검사: 브랜치 네이밍 / 커밋 메시지 컨벤션 /
 * 보호 브랜치 직접 커밋 / 방치된 브랜치 / 업스트림 정합성.
 */
export async function checkRules(repo) {
  const cwd = repo.path
  const rules = repo.rules
  const flow = repo.flow
  const branches = await listBranches(cwd)
  const out = []

  const nameRe = safeRe(rules.branchName)
  const msgRe = safeRe(rules.commitMessage)
  const protectedSet = new Set(rules.protectedBranches || [])
  const now = Date.now()

  for (const b of branches) {
    const kind = classify(b.name, flow).type
    const isProtected = protectedSet.has(b.name)

    // 1) 브랜치 네이밍
    if (!isProtected && nameRe && !nameRe.test(b.name)) {
      out.push(
        violation('error', 'branch-name', b.name, `브랜치 이름이 컨벤션에 맞지 않습니다`, `패턴: ${rules.branchName}`),
      )
    }

    // 2) 방치된 브랜치
    if (!isProtected && rules.staleDays > 0) {
      const age = Math.floor((now - new Date(b.date).getTime()) / DAY)
      if (age > rules.staleDays) {
        out.push(violation('warn', 'stale-branch', b.name, `${age}일 동안 커밋이 없습니다`, `기준: ${rules.staleDays}일`))
      }
    }

    // 3) 원격이 삭제된 채 남아 있는 로컬 브랜치
    if (b.gone) {
      out.push(violation('warn', 'gone-upstream', b.name, `원격 브랜치가 삭제되었습니다`, `git branch -d ${b.name}`))
    }

    // 4) 커밋 메시지 컨벤션 — 보호 브랜치는 base 대비 신규 커밋만, 그 외는 develop 대비
    if (msgRe) {
      const base = isProtected ? null : flow.develop
      const range = base && base !== b.name ? `${base}..${b.name}` : b.name
      const r = await git(cwd, [
        'log',
        '--no-merges',
        `--max-count=${rules.maxCommitsChecked || 30}`,
        `--pretty=format:%h${SEP}%s${SEP}%an`,
        range,
      ])
      if (r.ok && r.stdout) {
        for (const line of r.stdout.split('\n')) {
          const [sha, subject, author] = line.split(SEP)
          if (!msgRe.test(subject)) {
            out.push(
              violation('warn', 'commit-message', b.name, `${sha} "${truncate(subject)}" (${author})`, `패턴: ${rules.commitMessage}`),
            )
          }
        }
      }
    }

    // 5) 보호 브랜치 직접 커밋 (병합이 아닌 커밋)
    if (isProtected) {
      const r = await git(cwd, [
        'log',
        '--no-merges',
        '--first-parent',
        `--max-count=${rules.maxCommitsChecked || 30}`,
        `--pretty=format:%h${SEP}%s${SEP}%an${SEP}%ad`,
        '--date=short',
        b.name,
      ])
      if (r.ok && r.stdout) {
        const direct = r.stdout.split('\n').map((l) => l.split(SEP))
        if (direct.length) {
          out.push(
            violation(
              'info',
              'direct-commit',
              b.name,
              `보호 브랜치에 직접 커밋 ${direct.length}건 (최근 ${direct[0][3]})`,
              direct.slice(0, 3).map((d) => `${d[0]} ${truncate(d[1])}`).join(' · '),
            ),
          )
        }
      }
    }
  }

  const summary = { error: 0, warn: 0, info: 0 }
  for (const v of out) summary[v.severity] += 1
  return { violations: out, summary, checkedBranches: branches.length }
}

function safeRe(src) {
  if (!src) return null
  try {
    return new RegExp(src)
  } catch {
    return null
  }
}

const truncate = (s, n = 60) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '')
