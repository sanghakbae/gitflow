import { describe, expect, it } from 'vitest'
import { layoutLanes } from './laneLayout.js'

/** 최신순 커밋 목록을 간단히 적기 위한 도우미 */
const c = (sha, ...parents) => ({ sha, parents })

describe('layoutLanes', () => {
  it('일직선 이력은 레인 하나만 쓴다', () => {
    const { nodes, edges, lanes } = layoutLanes([c('c', 'b'), c('b', 'a'), c('a')])

    expect(lanes).toBe(1)
    expect(nodes.map((n) => n.lane)).toEqual([0, 0, 0])
    expect(nodes.map((n) => n.row)).toEqual([0, 1, 2])
    expect(edges).toHaveLength(2)
    expect(edges.every((e) => e.fromLane === 0 && e.toLane === 0)).toBe(true)
  })

  it('병합 커밋의 두 번째 부모는 새 레인을 잡는다', () => {
    //   m (merge of main, side)
    //   ├── a (main)
    //   └── s (side)
    //       a, s 모두 부모 base
    const { lanes, edges } = layoutLanes([c('m', 'a', 's'), c('a', 'base'), c('s', 'base'), c('base')])

    expect(lanes).toBeGreaterThan(1)
    const mergeEdge = edges.find((e) => e.from === 'm' && e.to === 's')
    expect(mergeEdge.merge).toBe(true)
    expect(mergeEdge.toLane).not.toBe(mergeEdge.fromLane)
  })

  it('조회 범위 밖의 부모로는 간선을 만들지 않는다', () => {
    // b 의 부모 zzz 는 목록에 없다 (조회 한도에 잘린 경우)
    const { edges } = layoutLanes([c('b', 'zzz')])
    expect(edges).toHaveLength(0)
  })

  it('모든 간선의 행 번호가 실제 노드 위치와 맞는다', () => {
    const { nodes, edges } = layoutLanes([c('d', 'c'), c('c', 'a', 'b'), c('b', 'a'), c('a')])
    const rowOf = new Map(nodes.map((n) => [n.sha, n.row]))

    for (const e of edges) {
      expect(e.fromRow).toBe(rowOf.get(e.from))
      expect(e.toRow).toBe(rowOf.get(e.to))
      // 부모는 항상 자식보다 아래에 그려진다
      expect(e.toRow).toBeGreaterThan(e.fromRow)
    }
  })

  it('레인 수는 실제로 쓰인 최대 레인과 일치한다', () => {
    const { nodes, edges, lanes } = layoutLanes([c('m', 'a', 's'), c('a', 'base'), c('s', 'base'), c('base')])
    const used = Math.max(...nodes.map((n) => n.lane), ...edges.map((e) => Math.max(e.fromLane, e.toLane)))
    expect(lanes).toBe(used + 1)
  })

  it('빈 목록도 처리한다', () => {
    expect(layoutLanes([])).toEqual({ nodes: [], edges: [], lanes: 1 })
  })
})
