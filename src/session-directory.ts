export interface SessionDirectoryContext {
  sessions: { get(id: string): { header?: { cwd?: string } } | undefined }
  sessionController?: { inspect(id: string): Promise<{ meta: { cwd?: string } }> }
}
/** Read persisted metadata without resuming an Agent or selecting a model. */
export async function sessionDirectory(ctx: SessionDirectoryContext, id: string): Promise<string> {
  const live = ctx.sessions.get(id)?.header?.cwd
  if (typeof live === 'string' && live !== '') return live
  if (ctx.sessionController) {
    const cwd = (await ctx.sessionController.inspect(id)).meta.cwd
    if (typeof cwd === 'string' && cwd !== '') return cwd
    throw new Error('会话没有有效的工作目录。')
  }
  return process.cwd()
}
