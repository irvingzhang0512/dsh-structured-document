# SKILL.md:中文自然语言 → 工具映射

技能文件:[`skills/structured-document/SKILL.md`](../skills/structured-document/SKILL.md)。插件挂载时由 [`src/plugin/skill.ts`](../src/plugin/skill.ts) 读取并以 bundled source 注册到 `ctx.skills`——模型据此学会把中文说法翻译成正确的工具调用。

## 随插件自动安装(已验证)

Skill 不是独立的安装单元,而是**插件的运行时贡献**:

1. SKILL.md 随 npm 包发布(`package.json` 的 `files` 含 `skills/`);
2. DSH 以 bundle 形式加载插件(`cordis.patch.yml`)→ `apply` 执行,`inject: ['tools','skills','sessions']` 保证 skill 注册表服务就绪;
3. `registerSkill` 读取**包内** SKILL.md(从 lib 或 src 布局双路径定位)→ `ctx.skills.register()` 同步注册进全局层;
4. 模型可见目录(`ctx.skills.list()`)即出现 `structured-document`;卸载插件时随 fiber 自动注销,无残留。

端到端保障:`tests/e2e/skill-install.spec.ts` 用真实 cordis + 真实 `@deepseek-ai/dsh-skill` SkillRegistry 挂载本插件,验证注册、加载、17 个工具同生命周期与卸载清理。

注意:若用户本地目录(`.dsh` 项目/用户 skill 根)存在**同名** skill,按注册表规则本地条目优先于插件运行时条目——这是宿主的统一优先级设计,便于用户覆盖。

## 职责边界

Skill **只做映射,不承担业务逻辑**(需求第 23 章):指代解析、参数构造的"说明书"在 Skill;角色合法、属性校验、歧义检测、撤销语义等业务规则全部由内核与工具层强制执行。模型按 Skill 调用时,错误说法会被内核如实拒绝(结构化错误码),不会污染文档。

## SKILL.md 结构

- **frontmatter**:`name` / `description` / `when-to-use`(极简 YAML 解析,见 `parseFrontmatter`);
- **正文**:
  1. 铁律(禁止绕过工具、先定位后动手、歧义禁止随机选择、一次做全、可撤销、尊重模板约束);
  2. 中文指代 → 工具参数映射表(核心);
  3. 17 个工具清单与使用时机;
  4. 三类模板的角色属性表;
  5. 三场景常见说法 → 调用示例;
  6. 错误码 → 应对表;
  7. 边界声明(不做文件切换、不臆造 ID、超 3 步结构改动先复述)。

## 中文指代映射(核心验收项)

| 用户说法 | 语义 | 参数 |
|---|---|---|
| 这个 / 这一条 / 当前(的) | 当前节点 | 缺省(即 `@selected`) |
| 刚才改的 / 刚刚修改的那条 | 最近修改节点 | `@last_edited` |
| 刚加的 / 刚才新增的 | 最近新增节点 | `@last_created` |
| 上一条 / 前面那条 | 前一兄弟 | `relative: "previous_sibling"` |
| 下一条 / 后面那条 | 后一兄弟 | `relative: "next_sibling"` |
| 父级 / 它所属的 | 父节点 | `relative: "parent"` |
| 第二个 / 第 N 个 / 最后一个 | 同名序号 | `occurrence: N`(1 起;负数从末尾) |
| 整个文档 / 文档标题 | 根节点 | `@root` |

指针维护规则(内核保证):`add_node` 成功后自动选中新节点;`update_node` 等更新 Last Edited;删除节点时清理失效指针(返回 `cleared_pointers`)。指代失效时模型应先 `get_selected_node` 澄清。

## 歧义规则

标题匹配先精确后包含;命中多个且未给 `occurrence` 时,工具返回 `MULTIPLE_NODES_FOUND` + `candidates`。SKILL.md 要求模型把候选原样呈现给用户(含 ID 与路径),等待"第几个 / 节点 ID / 更完整标题"再重试——**宁可多问一句,不可错改一处**。

## 装载与容错

- 定位:`createRequire` 从包根解析 `skills/structured-document/SKILL.md`,失败时按 `import.meta.url` 向上回溯(兼容 lib 与 src 布局);
- 文件缺失或解析失败 → 跳过注册并告警,**不阻断插件挂载**;
- 工具仍全部可用——Skill 缺失只影响自然语言映射质量。

## 校验

`tests/unit/skill.spec.ts` 验证:定位成功、frontmatter 解析、正文包含全部指代锚点(`@selected` / `@last_edited` / `@last_created` / `previous_sibling` / `occurrence` / `candidates` / `MULTIPLE_NODES_FOUND` / `undo`)与 17 个工具名、bundled source 注册成功。
