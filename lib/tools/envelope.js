/**
 * 工具结果 envelope(requirements.md 第 24 章):
 *
 *   成功:{ "success": true,  "action": "add_node", "node_id": "node_023", "revision": 12, ... }
 *   失败:{ "success": false, "error": "NODE_NOT_FOUND", "message": "未找到节点:热红外验证", ... }
 *
 * 面向用户的 message 一律中文;错误码见 model/errors.ts。
 * 每个工具另附中文文本投影(render),让模型直接可读。
 */
import { DocumentOperationError } from "../model/errors.js";
export function ok(action, message, extra) {
    if (extra === undefined)
        return { success: true, action, message };
    return { ...extra, success: true, action, message };
}
export function fail(action, error, message, extra) {
    if (extra === undefined)
        return { success: false, action, error, message };
    return { ...extra, success: false, action, error, message };
}
/** 把 DocumentOperationError 转成失败 envelope。 */
export function failFromError(action, error) {
    if (error instanceof DocumentOperationError) {
        if (error.candidates !== undefined) {
            return fail(action, error.code, error.message, { candidates: error.candidates });
        }
        return fail(action, error.code, error.message);
    }
    return fail(action, 'INVALID_OPERATION', `操作失败:${error instanceof Error ? error.message : String(error)}`);
}
/** 提取调用方会话 ID(防御式结构读取;工具必须由会话中的 Agent 调用)。 */
export function sessionIdOf(exec) {
    const id = exec.agent?.session?.id;
    return typeof id === 'string' && id !== '' ? id : null;
}
/** 深拷贝为 JSON 安全值(IR 数据本身都可 JSON 化;兜底丢弃不可序列化字段)。 */
export function toJsonValue(value) {
    return JSON.parse(JSON.stringify(value));
}
/** 渲染候选节点列表(歧义提示)。 */
export function renderCandidates(candidates) {
    if (candidates === undefined || candidates.length === 0)
        return '';
    const lines = candidates.map((candidate, index) => `  ${index + 1}. ${candidate.path}(ID:${candidate.node_id},角色:${candidate.role})`);
    return ['候选节点:', ...lines].join('\n');
}
