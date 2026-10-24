/**
 * 工具结果 envelope(requirements.md 第 24 章):
 *
 *   成功:{ "success": true,  "action": "add_node", "node_id": "node_023", "revision": 12, ... }
 *   失败:{ "success": false, "error": "NODE_NOT_FOUND", "message": "未找到节点:热红外验证", ... }
 *
 * 面向用户的 message 一律中文;错误码见 model/errors.ts。
 * 每个工具另附中文文本投影(render),让模型直接可读。
 */
import { type NodeCandidate } from '../model/errors.ts';
/** 成功 envelope 基础字段(工具特定字段在调用点以对象展开补充)。 */
export interface OkEnvelope {
    success: true;
    action: string;
    message: string;
    revision?: number;
}
/** 失败 envelope 基础字段。 */
export interface FailEnvelope {
    success: false;
    action: string;
    error: string;
    message: string;
    candidates?: NodeCandidate[];
}
/** 构造成功 envelope(无附加字段)。 */
export declare function ok(action: string, message: string): {
    success: true;
    action: string;
    message: string;
};
/** 构造成功 envelope(带工具特定附加字段)。 */
export declare function ok<E extends Record<string, unknown>>(action: string, message: string, extra: E): {
    success: true;
    action: string;
    message: string;
} & E;
/** 构造失败 envelope。 */
export declare function fail(action: string, error: string, message: string): {
    success: false;
    action: string;
    error: string;
    message: string;
};
/** 构造失败 envelope(带候选列表等附加字段)。 */
export declare function fail<E extends Record<string, unknown>>(action: string, error: string, message: string, extra: E): {
    success: false;
    action: string;
    error: string;
    message: string;
} & E;
/** 把 DocumentOperationError 转成失败 envelope。 */
export declare function failFromError(action: string, error: unknown): {
    success: false;
    action: string;
    error: string;
    message: string;
    candidates?: NodeCandidate[];
};
/** 提取调用方会话 ID(防御式结构读取;工具必须由会话中的 Agent 调用)。 */
export declare function sessionIdOf(exec: {
    agent?: {
        session?: {
            id?: unknown;
        };
    };
}): string | null;
/** JSON 安全的任意值(语义同 JsonValue;用于工具返回的深层数据)。 */
export type JsonValueLike = string | number | boolean | null | JsonValueLike[] | {
    [key: string]: JsonValueLike;
};
/** 深拷贝为 JSON 安全值(IR 数据本身都可 JSON 化;兜底丢弃不可序列化字段)。 */
export declare function toJsonValue(value: unknown): JsonValueLike;
/** 渲染候选节点列表(歧义提示)。 */
export declare function renderCandidates(candidates: NodeCandidate[] | undefined): string;
