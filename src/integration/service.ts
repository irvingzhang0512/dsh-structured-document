/**
 * 集成服务(StructuredDocumentService):把文档内核暴露为 cordis 服务
 * `ctx.structuredDocument`,供外部集成方(如 dsh-structured-document-view
 * 视图插件)注入使用。
 *
 * 服务语义:
 * - 按会话提供"当前文件"写入口(setCurrentFile,集成方从 Sidebar/编辑器
 *   推送当前文件变化)与文档/选中变化订阅(subscribe);
 * - 文档快照(getDocumentSnapshot)同步可得(工作区文档在内核内存中);
 * - 本插件自身不做文件选择/切换(需求第 12.1 章边界),本服务就是
 *   current-file.ts 预留接缝(TODO 当前文件集成)的落点。
 */
import type { StructuredDocument } from '../model/types.ts'
import { InMemoryCurrentFileStore } from '../plugin/current-file.ts'
import type { WorkspaceChange, WorkspaceChangeListener, WorkspaceRegistry } from '../state/kernel.ts'

/** 某会话的文档快照(同步读;document 为深拷贝)。 */
export interface DocumentSnapshot {
  document: StructuredDocument
  selectedNodeId: string | null
  currentFile: string | null
}

/** 服务可用的日志面。 */
export interface IntegrationLogger {
  warn?(message: string): void
  info?(message: string): void
}

/** 服务选项。 */
export interface StructuredDocumentServiceOptions {
  registry: WorkspaceRegistry
  /** 当前文件存储(写入口由本服务提供)。 */
  store: InMemoryCurrentFileStore
  /** 把(可能相对的)路径解析为绝对路径(相对会话工作目录)。 */
  resolvePath: (sessionId: string, rawPath: string) => Promise<string>
  logger?: IntegrationLogger
}

/** cordis 服务 `ctx.structuredDocument` 的对外形状。 */
export interface StructuredDocumentService {
  /** 服务标识。 */
  readonly id: 'dsh-structured-document'
  /**
   * 设置(或清除)会话的当前文件;触发懒绑定/按需重绑。
   * 清除只清"当前文件"指针,不自动解绑内存文档。
   */
  setCurrentFile(sessionId: string, filePath: string | null): void
  /** 读取会话当前文件(未设置返回 null)。 */
  getCurrentFile(sessionId: string): string | null
  /** 选择节点(仅更新状态指针,不修改文档)。 */
  selectNode(sessionId: string, nodeId: string | null): void
  /** 确保会话绑定当前文件;返回是否已绑定。 */
  ensureBound(sessionId: string): Promise<boolean>
  /** 订阅会话工作区变化;返回退订函数。 */
  subscribe(sessionId: string, listener: WorkspaceChangeListener): () => void
  /** 同步读取会话文档快照;未绑定返回 null。 */
  getDocumentSnapshot(sessionId: string): DocumentSnapshot | null
}

/** 服务实现。 */
export class StructuredDocumentServiceImpl implements StructuredDocumentService {
  readonly id = 'dsh-structured-document' as const
  private readonly registry: WorkspaceRegistry
  private readonly store: InMemoryCurrentFileStore
  private readonly resolvePath: (sessionId: string, rawPath: string) => Promise<string>
  private readonly logger?: IntegrationLogger

  constructor(options: StructuredDocumentServiceOptions) {
    this.registry = options.registry
    this.store = options.store
    this.resolvePath = options.resolvePath
    this.logger = options.logger
    // 自包含:若内核尚未注入任何当前文件提供者(例如无 config.currentFile
    // 且无外部 attach),本服务直接把 store 作为提供者,保证 setCurrentFile
    // 之后的懒绑定/重绑语义成立。
    if (!this.registry.hasCurrentFileProvider) {
      this.registry.attachCurrentFileProvider(this.store)
    }
  }

  getDocumentSnapshot(sessionId: string): DocumentSnapshot | null {
    const workspace = this.registry.get(sessionId)
    if (!workspace.bound) return null
    return {
      document: structuredClone(workspace.document),
      selectedNodeId: workspace.state.selectedNodeId,
      currentFile: workspace.state.currentFilePath,
    }
  }

  getCurrentFile(sessionId: string): string | null {
    return this.store.getCurrentFile(sessionId)
  }

  selectNode(sessionId: string, nodeId: string | null): void {
    const workspace = this.registry.get(sessionId)
    if (!workspace.bound) return
    void workspace.selectNode(nodeId)
  }

  setCurrentFile(sessionId: string, filePath: string | null): void {
    if (filePath === null || filePath === '') {
      this.store.setCurrentFile(sessionId, null)
      return // 不自动解绑:保留内存文档,避免意外丢失状态。
    }
    this.store.setCurrentFile(sessionId, filePath)
    void this.syncBound(sessionId, filePath)
  }

  async ensureBound(sessionId: string): Promise<boolean> {
    try {
      await this.registry.requireBound(sessionId)
      return true
    } catch {
      return false
    }
  }

  subscribe(sessionId: string, listener: WorkspaceChangeListener): () => void {
    return this.registry.onSessionChanged(sessionId, listener)
  }

  /** 确保工作区绑定 filePath:未绑定则懒绑定;已绑定且路径变化则重绑。 */
  private async syncBound(sessionId: string, filePath: string): Promise<void> {
    try {
      const workspace = this.registry.get(sessionId)
      if (!workspace.bound) {
        await this.registry.requireBound(sessionId)
        return
      }
      const resolved = await this.resolvePath(sessionId, filePath)
      if (workspace.state.currentFilePath !== resolved) {
        await workspace.bindFile(resolved)
      }
    } catch (error) {
      // 绑定失败(文件不存在/解析失败等):保留当前状态,记日志。
      this.logger?.warn?.(`[structured-document] 绑定当前文件失败(${sessionId}, ${filePath}):${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/** 导出类型(供 apply 的 service 形状引用)。 */
export type { WorkspaceChange, WorkspaceChangeListener }
