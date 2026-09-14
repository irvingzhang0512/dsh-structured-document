# 发布检查清单

对照需求第 41 章 28 条验收标准逐条核对(v0.1.0,2026-01-15)。依据:自动化测试 8 个文件 79 条全部通过(`npm test`)、`npm run typecheck` 零错误、`npm run build` 产物可用。

| # | 验收标准 | 结论 | 依据 |
|---|---|---|---|
| 1 | 可以加载 Current File | ✅ | `requireBound` 懒绑定 + CurrentFileProvider 接缝;无当前文件如实报 `NO_CURRENT_FILE`(tools.spec「无会话/未绑定」) |
| 2 | 可以获取完整 Document | ✅ | `get_document`(tools.spec + meeting 场景) |
| 3 | 可以获取 Outline | ✅ | `get_outline`(`max_depth` 生效;meeting/project/thinking 场景) |
| 4 | 可以查找 Node | ✅ | `find_node`(关键词 / 角色 / 属性;`ambiguous` 标记) |
| 5 | 可以选择 Node | ✅ | `select_node` + `get_selected_node` |
| 6 | 可以新增 Node | ✅ | `add_node`(标题/内容/角色/属性/位置一次给全) |
| 7 | 可以修改 Node | ✅ | `update_node`(标题/内容,`changed` 如实回报) |
| 8 | 可以删除 Node | ✅ | `delete_node`(含子树、指针清理、`removed_count`) |
| 9 | 可以移动 Node | ✅ | `move_node`(防移进自身子树、防移根) |
| 10 | 可以调整节点顺序 | ✅ | `reorder_node`(position / up/down/top/bottom) |
| 11 | 可以修改 Role | ✅ | `change_role`(属性裁剪 + `removed_properties`) |
| 12 | 可以修改 Properties | ✅ | `update_property`(设置/删除,"50%" 规整) |
| 13 | 可以自动保存 | ✅ | autoSave 管线:临时文件原子写 + sidecar;`SAVE_FAILED` 整体回滚(project 场景) |
| 14 | 可以 Undo | ✅ | `undo`(快照式,可连续;版本与 ID 计数器单调) |
| 15 | 可以维护 Selected Node | ✅ | add 自动选中、select 设置、删除清理(tools.spec + 场景) |
| 16 | 可以维护 Last Edited Node | ✅ | 修改类操作更新;undo 恢复受影响节点 |
| 17 | 可以维护 Last Created Node | ✅ | add 更新;删除清理;`get_selected_node` 可查 |
| 18 | 支持会议纪要 Profile | ✅ | `meeting`:7 角色 + action_item 属性(meeting 场景全程) |
| 19 | 支持项目管理 Profile | ✅ | `project`:7 角色 + task 四属性含 progress(project 场景全程) |
| 20 | 支持思路整理 Profile | ✅ | `thinking`:7 角色(thinking 场景全程) |
| 21 | 提供中文优先的 SKILL.md | ✅ | `skills/structured-document/SKILL.md` 全中文,frontmatter + 铁律 + 映射表(skill.spec) |
| 22 | 可以通过连续中文自然语言完成文档修改 | ✅ | 三场景按 SKILL.md 映射规则连续 9+ 轮中文操作(含指代) |
| 23 | 三套场景测试通过 | ✅ | `tests/scenarios/`(meeting/project/thinking,真实文件读写) |
| 24 | 多轮指代测试通过 | ✅ | `@selected` / `@last_created` / `previous_sibling` / `occurrence`(含 -1)/ "第二个" |
| 25 | 歧义节点不能被错误自动选择 | ✅ | `MULTIPLE_NODES_FOUND` + `candidates`;须 occurrence 或用户确认(meeting/thinking 场景) |
| 26 | README、架构、Tool、Skill 等文档完整 | ✅ | README + CHANGELOG + docs/(architecture/ir/tools/profiles/skill/usage/release-checklist)+ examples/ |
| 27 | 自动化测试通过 | ✅ | 79/79(vitest),`tsc --noEmit` 零错误 |
| 28 | 满足独立发布插件要求 | ✅ | package.json(exports/files/peerDeps)+ cordis.patch.yml + `npm pack` 内容核查 + MIT LICENSE |

## 发布物核查

- `npm run build` → `lib/`(ESM 入口 `./lib/index.js`,类型 `./lib/types/index.d.ts`);
- `files` 覆盖:`lib` `src` `skills` `docs` `examples` `cordis.patch.yml` `README.md` `CHANGELOG.md` `LICENSE`;
- `skills/` 随包发布,bundled skill 可从 lib 布局定位(`locateSkillFile` 双路径回退);
- 运行环境:Node ≥ 20;peer:`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery`。

## 已知边界(如实声明,非遗留缺陷)

1. 当前文件由 `StructuredDocumentService` 提供显式绑定接口,可由 Controller/View/工作台集成;
2. `replace_document` 显式设置场景模板;局部修改继续沿用当前模板;
3. 外部修改检测以内容哈希为准,检测点在每次工具调用(每次一次小文件 IO,正确性优先);
4. 解析既有 Markdown 的节点默认 `note` 角色,不按标题猜角色(设计决策,architecture.md §1)。
