**English** | [简体中文](README.zh-CN.md)

# dsh-structured-document

Organize Markdown into nodes and a hierarchy so an Agent can locate, edit, and restructure content during a discussion, with undo when needed.

## What you can do

- Work with stable node IDs and meeting, project, or thinking profiles.
- Add, edit, move, and remove nodes, and manage the roles and properties supported by the selected profile.
- Commit a batch of changes as one validated operation, one revision, and one undo step.
- Keep business content in readable Markdown, with node IDs and session state in a companion file.

## Installation

The current local version is **0.2.1**, targeting **DSH Desktop 0.2.1-rc.2**. This plugin supplies document tools and services. File browsing, visual views, and a discussion workbench are provided by separate integrations. Host requirements are in [package.json](package.json).

As checked on 2026-10-18, the default branch of the [public source repository](https://github.com/irvingzhang0512/dsh-structured-document) declares **0.1.0**. The version described here has not been pushed or publicly released. Obtain the complete prebuilt `.tgz` from the maintainer; there is no public download link for this version yet.

1. In Desktop, open **Plugins → Add plugin → Install third-party plugin** and enter the archive's absolute local path.
2. Check the package name `dsh-structured-document` and version `0.2.1`, enable it, and restart DSH when prompted.
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
- Further three-scenario workflows and collaboration changes remain proposed or unimplemented in [SPEC](docs/SPEC.md); they are not features delivered by this README update.

## Troubleshooting

### No current file

Create a document in the current session, or bind an existing file using the document view or workbench. Check the actual bound path before editing. Merely seeing a file in a browser does not mean the document kernel has opened it.

### What happens if the companion file is removed?

Markdown preserves the business content. The companion file primarily preserves stable IDs and state; removing it can lose ID continuity across sessions. Back up both files together.

## More documentation

- [User guide](docs/usage.md), [profiles](docs/profiles.md).
- [Tool reference](docs/tools.md), [bundled skill](skills/structured-document/SKILL.md).
- [Current specification](docs/SPEC.md), [changelog](CHANGELOG.md), [architecture](docs/architecture.md).
