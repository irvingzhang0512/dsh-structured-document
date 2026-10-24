/**
 * 存储层:文件读写 + sidecar(伴随文件)。
 *
 * 源文件保持用户可读的 Markdown;节点 ID / 文档状态等插件数据保存在伴随文件
 * `<文件名>.sdoc.json` 中,并用源文件内容的 SHA-256 做一致性校验:源文件在外部
 * 被修改后,sidecar 失效,重新解析并重新分配 ID(见 docs/architecture.md)。
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
/** 基于真实文件系统的存储实现。 */
export class NodeFsStorage {
    async readFile(path) {
        return readFile(path, 'utf8');
    }
    /** 原子写:先写临时文件再重命名,避免半写文件。 */
    async writeFile(path, content) {
        const temp = `${path}.sdoc-tmp-${process.pid}-${Date.now()}`;
        await writeFile(temp, content, 'utf8');
        try {
            await rename(temp, path);
        }
        catch (error) {
            await unlink(temp).catch(() => { });
            throw error;
        }
    }
    async createFile(path, content) {
        await writeFile(path, content, { encoding: 'utf8', flag: 'wx' });
    }
}
/** 计算文本 SHA-256(十六进制)。 */
export function hashText(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
/** sidecar 文件路径:`<文件>.sdoc.json`。 */
export function sidecarPathFor(filePath) {
    return `${filePath}.sdoc.json`;
}
/** 读取并解析 sidecar;损坏或缺失返回 null。 */
export async function loadSidecar(storage, filePath) {
    let raw;
    try {
        raw = await storage.readFile(sidecarPathFor(filePath));
    }
    catch {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if ((parsed?.format_version !== 1 && parsed?.format_version !== 2) || parsed?.plugin !== 'dsh-structured-document')
            return null;
        if (typeof parsed.content_hash !== 'string' || typeof parsed.document !== 'object' || parsed.document === null)
            return null;
        if (parsed.format_version === 1 && !('root' in parsed.document))
            return null;
        if (parsed.format_version === 2 && !Array.isArray(parsed.document.nodes))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
/** 写入 sidecar(尽力而为:失败不阻断主流程,下次保存重试)。 */
export async function saveSidecar(storage, filePath, sidecar) {
    const target = sidecarPathFor(filePath);
    await storage.writeFile(target, JSON.stringify(sidecar, null, 2) + '\n');
}
/** 从当前 IR 创建不含业务角色/属性的 v2 sidecar。 */
export function createSidecarV2(doc, contentHash, state) {
    const nodes = [];
    const visit = (node, path) => {
        nodes.push({
            path,
            id: node.id,
            created_at: node.metadata.created_at,
            updated_at: node.metadata.updated_at,
            created_by: node.metadata.created_by,
        });
        node.children.forEach((child, index) => visit(child, [...path, index]));
    };
    visit(doc.root, []);
    return {
        format_version: 2,
        plugin: 'dsh-structured-document',
        content_hash: contentHash,
        document: {
            id: doc.id,
            revision: doc.revision,
            created_at: doc.metadata.created_at,
            updated_at: doc.metadata.updated_at,
            created_by: doc.metadata.created_by,
            node_seq: doc.metadata.node_seq,
            nodes,
        },
        state,
    };
}
/** 对内容哈希相同的 Markdown 恢复稳定 ID/版本；业务字段保持解析结果。 */
export function restoreSidecarV2(doc, sidecar) {
    const nodeAt = (path) => {
        let node = doc.root;
        for (const index of path) {
            node = node.children[index];
            if (node === undefined)
                return undefined;
        }
        return node;
    };
    for (const saved of sidecar.document.nodes) {
        const node = nodeAt(saved.path);
        if (node === undefined)
            continue;
        node.id = saved.id;
        node.metadata.created_at = saved.created_at;
        node.metadata.updated_at = saved.updated_at;
        node.metadata.created_by = saved.created_by;
    }
    doc.id = sidecar.document.id;
    doc.revision = sidecar.document.revision;
    doc.metadata.created_at = sidecar.document.created_at;
    doc.metadata.updated_at = sidecar.document.updated_at;
    doc.metadata.created_by = sidecar.document.created_by;
    doc.metadata.node_seq = Math.max(sidecar.document.node_seq, ...sidecar.document.nodes.map(node => Number(node.id.match(/node_(\d+)/)?.[1] ?? 0)));
    return doc;
}
/** sidecar 所在目录(供上层做目录级操作)。 */
export function sidecarDir(filePath) {
    return dirname(filePath);
}
