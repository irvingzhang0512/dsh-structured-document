import type { WorkspaceRegistry } from '../state/kernel.ts';
export interface TransactionToolDeps {
    registry: WorkspaceRegistry;
}
export declare function createCreateDocumentTool(deps: TransactionToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function createReplaceDocumentTool(deps: TransactionToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function createApplyDocumentPatchTool(deps: TransactionToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
