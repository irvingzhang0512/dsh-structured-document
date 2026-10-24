/**
 * 文档操作内核(Operation Kernel):对工作副本执行具体的树操作。
 *
 * 设计要点:
 * - 所有操作都作用在“工作副本”上(由内核先深拷贝),操作失败抛
 *   DocumentOperationError,不会留下半完成状态;
 * - 操作通过结构校验后才由内核提交并保存;撤销(Undo)采用文档快照,
 *   因此本模块只负责“向前”的变更,不需要逆向描述;
 * - 本模块不接触文件系统,便于单元测试。
 */
import type { DocNode, NodeProperties, ProfileDefinition, PropertyValue, StructuredDocument } from '../model/types.ts';
/** 通用时间源:便于测试注入固定时间。 */
export type NowSource = () => Date;
export declare function defaultNow(): Date;
/** 把 insert 位置规范化为 0..length 的整数下标;不合法抛 INVALID_OPERATION。 */
export declare function normalizeInsertIndex(position: number | undefined, length: number, hint: string): number;
/** 把子项位置规范化为 0..length-1 的整数下标;不合法抛 INVALID_OPERATION。 */
export declare function normalizeChildIndex(position: number, length: number, hint: string): number;
export interface AddNodeArgs {
    parentId: string;
    position?: number;
    title?: string;
    content?: string;
    role?: string;
    properties?: NodeProperties;
}
export interface AddNodeResult {
    node: DocNode;
    parentId: string;
    index: number;
}
/** 校验并整理新增节点的属性(按角色声明逐个检查)。 */
export declare function validatePropertiesForRole(profile: ProfileDefinition, role: string, properties: NodeProperties | undefined): NodeProperties;
/** 新增节点:默认追加到父节点末尾。 */
export declare function opAddNode(doc: StructuredDocument, profile: ProfileDefinition, args: AddNodeArgs, now: Date, createdBy: string): AddNodeResult;
export interface UpdateNodeArgs {
    nodeId: string;
    title?: string;
    content?: string;
}
export interface UpdateNodeResult {
    node: DocNode;
    changed: {
        title: boolean;
        content: boolean;
    };
}
/** 修改节点标题 / 内容(至少给出一项)。 */
export declare function opUpdateNode(doc: StructuredDocument, args: UpdateNodeArgs, now: Date): UpdateNodeResult;
export interface DeleteNodeResult {
    /** 被移除的子树根(已从树上摘除)。 */
    removed: DocNode;
    parentId: string;
    index: number;
    /** 被删除的节点总数(含子孙)。 */
    removedCount: number;
}
/** 删除节点(连同其子树);禁止删除根节点。 */
export declare function opDeleteNode(doc: StructuredDocument, nodeId: string, now: Date): DeleteNodeResult;
/** 找到目标节点的父节点;不存在返回 undefined(根节点返回 null 语义由调用方区分)。 */
export declare function findParentOf(doc: StructuredDocument, nodeId: string): DocNode | undefined;
export interface MoveNodeArgs {
    nodeId: string;
    newParentId: string;
    /** 插入位置(按插入后的位置计);缺省追加到末尾。 */
    position?: number;
}
export interface MoveNodeResult {
    nodeId: string;
    fromParentId: string;
    fromIndex: number;
    toParentId: string;
    toIndex: number;
}
/** 移动节点到新的父节点;防止移进自身子树(循环)与移动根节点。 */
export declare function opMoveNode(doc: StructuredDocument, args: MoveNodeArgs, now: Date): MoveNodeResult;
export type ReorderDirection = 'up' | 'down' | 'top' | 'bottom';
export interface ReorderNodeArgs {
    nodeId: string;
    /** 目标位置(兄弟间的 0 基下标;负数从末尾计数,-1 表示最后)。 */
    position?: number;
    direction?: ReorderDirection;
}
/** 调整节点在兄弟中的顺序(同父;up/down 到边界时为空操作)。 */
export declare function opReorderNode(doc: StructuredDocument, args: ReorderNodeArgs, now: Date): MoveNodeResult;
export interface ChangeRoleArgs {
    nodeId: string;
    role: string;
}
export interface ChangeRoleResult {
    node: DocNode;
    fromRole: string;
    toRole: string;
    /** 因新角色不再支持而被移除的属性。 */
    removedProperties: Record<string, PropertyValue>;
}
/** 修改节点角色;新角色不支持的原属性会被移除(撤销可恢复)。 */
export declare function opChangeRole(doc: StructuredDocument, profile: ProfileDefinition, args: ChangeRoleArgs, now: Date): ChangeRoleResult;
export interface SetPropertyArgs {
    nodeId: string;
    key: string;
    /** null 表示删除该属性。 */
    value: PropertyValue | null;
}
export interface SetPropertyResult {
    node: DocNode;
    key: string;
    previous: PropertyValue | undefined;
    removed: boolean;
}
/** 修改节点属性(按角色声明校验;value 传 null 删除属性)。 */
export declare function opSetProperty(doc: StructuredDocument, profile: ProfileDefinition, args: SetPropertyArgs, now: Date): SetPropertyResult;
