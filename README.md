**English** | [简体中文](README.zh-CN.md)

当前 0.2.2-rc.1 适配版本 **0.2.2-rc.1+rev.1**，要求 **DSH Desktop 0.2.2-rc.1**；代码检查已通过，原生／安装／试用状态分别记录。详见 [本次适配](docs/DSH-RC1-20261104.md)。以下带日期记录保留历史职责。


当前 rc5 适配版本 **0.2.1-rc.5+rev.1**，要求 **DSH Desktop 0.2.1-rc.5**；代码检查已通过，原生／安装／试用状态分别记录。详见 [本次适配](docs/DSH-RC5-20261104.md)。以下带日期记录保留历史职责。


当前 rc3 候选：**0.2.1-rc.3+rev.1**，要求 **DSH Desktop 0.2.1-rc.3**。变化与实际检查范围见 [升级记录](docs/DSH-RC3-20261025.md)；整套安装及试用状态以维护仓库为准。以下带日期的旧交付说明保留历史背景。

## Git 固定提交分发（2026-10-24）

本轮按维护仓库已确认的 Windows 环境构建方案准备 GitHub 直接安装：从固定清单取得本仓库的完整 40 位提交，使用 `git+https://github.com/irvingzhang0512/dsh-structured-document.git#<完整提交>`。尖括号是待替换示例，不是可运行地址；不要使用浮动分支。该提交随源码提供 lib、patch、客户端与声明资源，安装不依赖现场编译。办公套件通过固定成员 Git 依赖提供四个组件，不重复直接安装成员。

本轮固定提交须完成推送和公网安装验收后才能称为远程可安装；本地测试不能替代该结论。以下旧安装记录保留历史背景，当前维护组合以私有维护入口的固定锁为准。


> OpenSpec 文档入口：[迁移索引](openspec/MIGRATION.md)。后续开发与管理统一使用 `openspec/specs` 和 `openspec/changes`；旧 `docs/SPEC.md` 与原始需求冻结保留，个人项目资料本轮保持原样，旧文中的“可编辑规格”入口由此替代。新功能先审阅具体方案并确认，再实施与验证；历史资料不双写。

# Irving · Structured Documents

Organize Markdown into nodes and a hierarchy so an Agent can locate, edit, and restructure content during a discussion, with undo when needed.

## What you can do

- Work with stable node IDs and meeting, project, or thinking profiles.
- Add, edit, move, and remove nodes, and manage the roles and properties supported by the selected profile.
- Commit a batch of changes as one validated operation, one revision, and one undo step.
- Keep business content in readable Markdown, with node IDs and session state in a companion file.

## Installation

The current local version is **0.2.1-rc.2+rev.1**, targeting **DSH Desktop 0.2.1-rc.2**. This plugin supplies document tools and services. File browsing, visual views, and a discussion workbench are provided by separate integrations. Host requirements are in [package.json](package.json).

As checked on 2026-10-18, the default branch of the [public source repository](https://github.com/irvingzhang0512/dsh-structured-document) declares **0.1.0**. The version described here has not been pushed or publicly released. Obtain the complete prebuilt `.tgz` from the maintainer; there is no public download link for this version yet.

1. In Desktop, open **Plugins → Add plugin → Install third-party plugin** and enter the archive's absolute local path.
2. Check the package name `dsh-structured-document` and version `0.2.1-rc.2+rev.1`, enable it, and restart DSH when prompted.
3. In a session with a real workspace directory, ask the Agent to check that the document tools and the bundled `structured-document` skill are available. No separate skill installation is needed.

See the [compatibility record](docs/DSH-UPGRADE-20261017.md) for tests and isolated Desktop checks. These do not establish installation from the public source.

## Configuration

Start with the defaults: meeting profile for new documents, automatic saving enabled, and an undo limit of 100. You can explicitly request the project or thinking profile when creating a document.

Check the component configuration in Desktop's plugin details. Assembly configuration changes require a plugin reload. The historical standalone settings card requires the older host settings service; when unavailable, the plugin still uses assembly values and defaults. Document views or a workbench normally supply the current-file binding, so you do not need to change a static path for each file. See [architecture and configuration](docs/architecture.md).

## First use

Open a DSH session in a real workspace and practise on a new file:

1. Send:

   > Use the structured-document skill to create “Discussion outline” in the workspace root, using the thinking profile, with “Goal”, “Ideas”, and “To confirm” sections. Do not overwrite existing files. Report the actual saved path.

2. Check the success result, actual `.md` path, and outline. Open the file and confirm the three sections. A name collision results in another available filename.
3. Ask: “Add ‘The review time is not confirmed’ under ‘To confirm’.” Check the reported revision and saved content.
4. Ask: “Undo that addition.” Confirm that the new node is removed while the other sections remain.

Install the document-view plugin for visual navigation, or the workbench to keep a target fixed while browsing references. Existing files must be bound through an integration or maintainer configuration; opening a file in an external editor does not bind it to this plugin.

## Common tasks

| Task | Ask the Agent | Result |
|---|---|---|
| Inspect structure | “Show the current document outline” | Sections and hierarchy |
| Rename a section | “Rename ‘To confirm’ to ‘To verify’” | Updated title with the same node ID |
| Change hierarchy | “Move the node just added under ‘Goal’” | A validated node move |
| Apply several changes | List the changes and request one combined operation | One save and revision, undoable together |

## Boundaries

- New files and transactional targets are constrained to the session workspace; the destination directory must exist. Supported documents use `.md` or `.markdown`.
- Ambiguous titles return candidates. The Agent must clarify instead of guessing what “this one” means without a unique selection.
- Automatic saving is enabled by default. A companion `.sdoc.json` failure is reported separately from a successful Markdown save; it does not replace the document body.
- External edits trigger a reload and reset the old undo stack and related state.
- This plugin has no file tree or standalone file picker.
- Further three-scenario workflows and collaboration changes remain proposed or unimplemented in [SPEC](openspec/MIGRATION.md); they are not features delivered by this README update.

## Troubleshooting

### No current file

Create a document in the current session, or bind an existing file using the document view or workbench. Check the actual bound path before editing. Merely seeing a file in a browser does not mean the document kernel has opened it.

### What happens if the companion file is removed?

Markdown preserves the business content. The companion file primarily preserves stable IDs and state; removing it can lose ID continuity across sessions. Back up both files together.

## More documentation

- [User guide](docs/usage.md), [profiles](docs/profiles.md).
- [Tool reference](docs/tools.md), [bundled skill](skills/structured-document/SKILL.md).
- [Current specification](openspec/MIGRATION.md), [changelog](CHANGELOG.md), [architecture](docs/architecture.md).


## Office Suite

This component is also included in **Irving · Office Suite** (`dsh-office-bundle`), version **0.2.1-rc.2+rev.1**. Use the suite for a combined installation, or this package for a standalone installation. Do not enable both composition entries. The suite switch stops all four components; turning it back on preserves each component’s own switch. Disabling or uninstalling retains documents and settings. When migrating an existing installation, use the maintainer’s fixed-package migration rather than adding another copy.

Current naming, version, and Office Suite verification: [2026-10-18 verification](docs/VERIFICATION-OFFICE-20261018.md).
