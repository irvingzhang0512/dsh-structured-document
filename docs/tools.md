# Document Tools 参考

14 个工具的参数与结果。所有工具共用结果 envelope(需求第 24 章):

```jsonc
// 成功
{ "success": true, "action": "add_node", "message": "<中文说明>", "revision": 4, /* 工具特定字段 */ }
// 失败(整体回滚,不留半完成状态)
{ "success": false, "action": "add_node", "error": "INVALID_ROLE", "message": "<中文说明>", "candidates": [ /* 歧义候选,可选 */ ] }
```

错误码:`NO_CURRENT_FILE` / `FILE_NOT_FOUND` / `NODE_NOT_FOUND` / `MULTIPLE_NODES_FOUND` / `INVALID_ROLE` / `INVALID_PROPERTY` / `INVALID_OPERATION` / `SAVE_FAILED` / `VALIDATION_FAILED`。

## 公共参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `node` | string | 节点引用:`node_007` / 标题(先精确后包含)/ `@selected` / `@last_edited` / `@last_created` / `@root`。查看类与修改类工具的缺省语义见各工具 |
| `occurrence` | integer | 标题命中多个节点时选第几个(1 起;负数从末尾,-1 为最后一个) |
| `relative` | string | 相对定位:`previous_sibling` / `next_sibling` / `parent` / `first_child` / `last_child`(先解析 node 再定位) |

歧义处理:标题命中多个且未给 `occurrence` → `MULTIPLE_NODES_FOUND` + `candidates`(每项含 `node_id/title/role/path`),由调用方向用户确认,**不自动选择**。

## 查看与定位

### get_document
- 参数:无。
- 返回:`document`(完整 IR)、`profile`(模板摘要)、`state`(状态快照)、`node_count`。

### get_outline
- 参数:`max_depth?`(最多展示的层级)。
- 返回:`outline[]`(`node_id/title/role/depth/child_count`)、`total_nodes`、`profile_id`。

### find_node
- 参数:`query?`(关键词,匹配标题或内容)、`role?`、`property_key?` + `property_value?`。
- 返回:`matches[]`、`count`、`ambiguous`(`count > 1`)。

### select_node
- 参数:`node`(必填)、`occurrence?`、`relative?`。
- 返回:`node` 摘要。**副作用**:设置当前节点;尽力把状态写回 sidecar。

### get_selected_node
- 参数:无。
- 返回:`selected_node` / `last_edited_node` / `last_created_node`(可为 null)+ `state`。

## 修改(全部走校验 → 自动保存 → 版本 +1 管线)

### add_node
- 参数:`title?`、`content?`、`role?`(默认 `note`)、`properties?`(对象)、`parent?`(默认 `@selected`,无选中则 `@root`)、`position?`、`occurrence?`、`relative?`。
- 返回:`node`(新节点)、`parent`、`position`(实际插入位)。**副作用**:自动选中新节点、更新 Last Created。

### update_node
- 参数:`node`(必填)、`title?`、`content?`(整体替换,空串表示清空)。
- 返回:`node`、`changed`(`{title,content}` 哪些实际变化)。

### delete_node
- 参数:`node`(必填)、`occurrence?`、`relative?`。
- 返回:`node`(被删子树根)、`removed_count`、`cleared_pointers`(被清空的状态指针)。根节点不可删。

### move_node
- 参数:`node`(必填)、`parent`(必填)、`position?`、`occurrence?`、`relative?`。
- 返回:`node`、`from` / `to`(`{parent_id,index}`)。不可移动根节点、不可移进自身子树。

### reorder_node
- 参数:`node`(必填)、`position?` 或 `direction?`(`up/down/top/bottom`,二选一)、`occurrence?`、`relative?`。
- 返回:`node`、`from_index`、`to_index`、`moved`(已在目标位置时为 false)。

### change_role
- 参数:`node`(必填)、`role`(必填,须属于当前模板)、`occurrence?`、`relative?`。
- 返回:`node`、`from_role`、`to_role`、`removed_properties`(新角色不支持而被移除的属性,可撤销恢复)。

### update_property
- 参数:`node`(必填)、`key`(必填)、`value`(必填;`null` 表示删除)、`occurrence?`、`relative?`。
- 返回:`node`、`key`、`value`、`removed`。进度类属性接受 `"50%"` 并规整为 `50`。

## 历史与保存

### undo
- 参数:无。
- 返回:`undone_action`、`restored_node_id`、`undo_remaining`。撤销栈为空 → `INVALID_OPERATION`。撤销后文档内容回到该操作前,ID 计数器与版本号保持单调。

### save_document
- 参数:无。
- 返回:`saved`(是否实际写盘)、`was_dirty`。自动保存开启时一般无需调用。

## 参数校验

工具经 DSH `defineTool` 声明参数 schema,`execute` 入口强校验;模型产生的非法参数在进入业务层前即被拒绝(`ToolArgsError`),业务层再按模板校验角色与属性(返回 `INVALID_ROLE` / `INVALID_PROPERTY`)。
