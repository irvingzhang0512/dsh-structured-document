/**
 * Markdown 适配器:把“当前文件”的 Markdown 文本解析为 IR,再把 IR 序列化回
 * Markdown。这是 V0.1 的文档源格式(需求第 8 章:普通文本 + 简单 Markdown)。
 *
 * 解析规则(V0.1):
 * - ATX 标题(`#`~`######`)→ 结构节点;第一个 H1 作为文档标题(根节点)。
 * - 列表项(`-` `*` `+` `1.` `1)`,按缩进嵌套)→ 列表节点;保留原始 marker,
 *   序列化时原样写回(不重新编号);`- [ ]` / `- [x]` 任务列表记录勾选状态。
 * - 普通文本行 → 归入最近打开节点的内容(Content);围栏代码块(``` / ~~~)
 *   内的行原样归入内容,不参与结构解析。
 * - 空行仅作段落分隔,序列化时不保留(内容行数可能减少,文字不丢失)。
 *
 * 已知限制(记录于 docs/ir.md):Setext 标题(`标题` 下划线 `===`)按普通文本
 * 处理;列表缩进按规范风格输出(2 空格一层);标题层级超过 6 时按 6 输出。
 */
import type { DocNode, StructuredDocument } from '../model/types.ts';
/** 解析选项。 */
export interface ParseOptions {
    /** 场景模板 ID。 */
    profileId: string;
    /** 解析时间(写入节点元信息)。 */
    now: Date;
    /** 创建来源(写入节点元信息)。 */
    createdBy: string;
    /** 文件名(用于文档 ID 与缺省标题)。 */
    fileName?: string;
}
/** 解析结果。 */
export interface ParseResult {
    doc: StructuredDocument;
    /** Markdown Front Matter 中声明或回退得到的最终 Profile。 */
    profileId: string;
}
/** 创建一个带根节点的空文档(根节点固定为 node_001)。 */
export declare function createEmptyDocument(options: ParseOptions, sourcePath?: string): StructuredDocument;
/**
 * 解析 Markdown 文本为结构化文档。
 * 节点 ID 按出现顺序(前序)分配:根 node_001,其余 node_002 起。
 */
export declare function parseMarkdown(text: string, options: ParseOptions, sourcePath?: string): ParseResult;
/** 把结构化文档序列化为 Markdown 文本(EOL 风格与解析时一致)。 */
export declare function serializeMarkdown(doc: StructuredDocument): string;
/** 从文档中摘取一个子树的文本概要(调试用)。 */
export declare function summarizeNode(node: DocNode): string;
