/**
 * 커밋 목록에 레인(세로 열)을 배정한다. 로컬 서버와 GitHub API 백엔드가 함께 쓴다.
 *
 * @param {Array<{sha:string, parents:string[]}>} commits 최신순으로 정렬된 커밋
 * @returns {{nodes:Array, edges:Array, lanes:number}}
 */
export function layoutLanes(commits) {
  const index = new Map(commits.map((c, i) => [c.sha, i]))
  const lanes = [] // lanes[i] = 그 레인이 기다리는 커밋 sha
  let maxLane = 0

  const takeLane = (sha) => {
    const found = lanes.indexOf(sha)
    if (found !== -1) return found
    const free = lanes.indexOf(null)
    if (free !== -1) {
      lanes[free] = sha
      return free
    }
    lanes.push(sha)
    return lanes.length - 1
  }

  const nodes = []
  const edges = []

  commits.forEach((c, row) => {
    const lane = takeLane(c.sha)
    maxLane = Math.max(maxLane, lane)
    nodes.push({ ...c, row, lane })

    // 이 커밋이 점유하던 레인을 비우고 부모에게 넘긴다.
    lanes[lane] = null
    c.parents.forEach((p, i) => {
      if (!index.has(p)) return // 조회 범위 밖의 부모
      let parentLane
      if (i === 0) {
        // 첫 부모는 같은 레인을 이어받는다 (이미 다른 레인이 기다리고 있으면 그쪽으로)
        const existing = lanes.indexOf(p)
        if (existing !== -1) parentLane = existing
        else {
          lanes[lane] = p
          parentLane = lane
        }
      } else {
        parentLane = takeLane(p)
      }
      maxLane = Math.max(maxLane, parentLane)
      edges.push({ from: c.sha, to: p, fromLane: lane, toLane: parentLane, fromRow: row, toRow: index.get(p), merge: i > 0 })
    })

    // 같은 sha 를 두 레인이 동시에 기다리지 않도록 정리
    for (let i = 0; i < lanes.length; i += 1) {
      if (lanes[i] !== null && lanes.indexOf(lanes[i]) !== i) lanes[i] = null
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()
  })

  return { nodes, edges, lanes: maxLane + 1 }
}
