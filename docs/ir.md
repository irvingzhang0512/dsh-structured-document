# 文档 IR

结构化文档在内存与 sidecar 中的规范形态(类型定义见 [`src/model/types.ts`](../src/model/types.ts))。

## StructuredDocument

```jsonc
{
  "version": 1,
  "profile": "meeting",           // 场景模板 ID
  "title": "防干烧项目周会",        // 文档标题(来自首个 H1)
  "revision": 8,                  // 版本:初始导入为 1,每次成功提交(含撤销)+1
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z",
  "root": { "/* DocNode */": "…" },
  "metadata": {
    "node_seq": 8,                // ID 计数器:单调递增,不复用
    "eol": "\n",                  // 源文件换行风格(保留)
    "source_path": "weekly.md"    // 来源文件名
  }
}
```

## DocNode

```jsonc
{
  "id": "node_005",               // 稳定 ID:node_NNN;移动/改名后不变
  "title": "完成D灶数据采集",
  "content": "复现步骤见附件",      // 可为空串
  "role": "action_item",          // 必须属于模板角色表
  "properties": {                  // 键值必须符合角色属性声明
    "owner": "张三",
    "status": "未开始",
    "due_date": "周五"
  },
  "children": [],                  // 有序子节点
  "metadata": {                    // Markdown 往返所需的呈现信息
    "listMarker": "-"              // 列表标记(保留原样,不重编号)
  },
  "createdAt": "…", "updatedAt": "…", "createdBy": "…"
}
```

要点:

- **根节点**固定为 `node_001`,承载文档标题,不可删除、不可移动;
- **ID 稳定性**:ID 只在解析新内容时分配;此后增删改移都不改变既有节点的 ID;撤销后 ID 计数器单调(撤销后再新增不复用被撤销操作用过的号段);
- **属性值**只允许 `string | number | boolean`;
- **metadata** 是适配器细节(列表标记、任务勾选态),工具结果对外暴露的是语义字段。

## Markdown 方言

解析与序列化覆盖(`src/storage/markdown-adapter.ts`):

| 元素 | 映射 |
|---|---|
| ATX 标题 `#`–`######` | 分层节点(首个 H1 → 文档标题;H1 之后的标题按 `max(2, level)` 分层) |
| 无序列表 `-` / `*` | 默认角色 `note` 的节点(标记原样保留,不重编号) |
| 任务列表 `- [x]` / `- [ ]` | 列表节点 + 勾选元数据 |
| 围栏代码块 | 列表内容行原样保留(不参与结构解析) |
| 其他行 | 并入上方节点的 `content`(多行保留) |

序列化是解析的逆过程且**幂等**:同一文档多次 `解析 → 序列化` 结果稳定;EOL 与列表标记保留。

## Sidecar(`<file>.sdoc.json`)

```jsonc
{
  "format_version": 1,
  "plugin": "dsh-structured-document",
  "content_hash": "sha256:<hex>",   // 对应 Markdown 内容的哈希
  "document": { /* StructuredDocument */ },
  "state": {                         // 可选:跨会话状态恢复
    "selectedNodeId": "node_002",
    "lastEditedNodeId": "node_005",
    "lastCreatedNodeId": "node_005"
  }
}
```

装载规则:哈希匹配 → 采纳 sidecar IR 与状态;不匹配(或无 sidecar)→ 重新解析。sidecar 是可丢弃的缓存,删除后仅损失跨会话 ID 延续。
