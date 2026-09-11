/**
 * dsh-structured-document 的 IR(Intermediate Representation,中间表示)类型定义。
 *
 * 文档 = 树。Document(文档)是根,Node(节点)是树的结点:
 *
 *   Document 文档
 *   └─ Node 节点
 *      ├─ Node
 *      ├─ Node
 *      └─ Node
 *
 * 命名规范:类名/字段名/JSON 字段使用规范英文;每个对外概念在注释中给出中文名称。
 */

/** 节点 ID 形如 `node_001`(全文档内唯一、稳定、单调分配)。 */
export type NodeId = string

/** 属性值:JSON 基础标量。 */
export type PropertyValue = string | number | boolean

/** 节点属性表(Properties,属性),如 owner/status/due_date/progress。 */
export type NodeProperties = Record<string, PropertyValue>

/**
 * 属性值类型声明(属性 schema)。
 * - string      自由文本(如 owner 负责人、due_date 截止时间)
 * - enum        推荐取值枚举(如 status 状态)
 * - integer     整数(如 progress 进度,0-100)
 */
export type PropertyValueType = 'string' | 'enum' | 'integer' | 'number'

/** 单个属性声明。 */
export interface PropertySpec {
  /** 属性键(规范英文),如 owner / status / due_date / progress。 */
  readonly key: string
  /** 中文名称,如 负责人 / 状态 / 截止时间 / 进度。 */
  readonly label: string
  /** 值类型。 */
  readonly type: PropertyValueType
  /** enum 类型的合法取值(其余类型忽略)。 */
  readonly values?: readonly string[]
  /** integer/number 类型的最小值。 */
  readonly min?: number
  /** integer/number 类型的最大值。 */
  readonly max?: number
  /** 中文说明(面向 LLM 与文档)。 */
  readonly description?: string
}

/** 角色(Role)定义:这部分内容“是什么性质”。 */
export interface RoleDefinition {
  /** 角色英文标识,如 topic / task / action_item。 */
  readonly name: string
  /** 中文名称,如 议题 / 任务 / 待办。 */
  readonly label: string
  /** 中文说明。 */
  readonly description?: string
  /** 该角色可用的属性表(键 -> 声明)。 */
  readonly properties: readonly PropertySpec[]
}

/** 场景模板(Profile)定义:提供角色与属性的推荐范围。 */
export interface ProfileDefinition {
  /** 模板英文标识:meeting / project / thinking。 */
  readonly id: string
  /** 中文名称,如 会议纪要。 */
  readonly name: string
  /** 中文说明。 */
  readonly description: string
  /** 角色表(必须包含 defaultRole)。 */
  readonly roles: readonly RoleDefinition[]
  /** 默认角色(新增节点未指定角色时使用;各模板统一为 note 笔记)。 */
  readonly defaultRole: string
}

/** 节点元信息(Metadata,元信息)。系统至少维护 created_at / updated_at / created_by。 */
export interface NodeMetadata {
  /** 创建时间(ISO 8601)。 */
  created_at: string
  /** 最后修改时间(ISO 8601)。 */
  updated_at: string
  /** 创建来源,如 `import:markdown` 或 `tool:add_node`。 */
  created_by: string
  /** Markdown 序列化补充:列表标记('-', '*', '+', '1.' 等),标题节点无此字段。 */
  listMarker?: string
  /** Markdown 任务列表勾选状态(`- [x]`)。 */
  taskChecked?: boolean
  /** 允许适配器保存额外有损往返信息。 */
  [key: string]: unknown
}

/** 文档节点(Node,节点)。 */
export interface DocNode {
  /** 节点唯一标识(稳定:改标题、移动都不变)。 */
  id: NodeId
  /** 标题(Title):这部分叫什么。可为空字符串。 */
  title: string
  /** 内容(Content):具体说了什么。普通文本或简单 Markdown,可为空。 */
  content: string
  /** 角色(Role):这部分是什么性质。必须属于当前模板的角色表。 */
  role: string
  /** 属性(Properties):负责人、状态等额外信息。可选。 */
  properties: NodeProperties
  /** 子节点(Children):下面还有哪些内容。 */
  children: DocNode[]
  /** 元信息(Metadata)。 */
  metadata: NodeMetadata
}

/** 文档元信息。 */
export interface DocumentMetadata {
  /** 创建时间(ISO 8601)。 */
  created_at: string
  /** 最后修改时间(ISO 8601)。 */
  updated_at: string
  /** 创建来源。 */
  created_by: string
  /** 节点 ID 计数器(单调递增,保证 ID 不复用)。 */
  node_seq: number
  /** 源文件换行风格('\n' 或 '\r\n'),序列化时保持一致。 */
  eol: '\n' | '\r\n'
  /** 源文件绝对路径(加载时记录)。 */
  source_path?: string
  /** 允许存储层保存额外信息。 */
  [key: string]: unknown
}

/** 结构化文档(Document,文档)。 */
export interface StructuredDocument {
  /** 文档唯一标识。 */
  id: string
  /** 文档标题(与根节点标题一致)。 */
  title: string
  /** 场景模板(Profile)标识。 */
  profile: string
  /** 根节点(文档标题本身也是一个节点)。 */
  root: DocNode
  /** 文档元信息。 */
  metadata: DocumentMetadata
  /** 当前版本:每次成功保存的修改 +1。 */
  revision: number
}

/** 节点在文档中的位置(用于删除/移动的撤销还原)。 */
export interface NodeLocation {
  /** 父节点 ID(根节点的位置没有父节点)。 */
  parentId: NodeId | null
  /** 在父节点 children 中的下标。 */
  index: number
}
