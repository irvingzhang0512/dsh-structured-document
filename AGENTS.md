# AGENTS.md — AI 代理协作指引

本文件供 AI 代理(Agent)在本仓库工作时遵循。目标:保持代码风格、提交历史与项目边界的一致性。

## 项目简介

`dsh-structured-document` 是一个 DSH 插件:通过结构化文档 IR 与 17 个 Document Tools,让 Agent 用中文自然语言稳定地读取、定位、修改和重组结构化文档(会议纪要 / 项目管理 / 思路整理),支持"这个 / 刚才那个 / 刚加的 / 上一条 / 第二个"等中文指代,所有修改自动保存、可撤销。

权威需求文档:`requirements.txt`(V0.1,42 章);架构决策:`docs/architecture.md`。

## 常用命令

```sh
npm run typecheck   # TypeScript 类型检查(提交前必须零错误)
npm test            # vitest 全量测试(unit/integration/scenarios/e2e)
npm run build       # 构建到 lib/
```

## 提交规范(必须遵守)

采用 **Angular 提交规范,全部用中文**书写。

### 格式

```
<类型>(<可选范围>): <中文主题>

<可选的中文正文:说明做了什么、为什么>
<可选的中文脚注:破坏性变更、关联任务>
```

### 类型(type)

| 类型 | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 仅文档变更 |
| `refactor` | 既非新增也非修复的代码变更 |
| `test` | 测试相关(新增/修正测试) |
| `style` | 不影响代码含义的变更(格式、空格、分号) |
| `perf` | 性能优化 |
| `build` | 构建系统或外部依赖变更 |
| `ci` | CI 配置变更 |
| `chore` | 杂项(不修改 src 或测试的其他变更) |
| `revert` | 回滚提交 |

### 主题(subject)规则

- 用**中文**祈使句,说明"做了什么",不加句号结尾;
- 首字母无需大写(中文不适用);
- 建议不超过 50 个字符;
- 不用引号包裹。

### 范围(scope)建议

取模块名:`kernel` / `tools` / `adapter`(markdown-adapter)/ `storage` / `profiles` / `skill` / `docs` / `tests` / `build`。
示例:`feat(tools): 新增 reorder_node 顺序调整工具`、`fix(kernel): 撤销后版本号保持单调递增`。

### 正反示例

```
✅ feat(kernel): 支持外部修改检测与自动重解析
✅ fix(adapter): 修复列表内容行缩进逐轮放大的问题
✅ docs(skill): 补充 SKILL 随插件安装的验证说明
✅ test(scenarios): 新增会议纪要多轮指代场景

❌ 更新了一些代码            (无类型前缀)
❌ fix: 修 bug               (主题无信息量)
❌ feat(kernel): Fixed undo  (语言混杂)
❌ feat: 新增了撤销功能。     (句号结尾;应写明行为与影响)
```

### 提交前检查

1. `npm run typecheck` 零错误;
2. `npm test` 全部通过(82 条基线,新增功能必须带测试);
3. 不提交构建产物(`lib/`)与临时文件(已被 `.gitignore` 覆盖);
4. 提交信息用 UTF-8 文件 + `git commit -F <file>` 写入,避免 Windows 控制台编码把中文写坏。

## 项目边界(不要越界)

- 本插件**不做**文件树、文件选择、文件切换、Sidebar 集成——"当前文件"经 `CurrentFileProvider` 接缝由外部注入(见 `src/plugin/current-file.ts` 的 TODO);
- 每个 Tool 职责单一,**禁止**添加万能 command 工具;
- Skill 只承担"中文自然语言 → 工具参数"映射,业务规则一律在内核强制执行;
- LLM 不得直接修改底层 JSON / Markdown,所有修改必须走工具管线(校验 → 保存 → 版本 +1)。

## 已知技术陷阱

1. **Windows 编码**:严禁用 PowerShell 的 `Get-Content`/`Set-Content` 管道处理含中文的源文件(UTF-8 会被写成乱码);一律使用支持 UTF-8 的文件编辑工具;
2. **defineTool schema 推断**:共享 schema 常量必须 `as const satisfies`,宽化会让 execute 返回类型塌缩为 `never`(详见 `docs/architecture.md` §10);
3. **git 代理**:本机 git 全局代理指向 `172.26.128.1:7897` 时推送 GitHub 可能 408,可用 `git -c http.proxy=http://127.0.0.1:7897 push` 会话级覆盖。
