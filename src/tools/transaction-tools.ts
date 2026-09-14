/** Whole-document and atomic batch tools used by the discussion workbench. */
import { access, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { DocumentNodeInput, DocumentPatchOperation } from '../model/types.ts'
import { DocumentOperationError } from '../model/errors.ts'
import type { WorkspaceRegistry } from '../state/kernel.ts'
import { fail, failFromError, ok, sessionIdOf, toJsonValue, type JsonValueLike } from './envelope.ts'
import { outputSchema } from './query-tools.ts'

export interface TransactionToolDeps { registry: WorkspaceRegistry }

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new DocumentOperationError('INVALID_OPERATION', `${label} 必须是对象。`)
  return value as Record<string, unknown>
}

function nodeInput(value: unknown, label = '节点'): DocumentNodeInput {
  const row = asObject(value, label)
  if (typeof row.title !== 'string') throw new DocumentOperationError('INVALID_OPERATION', `${label}.title 必须是文本。`)
  if (row.children !== undefined && !Array.isArray(row.children)) throw new DocumentOperationError('INVALID_OPERATION', `${label}.children 必须是数组。`)
  return {
    ...(typeof row.id === 'string' ? { id: row.id } : {}),
    title: row.title,
    ...(typeof row.content === 'string' ? { content: row.content } : {}),
    ...(typeof row.role === 'string' ? { role: row.role } : {}),
    ...(row.properties !== undefined ? { properties: asObject(row.properties, `${label}.properties`) as DocumentNodeInput['properties'] } : {}),
    ...(Array.isArray(row.children) ? { children: row.children.map((child, index) => nodeInput(child, `${label}.children[${index}]`)) } : {}),
  }
}

function nodeList(value: unknown): DocumentNodeInput[] {
  if (!Array.isArray(value)) throw new DocumentOperationError('INVALID_OPERATION', 'children 必须是节点数组。')
  return value.map((node, index) => nodeInput(node, `children[${index}]`))
}

function patchList(value: unknown): DocumentPatchOperation[] {
  if (!Array.isArray(value)) throw new DocumentOperationError('INVALID_OPERATION', 'operations 必须是数组。')
  return value.map((raw, index) => {
    const row = asObject(raw, `operations[${index}]`)
    const op = row.op
    if (typeof op !== 'string') throw new DocumentOperationError('INVALID_OPERATION', `operations[${index}].op 缺失。`)
    if (!['add', 'update', 'delete', 'move', 'reorder', 'change_role', 'set_property'].includes(op)) {
      throw new DocumentOperationError('INVALID_OPERATION', `operations[${index}].op 不支持:${op}。`)
    }
    return row as unknown as DocumentPatchOperation
  })
}

function targetGuard(workspaceRoot: string, target: string): void {
  const rel = relative(resolve(workspaceRoot), resolve(target))
  if (rel === '..' || rel.startsWith(`..\\`) || rel.startsWith('../') || isAbsolute(rel)) {
    throw new DocumentOperationError('INVALID_OPERATION', `目标路径超出会话工作区:${target}。`)
  }
}

function safeStem(title: string): string {
  const value = title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/[. ]+$/g, '').slice(0, 100)
  return value === '' ? '未命名文档' : value
}

async function availablePath(directory: string, rawName: string): Promise<string> {
  const extension = extname(rawName).toLowerCase()
  const stem = safeStem(extension === '.md' || extension === '.markdown' ? rawName.slice(0, -extension.length) : rawName)
  const suffix = extension === '.markdown' ? '.markdown' : '.md'
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = join(directory, `${stem}${index === 0 ? '' : ` (${index + 1})`}${suffix}`)
    try { await access(candidate) } catch { return candidate }
  }
  throw new DocumentOperationError('SAVE_FAILED', '无法为新文档生成不重名的文件名。')
}

function commonOutput() {
  return outputSchema({
    file_path: { type: 'string', description: '实际保存或修改的绝对路径。' },
    summary: { type: 'json', description: '本次事务的新增、修改、删除节点摘要。' },
    idempotent_replay: { type: 'boolean', description: '是否返回了同一 request_id 的既有结果。' },
  })
}

function render(value: { success: boolean, error?: string, message: string }) {
  return [{ type: 'text' as const, text: value.success ? `[OK] ${value.message}` : `[${value.error ?? 'ERROR'}] ${value.message}` }]
}

export function createCreateDocumentTool(deps: TransactionToolDeps) {
  const createCache = new Map<string, { fingerprint: string, value: { success: true, action: string, message: string, file_path: string, summary: JsonValueLike, revision: number, saved: boolean, markdownUpdated: boolean, sidecarSaved: boolean, idempotent_replay: boolean } }>()
  return defineTool({
    name: 'create_document',
    description: '从完整结构一次创建并打开 Markdown 结构化文档。自动避免覆盖同名文件。',
    parameters: {
      title: { type: 'string', required: true, description: '文档标题。' },
      profile: { type: 'string', required: true, enum: ['meeting', 'project', 'thinking'], description: '场景模板。' },
      children: { type: 'json', required: true, description: '根节点下的完整节点数组；新节点不要填写 id。' },
      root: { type: 'json', description: '可选根节点内容、角色和属性，不含 id/children。' },
      directory: { type: 'string', description: '保存目录。省略时使用当前目标目录，否则使用会话工作区根目录。' },
      file_name: { type: 'string', description: '文件名；省略时由标题生成。仅支持 .md/.markdown。' },
      request_id: { type: 'string', required: true, description: '本次用户意图的稳定请求 ID，重试必须复用。' },
    },
    output: { schema: commonOutput(), render: (_args, value) => render(value as never) },
    isConcurrencySafe: () => false,
    async execute(args, exec: ToolRunContext) {
      const sessionId = sessionIdOf(exec)
      if (sessionId === null) return fail('create_document', 'INVALID_OPERATION', '无法确定调用方会话。')
      try {
        const children = nodeList(args.children)
        const fingerprint = JSON.stringify(args)
        const cacheKey = `${sessionId}:${args.request_id}`
        const cached = createCache.get(cacheKey)
        if (cached !== undefined) {
          if (cached.fingerprint !== fingerprint) throw new DocumentOperationError('INVALID_OPERATION', 'request_id 已被另一组创建参数使用。')
          return { ...cached.value, idempotent_replay: true }
        }
        return await deps.registry.withSessionLock(sessionId, async () => {
          const workspace = deps.registry.get(sessionId)
          const cwd = await deps.registry.resolvePath(sessionId, '.')
          const current = workspace.bound ? workspace.state.currentFilePath : null
          const directory = await deps.registry.resolvePath(sessionId, typeof args.directory === 'string' && args.directory !== '' ? args.directory : current === null ? '.' : dirname(current))
          targetGuard(cwd, directory)
          const directoryInfo = await stat(directory).catch(() => null)
          if (directoryInfo === null || !directoryInfo.isDirectory()) throw new DocumentOperationError('SAVE_FAILED', `保存目录不存在:${directory}。`)
          const filePath = await availablePath(directory, typeof args.file_name === 'string' && args.file_name !== '' ? args.file_name : String(args.title))
          const committed = await deps.registry.withFileLock(filePath, () => workspace.createDocument({
            filePath, title: String(args.title), profileId: String(args.profile), children,
            ...(args.root !== undefined ? { root: nodeInput({ ...asObject(args.root, 'root'), title: String(args.title) }) } : {}),
          }))
          const value = ok('create_document', `已创建并打开「${String(args.title)}」:${filePath}。新增 ${committed.result.counts.added} 个节点,版本 ${committed.revision}。`, {
            file_path: filePath, summary: toJsonValue(committed.result), revision: committed.revision,
            saved: committed.saved, markdownUpdated: committed.markdownUpdated, sidecarSaved: committed.sidecarSaved,
            idempotent_replay: false,
          })
          createCache.set(cacheKey, { fingerprint, value })
          return value
        })
      } catch (error) { return failFromError('create_document', error) }
    },
  })
}

export function createReplaceDocumentTool(deps: TransactionToolDeps) {
  return defineTool({
    name: 'replace_document',
    description: '把当前目标文档整体整理为给定结构；一次保存、一次版本推进、一次撤销。',
    parameters: {
      title: { type: 'string', required: true, description: '整理后的标题。' },
      profile: { type: 'string', required: true, enum: ['meeting', 'project', 'thinking'], description: '整理后的场景模板。' },
      children: { type: 'json', required: true, description: '完整子树。新节点省略 id；保留既有节点时可复用当前文档 id。' },
      root: { type: 'json', description: '可选根节点内容、角色和属性。' },
      expected_revision: { type: 'integer', required: true, description: '从 get_document/get_workbench_context 得到的目标版本。' },
      expected_file: { type: 'string', required: true, description: '本次操作锁定的整理目标绝对路径。' },
      request_id: { type: 'string', required: true, description: '稳定请求 ID；重试必须复用。' },
    },
    output: { schema: commonOutput(), render: (_args, value) => render(value as never) },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      return withLockedWorkspace('replace_document', deps, exec, async workspace => {
        const committed = await workspace.replaceDocument({
          title: String(args.title), profileId: String(args.profile), children: nodeList(args.children),
          expectedRevision: Number(args.expected_revision), expectedFile: String(args.expected_file), requestId: String(args.request_id),
          ...(args.root !== undefined ? { root: nodeInput({ ...asObject(args.root, 'root'), title: String(args.title) }) } : {}),
        })
        return ok('replace_document', `已整体整理文档。新增 ${committed.result.counts.added} 个节点,版本 ${committed.revision}。`, {
          file_path: workspace.state.currentFilePath ?? '', summary: toJsonValue(committed.result), revision: committed.revision,
          saved: committed.saved, markdownUpdated: committed.markdownUpdated, sidecarSaved: committed.sidecarSaved,
        })
      })
    },
  })
}

export function createApplyDocumentPatchTool(deps: TransactionToolDeps) {
  return defineTool({
    name: 'apply_document_patch',
    description: '将多项明确的节点变更作为一个事务应用；适合一次更新多个任务、风险或会议事项。',
    parameters: {
      operations: { type: 'json', required: true, description: '操作数组；op 为 add/update/delete/move/reorder/change_role/set_property。' },
      expected_revision: { type: 'integer', required: true, description: '读取目标时的版本。' },
      expected_file: { type: 'string', required: true, description: '锁定的整理目标绝对路径。' },
      request_id: { type: 'string', required: true, description: '稳定请求 ID；重试必须复用。' },
    },
    output: { schema: commonOutput(), render: (_args, value) => render(value as never) },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      return withLockedWorkspace('apply_document_patch', deps, exec, async workspace => {
        const committed = await workspace.applyPatch({ operations: patchList(args.operations), expectedRevision: Number(args.expected_revision), expectedFile: String(args.expected_file), requestId: String(args.request_id) })
        const counts = committed.result.counts
        return ok('apply_document_patch', `已批量更新文档:新增 ${counts.added}、修改 ${counts.updated}、删除 ${counts.deleted} 个节点,版本 ${committed.revision}。`, {
          file_path: workspace.state.currentFilePath ?? '', summary: toJsonValue(committed.result), revision: committed.revision,
          saved: committed.saved, markdownUpdated: committed.markdownUpdated, sidecarSaved: committed.sidecarSaved,
        })
      })
    },
  })
}

async function withLockedWorkspace<T>(action: string, deps: TransactionToolDeps, exec: ToolRunContext, task: (workspace: import('../state/kernel.ts').SessionWorkspace) => Promise<T>): Promise<T | ReturnType<typeof fail>> {
  const sessionId = sessionIdOf(exec)
  if (sessionId === null) return fail(action, 'INVALID_OPERATION', '无法确定调用方会话。')
  try {
    return await deps.registry.withSessionLock(sessionId, async () => {
      const workspace = await deps.registry.requireBound(sessionId)
      const filePath = workspace.state.currentFilePath
      if (filePath === null) throw new DocumentOperationError('NO_CURRENT_FILE', '没有整理目标文档。')
      return deps.registry.withFileLock(filePath, async () => {
        await workspace.refreshIfExternalChanged()
        return task(workspace)
      })
    })
  } catch (error) { return failFromError(action, error) as ReturnType<typeof fail> }
}
