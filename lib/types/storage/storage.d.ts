import type { StructuredDocument } from '../model/types.ts';
/** 存储接口(可注入替身以模拟保存失败等场景)。 */
export interface DocumentStorage {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    /** Create without replacing an existing file. */
    createFile?(path: string, content: string): Promise<void>;
}
/** 基于真实文件系统的存储实现。 */
export declare class NodeFsStorage implements DocumentStorage {
    readFile(path: string): Promise<string>;
    /** 原子写:先写临时文件再重命名,避免半写文件。 */
    writeFile(path: string, content: string): Promise<void>;
    createFile(path: string, content: string): Promise<void>;
}
/** 计算文本 SHA-256(十六进制)。 */
export declare function hashText(text: string): string;
/** sidecar 文件路径:`<文件>.sdoc.json`。 */
export declare function sidecarPathFor(filePath: string): string;
/** 持久化的文档状态(跨会话恢复)。 */
export interface PersistedState {
    selected_node_id: string | null;
    last_edited_node_id: string | null;
    last_created_node_id: string | null;
}
/** sidecar 文件结构。 */
export interface SidecarV1 {
    format_version: 1;
    plugin: 'dsh-structured-document';
    /** 生成 sidecar 时源文件内容的 SHA-256。 */
    content_hash: string;
    document: StructuredDocument;
    state: PersistedState;
}
export interface SidecarNodeState {
    path: number[];
    id: string;
    created_at: string;
    updated_at: string;
    created_by: string;
}
/** v2 只保存稳定 ID 与运行时状态；角色和业务属性以 Markdown 为准。 */
export interface SidecarV2 {
    format_version: 2;
    plugin: 'dsh-structured-document';
    content_hash: string;
    document: {
        id: string;
        revision: number;
        created_at: string;
        updated_at: string;
        created_by: string;
        node_seq: number;
        nodes: SidecarNodeState[];
    };
    state: PersistedState;
}
export type SidecarFile = SidecarV1 | SidecarV2;
/** 读取并解析 sidecar;损坏或缺失返回 null。 */
export declare function loadSidecar(storage: DocumentStorage, filePath: string): Promise<SidecarFile | null>;
/** 写入 sidecar(尽力而为:失败不阻断主流程,下次保存重试)。 */
export declare function saveSidecar(storage: DocumentStorage, filePath: string, sidecar: SidecarFile): Promise<void>;
/** 从当前 IR 创建不含业务角色/属性的 v2 sidecar。 */
export declare function createSidecarV2(doc: StructuredDocument, contentHash: string, state: PersistedState): SidecarV2;
/** 对内容哈希相同的 Markdown 恢复稳定 ID/版本；业务字段保持解析结果。 */
export declare function restoreSidecarV2(doc: StructuredDocument, sidecar: SidecarV2): StructuredDocument;
/** sidecar 所在目录(供上层做目录级操作)。 */
export declare function sidecarDir(filePath: string): string;
