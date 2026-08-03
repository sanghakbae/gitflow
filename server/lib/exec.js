import { execFile } from 'node:child_process'

const MAX_BUFFER = 1024 * 1024 * 16

/**
 * 외부 명령을 인자 배열로 실행한다. 셸을 거치지 않으므로 경로/브랜치명에
 * 공백이나 특수문자가 있어도 안전하다.
 */
export function run(cmd, args, { cwd, timeout = 60_000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      resolve({
        cmd: [cmd, ...args].join(' '),
        cwd,
        ok: !err,
        code: err?.code ?? 0,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
      })
    })
  })
}

export const git = (cwd, args, opts) => run('git', args, { cwd, ...opts })
export const gh = (cwd, args, opts) => run('gh', args, { cwd, timeout: 30_000, ...opts })

/** 실패 시 예외를 던지는 버전. 라우트에서 잡아 400으로 반환한다. */
export async function gitOrThrow(cwd, args, opts) {
  const r = await git(cwd, args, opts)
  if (!r.ok) {
    const e = new Error(r.stderr || r.stdout || `git ${args.join(' ')} 실패`)
    e.detail = r
    throw e
  }
  return r
}

/**
 * 명령을 순서대로 실행하며 실행 로그를 쌓는다.
 * 하나라도 실패하면 즉시 중단하고 지금까지의 로그와 함께 반환한다.
 */
export async function runSteps(cwd, steps, { dryRun = false } = {}) {
  const log = []
  for (const step of steps) {
    if (!step) continue
    const [cmd, ...args] = step
    if (dryRun) {
      log.push({ cmd: [cmd, ...args].join(' '), ok: true, dryRun: true, stdout: '', stderr: '' })
      continue
    }
    const r = await run(cmd, args, { cwd })
    log.push({ cmd: r.cmd, ok: r.ok, stdout: r.stdout, stderr: r.stderr })
    if (!r.ok) return { ok: false, log }
  }
  return { ok: true, log }
}
