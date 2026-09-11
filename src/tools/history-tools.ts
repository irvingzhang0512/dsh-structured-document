/**
 * 历史操作工具(需求第 18、20 章):
 *   undo           撤销(V0.1 必须实现)
 *   save_document  保存文档(调试 / 特殊场景;默认自动保存)
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ok } from './envelope.ts'
import { outputSchema, withWorkspace, type ToolDeps } from './query-tools.ts'

// ─── undo 撤销 ──────────────────────────────────────────────────────────────

export function createUndoTool(deps: ToolDeps) {
  return defineTool({
    name: 'undo',
    description: '撤销:undo。撤销最近一次文档修改(新增/修改/删除/移动/排序/改角色/改属性都可撤销),文档恢复到该操作之前的状态,节点 ID 也会恢复。适合:「撤销刚才的修改」「刚才那步不要」「不对,恢复」「刚才删错了,撤销」。',
    parameters: {},
    output: {
      schema: outputSchema({
        undone_action: { type: 'string', description: '被撤销的操作名(如 add_node、delete_node)。' },
        restored_node_id: { type: 'string', description: '恢复(或再次生效)的节点 ID;与节点无关的操作省略。' },
        undo_remaining: { type: 'integer', description: '剩余可撤销步数。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, undone_action?: string, restored_node_id?: string, undo_remaining?: number, revision?: number }
        if (!v.success) return [{ type: 'text', text: `[${v.error ?? 'ERROR'}] ${v.message}` }]
        return [{ type: 'text', text: `[OK] ${v.message}\n已撤销:${v.undone_action};剩余可撤销 ${v.undo_remaining} 步;版本 ${v.revision}。` }]
      },
    },
    execute: async (_args, exec) => withWorkspace('undo', exec, deps, async (workspace) => {
      const committed = await workspace.undo()
      return ok('undo', `已撤销最近一次操作(${committed.result.undoneAction}),文档已恢复。`, {
        undone_action: committed.result.undoneAction,
        restored_node_id: committed.result.restoredNodeId ?? undefined,
        undo_remaining: workspace.undoDepth,
        revision: committed.revision,
        saved: committed.saved,
        markdownUpdated: committed.markdownUpdated,
        sidecarSaved: committed.sidecarSaved,
      })
    }),
  })
}

// ─── save_document 保存文档(调试/特殊场景)────────────────────────────────

export function createSaveDocumentTool(deps: ToolDeps) {
  return defineTool({
    name: 'save_document',
    description: '保存文档:save_document。把内存中的文档状态写入当前文件(默认修改会自动保存,此工具主要用于自动保存被关闭时手动落盘,或确认「已保存」状态)。适合:「保存一下」「确认已经落盘」。',
    parameters: {},
    output: {
      schema: outputSchema({
        was_dirty: { type: 'boolean', description: '保存前是否存在未保存修改。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, saved?: boolean, was_dirty?: boolean, revision?: number }
        if (!v.success) return [{ type: 'text', text: `[${v.error ?? 'ERROR'}] ${v.message}` }]
        return [{ type: 'text', text: `[OK] ${v.message}${v.saved === true ? '(已写盘)' : '(无未保存修改,未写盘)'};版本 ${v.revision}。` }]
      },
    },
    execute: async (_args, exec) => withWorkspace('save_document', exec, deps, async (workspace) => {
      const committed = await workspace.saveNow()
      return ok('save_document', committed.result.wasDirty ? '已保存当前文档。' : '当前文档没有未保存的修改。', {
        saved: committed.saved,
        was_dirty: committed.result.wasDirty,
        revision: committed.revision,
        markdownUpdated: committed.markdownUpdated,
        sidecarSaved: committed.sidecarSaved,
      })
    }),
  })
}
