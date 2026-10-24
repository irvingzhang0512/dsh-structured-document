import type { ParameterPropertySpec, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { DocNode } from '../model/types.ts';
import type { SessionWorkspace, WorkspaceRegistry } from '../state/kernel.ts';
import { type FailEnvelope } from './envelope.ts';
/** 工具依赖(可注入,便于测试)。 */
export interface ToolDeps {
    registry: WorkspaceRegistry;
}
/** 公共参数:节点引用(const 保持字面量类型,供 defineTool 推断)。 */
export declare const NODE_REF_PARAM: {
    readonly type: "string";
    readonly description: "节点引用:节点 ID(node_007)/ 标题文本(先精确后包含匹配)/ @selected 当前节点 / @last_edited 最近修改节点 / @last_created 最近新增节点 / @root 根节点。省略时默认作用于当前节点。";
};
/** 公共参数:同名歧义消解。 */
export declare const OCCURRENCE_PARAM: {
    readonly type: "integer";
    readonly description: "当标题匹配到多个节点时选第几个(从 1 起;负数从末尾计数,-1 表示最后一个)。";
};
/** 公共参数:相对定位。 */
export declare const RELATIVE_PARAM: {
    readonly type: "string";
    readonly enum: readonly ["previous_sibling", "next_sibling", "parent", "first_child", "last_child"];
    readonly description: "相对定位(先解析 node,再做相对定位):previous_sibling 上一条 / next_sibling 下一条 / parent 父节点 / first_child 第一个子节点 / last_child 最后一个子节点。";
};
/**
 * envelope 基础输出字段(const 字面量,保证 defineTool 精确推断)。
 * success/action/message 恒存在;工具特定字段因失败路径不存在而一律可选。
 */
export declare const BASE_OUTPUT: {
    readonly success: {
        readonly type: "boolean";
        readonly required: true;
        readonly description: "是否成功。";
    };
    readonly action: {
        readonly type: "string";
        readonly required: true;
        readonly description: "工具动作名。";
    };
    readonly message: {
        readonly type: "string";
        readonly required: true;
        readonly description: "中文结果说明。";
    };
    readonly revision: {
        readonly type: "integer";
        readonly description: "当前文档版本。";
    };
    readonly saved: {
        readonly type: "boolean";
        readonly description: "本次是否已持久化。";
    };
    readonly markdownUpdated: {
        readonly type: "boolean";
        readonly description: "本次是否已把完整业务信息写入 Markdown。";
    };
    readonly sidecarSaved: {
        readonly type: "boolean";
        readonly description: "内部 sidecar 状态是否同步成功；false 不表示 Markdown 业务数据丢失。";
    };
    readonly error: {
        readonly type: "string";
        readonly description: "失败时的错误码。";
    };
    readonly candidates: {
        readonly type: "array";
        readonly description: "多候选歧义时的候选节点列表(禁止随机选择,需向用户确认)。";
        readonly items: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly node_id: {
                    readonly type: "string";
                    readonly required: true;
                    readonly description: "节点 ID。";
                };
                readonly title: {
                    readonly type: "string";
                    readonly required: true;
                    readonly description: "标题。";
                };
                readonly role: {
                    readonly type: "string";
                    readonly required: true;
                    readonly description: "角色。";
                };
                readonly path: {
                    readonly type: "string";
                    readonly required: true;
                    readonly description: "从根到该节点的标题路径。";
                };
            };
        };
    };
};
/**
 * 组合输出根 schema。泛型 + 字面量保持,让 defineTool 的 const O 推断出精确类型,
 * execute 的返回值据此受类型检查(宽化会让推断塌缩为 never)。
 */
export declare function outputSchema<const E extends Record<string, ParameterPropertySpec>>(extra: E): {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly success: {
            readonly type: "boolean";
            readonly required: true;
            readonly description: "是否成功。";
        };
        readonly action: {
            readonly type: "string";
            readonly required: true;
            readonly description: "工具动作名。";
        };
        readonly message: {
            readonly type: "string";
            readonly required: true;
            readonly description: "中文结果说明。";
        };
        readonly revision: {
            readonly type: "integer";
            readonly description: "当前文档版本。";
        };
        readonly saved: {
            readonly type: "boolean";
            readonly description: "本次是否已持久化。";
        };
        readonly markdownUpdated: {
            readonly type: "boolean";
            readonly description: "本次是否已把完整业务信息写入 Markdown。";
        };
        readonly sidecarSaved: {
            readonly type: "boolean";
            readonly description: "内部 sidecar 状态是否同步成功；false 不表示 Markdown 业务数据丢失。";
        };
        readonly error: {
            readonly type: "string";
            readonly description: "失败时的错误码。";
        };
        readonly candidates: {
            readonly type: "array";
            readonly description: "多候选歧义时的候选节点列表(禁止随机选择,需向用户确认)。";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly node_id: {
                        readonly type: "string";
                        readonly required: true;
                        readonly description: "节点 ID。";
                    };
                    readonly title: {
                        readonly type: "string";
                        readonly required: true;
                        readonly description: "标题。";
                    };
                    readonly role: {
                        readonly type: "string";
                        readonly required: true;
                        readonly description: "角色。";
                    };
                    readonly path: {
                        readonly type: "string";
                        readonly required: true;
                        readonly description: "从根到该节点的标题路径。";
                    };
                };
            };
        };
    } & E;
};
/** 统一执行壳:会话解析 + 当前文件懒绑定 + 错误转 envelope。 */
export declare function withWorkspace<T>(action: string, exec: ToolRunContext, deps: ToolDeps, fn: (workspace: SessionWorkspace) => Promise<T>): Promise<T | FailEnvelope>;
/** 节点摘要(工具返回用)。 */
export declare function nodeSummary(workspace: SessionWorkspace, node: DocNode): {
    node_id: string;
    title: string;
    role: string;
    path: string;
    properties: import("../model/types.ts").NodeProperties;
};
export declare function createGetDocumentTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function createGetOutlineTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function createFindNodeTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function createSelectNodeTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function createGetSelectedNodeTool(deps: ToolDeps): import("@deepseek-ai/dsh-tools").ToolDefinition;
