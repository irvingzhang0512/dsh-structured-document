/**
 * 当前文件(Current File)接口 —— 需求第 12.1 章。
 *
 * V0.1 不负责文件选择/切换/文件树/Sidebar。本插件假设“当前文件”由外部提供,
 * 这里只定义接缝:
 *
 *   - CurrentFileProvider:外部集成方实现,按会话返回当前文件路径;
 *   - StaticCurrentFileProvider:配置注入的静态实现(config.currentFile);
 *   - InMemoryCurrentFileStore:可编程实现，供 StructuredDocumentService 与外部桥接使用。
 *
 * dsh-discussion-workbench 通过 StructuredDocumentService 固定整理目标；
 * 未安装工作台时，dsh-structured-document-view 仍可按编辑器当前文件驱动它。
 */
import { isAbsolute, resolve } from 'node:path';
/** 内存实现:测试与未来集成的默认载体。 */
export class InMemoryCurrentFileStore {
    files = new Map();
    listeners = new Set();
    getCurrentFile(sessionId) {
        return this.files.get(sessionId) ?? null;
    }
    setCurrentFile(sessionId, filePath) {
        if (filePath === null)
            this.files.delete(sessionId);
        else
            this.files.set(sessionId, filePath);
        for (const listener of this.listeners) {
            try {
                listener(sessionId, filePath);
            }
            catch {
                // 监听器异常不阻断推送。
            }
        }
    }
    onCurrentFileChanged(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}
/** 静态实现:所有会话返回同一个配置文件(绝对路径;相对路径按会话 cwd 解析)。 */
export class StaticCurrentFileProvider {
    rawPath;
    getCwd;
    constructor(rawPath, getCwd) {
        this.rawPath = rawPath;
        this.getCwd = getCwd;
    }
    async getCurrentFile(sessionId) {
        const raw = this.rawPath.trim();
        if (raw === '')
            return null;
        if (isAbsolute(raw))
            return raw;
        const cwd = await this.getCwd(sessionId);
        return cwd === null ? null : resolve(cwd, raw);
    }
}
