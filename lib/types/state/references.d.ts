/**
 * 节点引用解析(Node Reference Resolution)。
 *
 * 工具的 `node` 参数是一个统一引用字符串,支持(requirements.md 第 22 章的中文
 * 指代由 SKILL.md 教 LLM 映射到这些引用):
 *
 *   `node_007`       节点 ID(精确)
 *   `@selected`      当前节点(Selected Node)
 *   `@last_edited`   最近修改节点(Last Edited Node)
 *   `@last_created`  最近新增节点(Last Created Node)
 *   `@root`          根节点(文档标题)
 *   其他文本          按标题匹配(先精确后包含;多候选报 MULTIPLE_NODES_FOUND)
 *
 * `occurrence` 用于同名歧义:第 N 个(1 起;负数从末尾计数,-1 = 最后一个)。
 * `relative` 在基础引用解析后做相对定位:previous_sibling / next_sibling /
 * parent / first_child / last_child。
 */
import type { DocNode, StructuredDocument } from '../model/types.ts';
import type { DocumentStateTracker } from './document-state.ts';
/** 支持的相对定位。 */
export type RelativePosition = 'previous_sibling' | 'next_sibling' | 'parent' | 'first_child' | 'last_child';
/** 工具层传来的引用参数。 */
export interface NodeRefArgs {
    node?: string;
    occurrence?: number;
    relative?: RelativePosition;
}
export declare const SPECIAL_REFS: readonly ["@selected", "@last_edited", "@last_created", "@root"];
/** 引用解析结果。 */
export interface ResolvedRef {
    node: DocNode;
    /** 是否经过 relative 定位(用于提示)。 */
    relativeApplied?: RelativePosition;
}
/** 解析引用字符串为具体节点;失败抛 DocumentOperationError。 */
export declare function resolveNodeRef(doc: StructuredDocument, state: DocumentStateTracker, args: NodeRefArgs, hint: string): ResolvedRef;
