import { createGetDocumentTool, createGetOutlineTool, createFindNodeTool, createSelectNodeTool, createGetSelectedNodeTool } from "./query-tools.js";
import { createAddNodeTool, createUpdateNodeTool, createDeleteNodeTool, createMoveNodeTool, createReorderNodeTool, createChangeRoleTool, createUpdatePropertyTool } from "./mutation-tools.js";
import { createUndoTool, createSaveDocumentTool } from "./history-tools.js";
import { createApplyDocumentPatchTool, createCreateDocumentTool, createReplaceDocumentTool } from "./transaction-tools.js";
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
    'create_document',
    'replace_document',
    'apply_document_patch',
];
/** 注册全部工具,返回组合 disposer。 */
export function registerStructuredDocumentTools(ctx, registry) {
    const deps = { registry };
    const disposers = [];
    // 查看与定位
    disposers.push(ctx.tools.register(createGetDocumentTool(deps)));
    disposers.push(ctx.tools.register(createGetOutlineTool(deps)));
    disposers.push(ctx.tools.register(createFindNodeTool(deps)));
    disposers.push(ctx.tools.register(createSelectNodeTool(deps)));
    disposers.push(ctx.tools.register(createGetSelectedNodeTool(deps)));
    // 基础修改
    disposers.push(ctx.tools.register(createAddNodeTool(deps)));
    disposers.push(ctx.tools.register(createUpdateNodeTool(deps)));
    disposers.push(ctx.tools.register(createDeleteNodeTool(deps)));
    disposers.push(ctx.tools.register(createMoveNodeTool(deps)));
    disposers.push(ctx.tools.register(createReorderNodeTool(deps)));
    // 结构化修改
    disposers.push(ctx.tools.register(createChangeRoleTool(deps)));
    disposers.push(ctx.tools.register(createUpdatePropertyTool(deps)));
    // 历史
    disposers.push(ctx.tools.register(createUndoTool(deps)));
    disposers.push(ctx.tools.register(createSaveDocumentTool(deps)));
    disposers.push(ctx.tools.register(createCreateDocumentTool(deps)));
    disposers.push(ctx.tools.register(createReplaceDocumentTool(deps)));
    disposers.push(ctx.tools.register(createApplyDocumentPatchTool(deps)));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
