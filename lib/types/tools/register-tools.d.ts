/**
 * 工具注册:把 17 个结构化文档工具注册到 ctx.tools。
 *
 *   查看与定位:get_document / get_outline / find_node / select_node / get_selected_node
 *   基础修改:add_node / update_node / delete_node / move_node / reorder_node
 *   结构化修改:change_role / update_property
 *   历史:undo / save_document
 *   完整事务:create_document / replace_document / apply_document_patch
 *
 * 没有万能 document(command) 工具:每个工具职责单一(需求第 14 章)。
 */
import type { Context } from '../context-types.ts';
import type { WorkspaceRegistry } from '../state/kernel.ts';
/** 全部工具名(供 SKILL/docs 契约测试核对)。 */
export declare const STRUCTURED_DOCUMENT_TOOL_NAMES: readonly ["get_document", "get_outline", "find_node", "select_node", "get_selected_node", "add_node", "update_node", "delete_node", "move_node", "reorder_node", "change_role", "update_property", "undo", "save_document", "create_document", "replace_document", "apply_document_patch"];
export type StructuredDocumentToolName = (typeof STRUCTURED_DOCUMENT_TOOL_NAMES)[number];
/** 注册全部工具,返回组合 disposer。 */
export declare function registerStructuredDocumentTools(ctx: Context, registry: WorkspaceRegistry): () => void;
