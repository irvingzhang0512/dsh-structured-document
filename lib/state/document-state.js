/** 内存中的文档状态。 */
export class DocumentStateTracker {
    /** 绑定的当前文件绝对路径;未绑定为 null。 */
    currentFilePath = null;
    /** 当前节点(Selected Node)。 */
    selectedNodeId = null;
    /** 最近修改节点(Last Edited Node)。 */
    lastEditedNodeId = null;
    /** 最近新增节点(Last Created Node)。 */
    lastCreatedNodeId = null;
    /** 是否存在未保存修改(Dirty)。 */
    dirty = false;
    /** 从 sidecar 恢复状态。 */
    restorePersisted(state) {
        this.selectedNodeId = state.selected_node_id;
        this.lastEditedNodeId = state.last_edited_node_id;
        this.lastCreatedNodeId = state.last_created_node_id;
    }
    /** 导出为 sidecar 持久化结构。 */
    toPersisted() {
        return {
            selected_node_id: this.selectedNodeId,
            last_edited_node_id: this.lastEditedNodeId,
            last_created_node_id: this.lastCreatedNodeId,
        };
    }
    /** 记录一次修改(最近修改节点 + Dirty)。 */
    markEdited(nodeId) {
        if (nodeId !== null)
            this.lastEditedNodeId = nodeId;
        this.dirty = true;
    }
    /** 记录一次新增(最近新增节点 + 最近修改)。 */
    markCreated(nodeId) {
        this.lastCreatedNodeId = nodeId;
        this.markEdited(nodeId);
    }
    /** 保存成功后清除 Dirty。 */
    markSaved() {
        this.dirty = false;
    }
    /**
     * 节点被删除后清理悬空指针(指到已删除节点的指针清空)。
     * 返回被清理的指针名(用于提示)。
     */
    clearDanglingAfterDelete(deletedIds) {
        const cleared = [];
        if (this.selectedNodeId !== null && deletedIds.has(this.selectedNodeId)) {
            this.selectedNodeId = null;
            cleared.push('当前节点');
        }
        if (this.lastEditedNodeId !== null && deletedIds.has(this.lastEditedNodeId)) {
            this.lastEditedNodeId = null;
            cleared.push('最近修改节点');
        }
        if (this.lastCreatedNodeId !== null && deletedIds.has(this.lastCreatedNodeId)) {
            this.lastCreatedNodeId = null;
            cleared.push('最近新增节点');
        }
        return cleared;
    }
    /** 状态快照(工具返回用)。 */
    snapshot(doc) {
        return {
            current_file: this.currentFilePath,
            selected_node_id: this.selectedNodeId,
            last_edited_node_id: this.lastEditedNodeId,
            last_created_node_id: this.lastCreatedNodeId,
            dirty: this.dirty,
            revision: doc.revision,
        };
    }
}
