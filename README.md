**English** | [简体中文](README.zh-CN.md)

# dsh-structured-document

A DSH (DeepSeek Harness) plugin that gives agents a structured document model for **meeting notes, project management, and idea boards**, so they can read, locate, modify, and reorganize documents through ordinary Chinese natural language — deterministically, instead of guessing at raw Markdown.

## What problem does it solve

When an agent edits Markdown directly, three things tend to break:

- **References go stale** — "the one I just added", "the previous item", "the second one" have no stable meaning without a document model.
- **Structure gets damaged** — heading levels, list nesting, and ordering get mangled by trial-and-error edits.
- **Mistakes cannot be undone** — there is no per-step undo.

This plugin layers a structured document IR over plain Markdown and turns those three problems into deterministic operations:

- Every node has a **stable ID** (`node_001`, `node_002`, …) that stays valid after the node is moved or renamed;
- Every mutation runs through a pipeline — **structure validation → auto-save → revision bump → state update** — and rolls back to the pre-operation snapshot if any step fails;
- Every step is **undoable**, and Chinese referring expressions ("这个 / 刚才那个 / 刚加的 / 上一条 / 第二个") have precise, documented semantics.

**Boundary:** the plugin does *not* provide a file tree, a file picker, or file switching — the "current file" of a session is injected by the runtime (see [Current-file integration](#current-file-integration)).

## Features

- **Stable node IDs** — IDs are assigned when a document is parsed and never change afterwards; the ID counter is monotonic, so an undo never reuses an ID. The root is always `node_001` (holds the document title, cannot be deleted or moved).
- **Deterministic mutation pipeline** — every write goes through snapshot → mutate working copy → structure validation → persist (revision +1, full business data serialized back to Markdown, atomic temp-file write, sidecar refresh) → state update + undo snapshot. Validation failure or save failure rolls the document back to the snapshot, so no half-done state is ever left behind.
- **Undo everything** — each successful mutation (including `undo` itself) pushes a snapshot onto the undo stack (default depth 100). Revisions and the ID counter only ever increase.
- **Chinese references with defined semantics** — `@selected` (this one), `@last_edited` (just edited), `@last_created` (just added), `@root` (whole document), `occurrence` (second / third / last of same-named nodes), and relative positioning (`previous_sibling` / `next_sibling` / `parent` / `first_child` / `last_child`).
- **Markdown is the source of truth (sidecar v2)** — the document profile, node roles, and business properties (owner / status / due date / progress) are written back into *visible* Markdown: the profile goes into YAML front matter (`dsh_profile:`), and each node's role and properties are rendered as a small table under a `<!-- dsh:node-properties -->` marker (headers are in Chinese: 类型 / 负责人 / 状态 / 截止日期 / 进度). The `.sdoc.json` sidecar only stores stable node IDs and session state (selected / last edited / last created). Deleting the sidecar loses nothing but cross-session ID continuity — the full business structure is recovered from Markdown.
- **v1 sidecar compatibility** — legacy v1 sidecars remain readable; the document is migrated to v2 on its *first business modification* (a mere selection does not overwrite a v1 sidecar early).
- **Never guesses on ambiguity** — when a title matches several nodes, the tool returns `MULTIPLE_NODES_FOUND` with a `candidates` list (id / title / role / path). The agent must ask the user — never pick randomly.
- **External edits win** — before every tool call the file hash is compared with the last loaded hash; if the file changed outside the session, it is re-parsed from disk (undo stack and state pointers reset).
- **Session isolation** — one document workspace per agent session (lazy-bound to the session's current file and cwd).
- **Bundled Chinese skill** — the `structured-document` skill ships with the package and teaches the model the exact utterance → tool-call mapping (see [Tools & skill](#tools--skill)).

## Installation

Install as a DSH profile bundle (the package ships a `cordis.patch.yml` that is applied automatically):

```sh
npm install dsh-structured-document
```

or, via the DSH CLI:

```sh
dsh plugin --profile <name> add dsh-structured-document@<version>
```

Requires Node.js >= 20. Peer dependencies: `@deepseek-ai/cordis` (>=4.0.2), `@deepseek-ai/dsh-tools` (>=0.1.2-rc.1), `@deepseek-ai/schemastery` (>=3.18.2).

On mount the plugin automatically registers:

- **14 Document Tools** (see the table below);
- the bundled Chinese skill **`structured-document`** — `SKILL.md` ships inside the npm package (`files` includes `skills/`), is registered into `ctx.skills` as a `bundled` skill when the plugin mounts, and is unregistered automatically when the plugin unloads. **No separate skill installation step.** This lifecycle is covered by an end-to-end test (`tests/e2e/skill-install.spec.ts`) that mounts the plugin in a real cordis host with a real `SkillRegistry`.

## Quick start

1. Open a Markdown document in DSH (starter documents live in [`examples/`](examples/): `examples/meeting/weekly-meeting.md`, `examples/project/person-detection.md`, `examples/thinking/report-outline.md`).
2. Just talk to the agent in Chinese:

```text
看看现在的结构                          → get_outline               (show structure)
进入「当前算法问题」                    → select_node               (set current node)
加一条讨论：误报集中在低功率档位        → add_node (role=discussion)
刚才这条改成结论                        → change_role (node=@last_created, role=conclusion)
加个待办：负责人张三，周五完成          → add_node (role=action_item, properties={owner, due_date})
状态改成进行中                          → update_property (key=status)
撤销                                    → undo
```

The complete utterance-to-parameter mapping lives in the skill body: [`skills/structured-document/SKILL.md`](skills/structured-document/SKILL.md).

## Configuration

All options have defaults (defined in [`src/plugin/config.ts`](src/plugin/config.ts)):

| Option | Default | Description |
|---|---|---|
| `defaultProfile` | `meeting` | Scenario profile used when a document is loaded with no sidecar history: `meeting` / `project` / `thinking`. |
| `autoSave` | `true` | Persist to disk immediately after each validated mutation (temp file + atomic rename). When disabled, use `save_document` to save manually. |
| `currentFile` | `''` | Optional static current-file binding (absolute path, or relative to the session cwd). Empty means the runtime provides it. |
| `maxUndoSteps` | `100` | Undo stack depth. |

## Tools & skill

### Document Tools (14)

All tools share one result envelope — `{ success, action, message, revision?, ... }` on success, `{ success: false, error, message, candidates? }` on failure — and every mutation is auto-saved and undoable. Result messages are in Chinese and include `markdownUpdated` / `sidecarSaved` flags so the model can tell the user exactly what was persisted.

| Group | Tool | Purpose |
|---|---|---|
| Read | `get_document` | Full document: tree, roles, properties, state |
| Read | `get_outline` | Outline: levels / roles / child counts |
| Read | `find_node` | Search by keyword / role / property (returns all candidates) |
| Locate | `select_node` | Set the current node (Selected Node) |
| Locate | `get_selected_node` | Read the current node plus last edited / last created |
| Modify | `add_node` | Add a node (title / content / role / properties in one call) |
| Modify | `update_node` | Change title / content |
| Modify | `delete_node` | Delete a node and its subtree (undoable) |
| Modify | `move_node` | Move under another parent (cannot move into its own subtree) |
| Modify | `reorder_node` | Up / down / top / bottom / explicit position |
| Modify | `change_role` | Change role (properties the new role does not support are removed) |
| Modify | `update_property` | Set or remove a property (enum & range validated) |
| History | `undo` | Undo the last mutation (repeatable) |
| History | `save_document` | Manual save (auto-save is on by default) |

Node references: `node_007` / title text (exact first, then substring) / `@selected` / `@last_edited` / `@last_created` / `@root`, combined with `occurrence` (which one, 1-based; negative counts from the end) and `relative` positioning. Ambiguity is never resolved by guessing.

### Bundled skill `structured-document`

The skill is the model-side map from Chinese natural language to tool calls: referring expressions, tool selection, ambiguity rules, and error handling. It is a pure mapping layer — role legality, property validation, and ambiguity detection are enforced by the kernel and tools, so a wrong utterance is rejected with a structured error code instead of corrupting the document.

## Current-file integration

The plugin deliberately does not implement file-tree, file-picking, or file-switching behavior. Each session's current file comes from a `CurrentFileProvider` seam (see [`src/plugin/current-file.ts`](src/plugin/current-file.ts)):

- the plugin provides `ctx.structuredDocument`, whose writable in-memory store lets an integration (e.g., a sidebar/editor plugin) push current-file changes via `setCurrentFile(sessionId, path)`;
- `config.currentFile` provides a static fallback for debugging;
- if no provider is attached, tools return `NO_CURRENT_FILE` and guide the user to open a document first.

The bridge to a concrete sidebar/editor is an integration-layer TODO tracked in [`docs/architecture.md`](docs/architecture.md).

## Documentation

The detailed docs are written in Chinese:

| Doc | Contents |
|---|---|
| [docs/usage.md](docs/usage.md) | User manual: state, references, ambiguity, undo, saving |
| [docs/architecture.md](docs/architecture.md) | Architecture & design decisions (pipeline, sidecar, current-file integration) |
| [docs/ir.md](docs/ir.md) | Document IR: nodes / roles / properties / metadata |
| [docs/tools.md](docs/tools.md) | The 17 tools: parameters and result formats |
| [docs/profiles.md](docs/profiles.md) | Role & property tables for the three profiles |
| [docs/skill.md](docs/skill.md) | How SKILL.md is loaded, structured, and mapped |
| [docs/release-checklist.md](docs/release-checklist.md) | Release checklist (against the 28 acceptance criteria) |

## Development

```sh
npm install
npm run typecheck   # type check
npm test            # vitest (unit / integration / scenario / e2e)
npm run build       # build to lib/
```

Test layers: `tests/unit/` (IR, Markdown adapter, kernel, skill loading), `tests/integration/` (the 17 tools through the real `defineTool` pipeline), `tests/scenarios/` (end-to-end Chinese sessions for all three profiles: multi-turn references, ambiguity, undo, invalid input, save failure, external edits), and `tests/e2e/` (real cordis + real SkillRegistry: skill and tool lifecycle across plugin mount/unmount).

## License

MIT — see [LICENSE](LICENSE).
