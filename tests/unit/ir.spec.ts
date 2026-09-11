import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from '../../src/storage/markdown-adapter.ts'
import type { StructuredDocument } from '../../src/model/types.ts'
import { DocumentOperationError } from '../../src/model/errors.ts'
import { cloneDocument, findNodeById, isSelfOrDescendant, nodeBreadcrumb } from '../../src/model/document.ts'
import { validateDocument } from '../../src/model/validation.ts'
import { MEETING_PROFILE, PROJECT_PROFILE } from '../../src/profiles/profiles.ts'
import {
  opAddNode, opChangeRole, opDeleteNode, opMoveNode, opReorderNode, opSetProperty, opUpdateNode,
} from '../../src/operations/ops.ts'

const NOW = new Date('2026-01-15T10:00:00Z')

function newDoc(): StructuredDocument {
  return createEmptyDocument({ profileId: 'meeting', now: NOW, createdBy: 'test', fileName: 'weekly-meeting.md' })
}

function add(doc: ReturnType<typeof newDoc>, parentId: string, title: string, role?: string, properties?: Record<string, string | number | boolean>) {
  return opAddNode(doc, MEETING_PROFILE, { parentId, title, role, properties }, NOW, 'test')
}

describe('IR 与操作内核:节点 ID', () => {
  it('根节点固定为 node_001,新节点从 node_002 起单调分配', () => {
    const doc = newDoc()
    expect(doc.root.id).toBe('node_001')
    const first = add(doc, 'node_001', '议题一', 'topic')
    const second = add(doc, 'node_001', '议题二', 'topic')
    expect(first.node.id).toBe('node_002')
    expect(second.node.id).toBe('node_003')
    expect(doc.metadata.node_seq).toBe(3)
  })

  it('修改标题与移动节点不改变 Node ID', () => {
    const doc = newDoc()
    const { node } = add(doc, 'node_001', '原始标题', 'topic')
    opUpdateNode(doc, { nodeId: node.id, title: '新标题' }, NOW)
    opMoveNode(doc, { nodeId: node.id, newParentId: 'node_001', position: 0 }, NOW)
    expect(node.id).toBe(node.id)
    expect(node.title).toBe('新标题')
  })
})

describe('IR 与操作内核:新增节点', () => {
  it('默认追加到父节点末尾,指定 position 时插入正确位置', () => {
    const doc = newDoc()
    const a = add(doc, 'node_001', 'A', 'topic')
    const b = add(doc, 'node_001', 'B', 'topic')
    const c = opAddNode(doc, MEETING_PROFILE, { parentId: 'node_001', title: 'C', role: 'topic', position: 1 }, NOW, 'test')
    expect(doc.root.children.map((child) => child.title)).toEqual(['A', 'C', 'B'])
    expect(c.index).toBe(1)
    expect(a.node.id).not.toBe(b.node.id)
  })

  it('未指定角色时使用模板默认角色 note', () => {
    const doc = newDoc()
    const { node } = add(doc, 'node_001', '随手记录')
    expect(node.role).toBe('note')
  })

  it('角色不在模板中 → INVALID_ROLE', () => {
    const doc = newDoc()
    expect(() => add(doc, 'node_001', 'X', 'risk')).toThrowError(DocumentOperationError)
    try {
      add(doc, 'node_001', 'X', 'risk')
    } catch (error) {
      expect((error as DocumentOperationError).code).toBe('INVALID_ROLE')
      expect((error as DocumentOperationError).message).toContain('不在模板')
      expect((error as DocumentOperationError).message).toContain('可用角色')
    }
  })

  it('属性不属于角色 → INVALID_PROPERTY', () => {
    const doc = newDoc()
    try {
      add(doc, 'node_001', 'X', 'discussion', { owner: '张三' })
      expect.unreachable('应当抛出 INVALID_PROPERTY')
    } catch (error) {
      expect((error as DocumentOperationError).code).toBe('INVALID_PROPERTY')
    }
  })

  it('待办支持 owner/status/due_date 属性', () => {
    const doc = newDoc()
    const { node } = add(doc, 'node_001', '完成D灶数据采集', 'action_item', {
      owner: '张三', status: '未开始', due_date: '周五',
    })
    expect(node.properties.owner).toBe('张三')
  })
})

describe('IR 与操作内核:修改 / 删除', () => {
  it('update_node 至少需要标题或内容之一', () => {
    const doc = newDoc()
    const { node } = add(doc, 'node_001', 'T')
    expect(() => opUpdateNode(doc, { nodeId: node.id }, NOW)).toThrowError(DocumentOperationError)
  })

  it('删除节点连同子树;禁止删除根节点', () => {
    const doc = newDoc()
    const parent = add(doc, 'node_001', '父')
    add(doc, parent.node.id, '子')
    const result = opDeleteNode(doc, parent.node.id, NOW)
    expect(result.removedCount).toBe(2)
    expect(doc.root.children).toHaveLength(0)
    expect(() => opDeleteNode(doc, 'node_001', NOW)).toThrowError(DocumentOperationError)
  })

  it('删除不存在的节点 → NODE_NOT_FOUND', () => {
    const doc = newDoc()
    try {
      opDeleteNode(doc, 'node_999', NOW)
      expect.unreachable()
    } catch (error) {
      expect((error as DocumentOperationError).code).toBe('NODE_NOT_FOUND')
    }
  })
})

describe('IR 与操作内核:移动与排序', () => {
  it('移动节点到另一个父节点', () => {
    const doc = newDoc()
    const a = add(doc, 'node_001', 'A')
    const b = add(doc, 'node_001', 'B')
    opMoveNode(doc, { nodeId: a.node.id, newParentId: b.node.id }, NOW)
    expect(b.node.children.map((child) => child.id)).toContain(a.node.id)
    expect(doc.root.children.map((child) => child.id)).toEqual([b.node.id])
  })

  it('移动进自己的子树 → INVALID_OPERATION(防循环)', () => {
    const doc = newDoc()
    const a = add(doc, 'node_001', 'A')
    const child = add(doc, a.node.id, 'A-1')
    expect(() => opMoveNode(doc, { nodeId: a.node.id, newParentId: child.node.id }, NOW)).toThrowError(DocumentOperationError)
  })

  it('移动根节点 → INVALID_OPERATION', () => {
    const doc = newDoc()
    const a = add(doc, 'node_001', 'A')
    expect(() => opMoveNode(doc, { nodeId: 'node_001', newParentId: a.node.id }, NOW)).toThrowError(DocumentOperationError)
  })

  it('reorder:up/down/top/bottom 与 position', () => {
    const doc = newDoc()
    const a = add(doc, 'node_001', 'A')
    const b = add(doc, 'node_001', 'B')
    const c = add(doc, 'node_001', 'C')
    opReorderNode(doc, { nodeId: c.node.id, direction: 'top' }, NOW)
    expect(doc.root.children.map((child) => child.title)).toEqual(['C', 'A', 'B'])
    opReorderNode(doc, { nodeId: c.node.id, direction: 'down' }, NOW)
    expect(doc.root.children.map((child) => child.title)).toEqual(['A', 'C', 'B'])
    opReorderNode(doc, { nodeId: a.node.id, position: -1 }, NOW)
    expect(doc.root.children.map((child) => child.title)).toEqual(['C', 'B', 'A'])
    opReorderNode(doc, { nodeId: a.node.id, direction: 'up' }, NOW)
    expect(doc.root.children.map((child) => child.title)).toEqual(['C', 'A', 'B'])
    expect(() => opReorderNode(doc, { nodeId: b.node.id }, NOW)).toThrowError(DocumentOperationError)
  })

  it('reorder 越界 → INVALID_OPERATION', () => {
    const doc = newDoc()
    const a = add(doc, 'node_001', 'A')
    expect(() => opReorderNode(doc, { nodeId: a.node.id, position: 5 }, NOW)).toThrowError(DocumentOperationError)
  })
})

describe('IR 与操作内核:角色与属性', () => {
  it('change_role:讨论 → 结论;切到无属性角色时移除任务属性', () => {
    const doc = newDoc()
    const { node } = add(doc, 'node_001', 'X', 'action_item', { owner: '张三', due_date: '周五' })
    const result = opChangeRole(doc, MEETING_PROFILE, { nodeId: node.id, role: 'discussion' }, NOW)
    expect(result.fromRole).toBe('action_item')
    expect(result.toRole).toBe('discussion')
    expect(result.removedProperties).toEqual({ owner: '张三', due_date: '周五' })
    expect(node.properties).toEqual({})
  })

  it('change_role:非法角色 → INVALID_ROLE', () => {
    const doc = newDoc()
    const { node } = add(doc, 'node_001', 'X')
    try {
      opChangeRole(doc, MEETING_PROFILE, { nodeId: node.id, role: 'milestone' }, NOW)
      expect.unreachable()
    } catch (error) {
      expect((error as DocumentOperationError).code).toBe('INVALID_ROLE')
    }
  })

  it('update_property:设置 / 覆盖 / 删除;进度有范围校验', () => {
    const doc = createEmptyDocument({ profileId: 'project', now: NOW, createdBy: 'test' })
    const { node } = opAddNode(doc, PROJECT_PROFILE, { parentId: 'node_001', title: '任务', role: 'task' }, NOW, 'test')
    const set = opSetProperty(doc, PROJECT_PROFILE, { nodeId: node.id, key: 'progress', value: 50 }, NOW)
    expect(set.previous).toBeUndefined()
    expect(node.properties.progress).toBe(50)
    opSetProperty(doc, PROJECT_PROFILE, { nodeId: node.id, key: 'progress', value: 80 }, NOW)
    expect(node.properties.progress).toBe(80)
    expect(() => opSetProperty(doc, PROJECT_PROFILE, { nodeId: node.id, key: 'progress', value: 150 }, NOW)).toThrowError(DocumentOperationError)
    expect(() => opSetProperty(doc, PROJECT_PROFILE, { nodeId: node.id, key: 'unknown_key', value: 'x' }, NOW)).toThrowError(DocumentOperationError)
    const removed = opSetProperty(doc, PROJECT_PROFILE, { nodeId: node.id, key: 'progress', value: null }, NOW)
    expect(removed.removed).toBe(true)
    expect('progress' in node.properties).toBe(false)
  })
})

describe('IR 与操作内核:结构校验', () => {
  it('合法文档通过校验', () => {
    const doc = newDoc()
    add(doc, 'node_001', '议题', 'topic')
    expect(validateDocument(doc, MEETING_PROFILE)).toEqual([])
  })

  it('检测重复 ID、非法角色、非法属性', () => {
    const doc = newDoc()
    const a = add(doc, 'node_001', 'A')
    const b = add(doc, 'node_001', 'B')
    b.node.id = a.node.id
    const violations = validateDocument(doc, MEETING_PROFILE)
    expect(violations.some((line) => line.includes('重复'))).toBe(true)
  })

  it('检测父 children 结构不一致', () => {
    const doc = newDoc()
    const a = add(doc, 'node_001', 'A')
    a.node.children.push(a.node)
    const violations = validateDocument(doc, MEETING_PROFILE)
    expect(violations.length).toBeGreaterThan(0)
  })
})

describe('IR 与操作内核:树工具函数', () => {
  it('nodeBreadcrumb / isSelfOrDescendant / cloneDocument', () => {
    const doc = newDoc()
    const a = add(doc, 'node_001', '九月')
    const b = add(doc, a.node.id, '验证计划')
    expect(nodeBreadcrumb(doc, b.node.id)).toBe('九月 / 验证计划')
    expect(isSelfOrDescendant(a.node, b.node.id)).toBe(true)
    expect(isSelfOrDescendant(b.node, a.node.id)).toBe(false)
    const copy = cloneDocument(doc)
    expect(findNodeById(copy, b.node.id)?.title).toBe('验证计划')
    copy.root.title = '改过'
    expect(doc.root.title).not.toBe('改过')
  })
})
