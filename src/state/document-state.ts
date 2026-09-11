/**
 * 文档状态(Document State):维护 requirements.md 第 12 章要求的状态字段。
 *
 *   Current File        当前文件(绑定路径)
 *   Selected Node       当前节点
 *   Last Edited Node    最近修改节点
 *   Last Created Node   最近新增节点
 *   Dirty               是否存在未保存修改
 *   Revision            当前版本(镜像 document.revision)
 */
import type { StructuredDocument } from '../model/types.ts'
import type { PersistedState } from '../storage/storage.ts'

/** 内存中的文档状态。 */
export class DocumentStateTracker {
  /** 绑定的当前文件绝对路径;未绑定为 null。 */
  currentFilePath: string | null = null
  /** 当前节点(Selected Node)。 */
  selectedNodeId: string | null = null
  /** 最近修改节点(Last Edited Node)。 */
  lastEditedNodeId: string | null = null
  /** 最近新增节点(Last Created Node)。 */
  lastCreatedNodeId: string | null = null
  /** 是否存在未保存修改(Dirty)。 */
  dirty = false

  /** 从 sidecar 恢复状态。 */
  restorePersisted(state: PersistedState): void {
    this.selectedNodeId = state.selected_node_id
    this.lastEditedNodeId = state.last_edited_node_id
    this.lastCreatedNodeId = state.last_created_node_id
  }

  /** 导出为 sidecar 持久化结构。 */
  toPersisted(): PersistedState {
    return {
      selected_node_id: this.selectedNodeId,
      last_edited_node_id: this.lastEditedNodeId,
      last_created_node_id: this.lastCreatedNodeId,
    }
  }

  /** 记录一次修改(最近修改节点 + Dirty)。 */
  markEdited(nodeId: string | null): void {
    if (nodeId !== null) this.lastEditedNodeId = nodeId
    this.dirty = true
  }

  /** 记录一次新增(最近新增节点 + 最近修改)。 */
  markCreated(nodeId: string): void {
    this.lastCreatedNodeId = nodeId
    this.markEdited(nodeId)
  }

  /** 保存成功后清除 Dirty。 */
  markSaved(): void {
    this.dirty = false
  }

  /**
   * 节点被删除后清理悬空指针(指到已删除节点的指针清空)。
   * 返回被清理的指针名(用于提示)。
   */
  clearDanglingAfterDelete(deletedIds: ReadonlySet<string>): string[] {
    const cleared: string[] = []
    if (this.selectedNodeId !== null && deletedIds.has(this.selectedNodeId)) {
      this.selectedNodeId = null
      cleared.push('当前节点')
    }
    if (this.lastEditedNodeId !== null && deletedIds.has(this.lastEditedNodeId)) {
      this.lastEditedNodeId = null
      cleared.push('最近修改节点')
    }
    if (this.lastCreatedNodeId !== null && deletedIds.has(this.lastCreatedNodeId)) {
      this.lastCreatedNodeId = null
      cleared.push('最近新增节点')
    }
    return cleared
  }

  /** 状态快照(工具返回用)。 */
  snapshot(doc: StructuredDocument): DocumentStateSnapshot {
    return {
      current_file: this.currentFilePath,
      selected_node_id: this.selectedNodeId,
      last_edited_node_id: this.lastEditedNodeId,
      last_created_node_id: this.lastCreatedNodeId,
      dirty: this.dirty,
      revision: doc.revision,
    }
  }
}

/** 对外暴露的状态快照结构。 */
export interface DocumentStateSnapshot {
  current_file: string | null
  selected_node_id: string | null
  last_edited_node_id: string | null
  last_created_node_id: string | null
  dirty: boolean
  revision: number
}
