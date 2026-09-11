/**
 * 当前文件(Current File)预留接口 —— 需求第 12.1 章。
 *
 * V0.1 不负责文件选择/切换/文件树/Sidebar。本插件假设“当前文件”由外部提供,
 * 这里只定义接缝:
 *
 *   - CurrentFileProvider:外部集成方实现,按会话返回当前文件路径;
 *   - StaticCurrentFileProvider:配置注入的静态实现(config.currentFile);
 *   - InMemoryCurrentFileStore:可编程实现(测试 / 未来桥接用)。
 *
 * TODO(当前文件集成 Current File Integration):
 *   与 dsh-better-sidebar(或未来编辑器)桥接:订阅其 currentFile 变化事件,
 *   在本插件内调用 InMemoryCurrentFileStore.setCurrentFile(sessionId, path)。
 *   该桥接属于集成层,不在本插件 V0.1 范围内实现。
 */
import { isAbsolute, resolve } from 'node:path'

/** 当前文件提供者(预留接口)。 */
export interface CurrentFileProvider {
  /** 返回该会话的当前文件路径;没有则返回 null。 */
  getCurrentFile(sessionId: string): string | null | Promise<string | null>
}

/** 当前文件变化监听器(预留接口)。 */
export type CurrentFileListener = (sessionId: string, filePath: string | null) => void

/** 带写入口的当前文件存储(集成方调用 setCurrentFile 推送变化)。 */
export interface CurrentFileStore extends CurrentFileProvider {
  /** 设置(或清除)会话的当前文件;触发已注册的监听器。 */
  setCurrentFile(sessionId: string, filePath: string | null): void
  /** 监听当前文件变化;返回取消监听的函数。 */
  onCurrentFileChanged(listener: CurrentFileListener): () => void
}

/** 内存实现:测试与未来集成的默认载体。 */
export class InMemoryCurrentFileStore implements CurrentFileStore {
  private readonly files = new Map<string, string | null>()
  private readonly listeners = new Set<CurrentFileListener>()

  getCurrentFile(sessionId: string): string | null {
    return this.files.get(sessionId) ?? null
  }

  setCurrentFile(sessionId: string, filePath: string | null): void {
    if (filePath === null) this.files.delete(sessionId)
    else this.files.set(sessionId, filePath)
    for (const listener of this.listeners) {
      try {
        listener(sessionId, filePath)
      } catch {
        // 监听器异常不阻断推送。
      }
    }
  }

  onCurrentFileChanged(listener: CurrentFileListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

/** 静态实现:所有会话返回同一个配置文件(绝对路径;相对路径按会话 cwd 解析)。 */
export class StaticCurrentFileProvider implements CurrentFileProvider {
  constructor(private readonly rawPath: string, private readonly getCwd: (sessionId: string) => Promise<string | null>) {}

  async getCurrentFile(sessionId: string): Promise<string | null> {
    const raw = this.rawPath.trim()
    if (raw === '') return null
    if (isAbsolute(raw)) return raw
    const cwd = await this.getCwd(sessionId)
    return cwd === null ? null : resolve(cwd, raw)
  }
}
