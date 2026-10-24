export interface SessionDirectoryContext {
    sessions: {
        get(id: string): {
            header?: {
                cwd?: string;
            };
        } | undefined;
    };
    sessionController?: {
        inspect(id: string): Promise<{
            meta: {
                cwd?: string;
            };
        }>;
    };
}
/** Read persisted metadata without resuming an Agent or selecting a model. */
export declare function sessionDirectory(ctx: SessionDirectoryContext, id: string): Promise<string>;
