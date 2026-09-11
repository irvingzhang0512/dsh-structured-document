/**
 * 工具注册:把 14 个结构化文档工具注册到 ctx.tools。
 *
 *   查看与定位:get_document / get_outline / find_node / select_node / get_selected_node
 *   基础修改:add_node / update_node / delete_node / move_node / reorder_node
 *   结构化修改:change_role / update_property
 *   历史:undo / save_document
 *
 * 没有万能 document(command) 工具:每个工具职责单一(需求第 14 章)。
 */
import type { Context } from '../context-types.ts'
import type { WorkspaceRegistry } from '../state/kernel.ts'
import type { ToolDeps } from './query-tools.ts'
import { createGetDocumentTool, createGetOutlineTool, createFindNodeTool, createSelectNodeTool, createGetSelectedNodeTool } from './query-tools.ts'
import { createAddNodeTool, createUpdateNodeTool, createDeleteNodeTool, createMoveNodeTool, createReorderNodeTool, createChangeRoleTool, createUpdatePropertyTool } from './mutation-tools.ts'
import { createUndoTool, createSaveDocumentTool } from './history-tools.ts'

/** 全部工具名(供 SKILL/docs 契约测试核对)。 */
export const STRUCTURED_DOCUMENT_TOOL_NAMES = [
  'get_document',
  'get_outline',
  'find_node',
  'select_node',
  'get_selected_node',
  'add_node',
  'update_node',
  'delete_node',
  'move_node',
  'reorder_node',
  'change_role',
  'update_property',
  'undo',
  'save_document',
] as const

export type StructuredDocumentToolName = (typeof STRUCTURED_DOCUMENT_TOOL_NAMES)[number]

/** 注册全部工具,返回组合 disposer。 */
export function registerStructuredDocumentTools(ctx: Context, registry: WorkspaceRegistry): () => void {
  const deps: ToolDeps = { registry }
  const disposers: Array<() => void> = []

  // 查看与定位
  disposers.push(ctx.tools.register(createGetDocumentTool(deps)))
  disposers.push(ctx.tools.register(createGetOutlineTool(deps)))
  disposers.push(ctx.tools.register(createFindNodeTool(deps)))
  disposers.push(ctx.tools.register(createSelectNodeTool(deps)))
  disposers.push(ctx.tools.register(createGetSelectedNodeTool(deps)))
  // 基础修改
  disposers.push(ctx.tools.register(createAddNodeTool(deps)))
  disposers.push(ctx.tools.register(createUpdateNodeTool(deps)))
  disposers.push(ctx.tools.register(createDeleteNodeTool(deps)))
  disposers.push(ctx.tools.register(createMoveNodeTool(deps)))
  disposers.push(ctx.tools.register(createReorderNodeTool(deps)))
  // 结构化修改
  disposers.push(ctx.tools.register(createChangeRoleTool(deps)))
  disposers.push(ctx.tools.register(createUpdatePropertyTool(deps)))
  // 历史
  disposers.push(ctx.tools.register(createUndoTool(deps)))
  disposers.push(ctx.tools.register(createSaveDocumentTool(deps)))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
