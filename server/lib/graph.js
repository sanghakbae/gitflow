import { git } from './exec.js'
import { layoutLanes } from '../../src/lib/laneLayout.js'

const SEP = '\x1f'

/** git log 를 읽어 레인이 배정된 그래프 데이터를 만든다. */
export async function buildGraph(cwd, { limit = 120, branch = null } = {}) {
  const fmt = ['%H', '%h', '%P', '%an', '%ad', '%s', '%D'].join('%x1f')
  const args = ['log', '--date-order', `--max-count=${limit}`, `--pretty=format:${fmt}`, '--date=iso8601']
  args.push(branch ? branch : '--all')

  const r = await git(cwd, args)
  if (!r.ok || !r.stdout) return { nodes: [], edges: [], lanes: 0 }

  const commits = r.stdout.split('\n').map((line) => {
    const [sha, short, parents, author, date, subject, refs] = line.split(SEP)
    const parentList = parents ? parents.split(' ').filter(Boolean) : []
    return {
      sha,
      short,
      parents: parentList,
      author,
      date,
      subject,
      refs: (refs || '')
        .split(', ')
        .map((s) => s.replace(/^HEAD -> /, '').trim())
        .filter(Boolean),
      isMerge: parentList.length > 1,
    }
  })

  return { ...layoutLanes(commits), truncated: commits.length >= limit }
}
