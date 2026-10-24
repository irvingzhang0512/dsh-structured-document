/** 当前文件提供者(预留接口)。 */
export interface CurrentFileProvider {
    /** 返回该会话的当前文件路径;没有则返回 null。 */
    getCurrentFile(sessionId: string): string | null | Promise<string | null>;
}
/** 当前文件变化监听器(预留接口)。 */
export type CurrentFileListener = (sessionId: string, filePath: string | null) => void;
/** 带写入口的当前文件存储(集成方调用 setCurrentFile 推送变化)。 */
export interface CurrentFileStore extends CurrentFileProvider {
    /** 设置(或清除)会话的当前文件;触发已注册的监听器。 */
    setCurrentFile(sessionId: string, filePath: string | null): void;
    /** 监听当前文件变化;返回取消监听的函数。 */
    onCurrentFileChanged(listener: CurrentFileListener): () => void;
}
/** 内存实现:测试与未来集成的默认载体。 */
export declare class InMemoryCurrentFileStore implements CurrentFileStore {
    private readonly files;
    private readonly listeners;
    getCurrentFile(sessionId: string): string | null;
    setCurrentFile(sessionId: string, filePath: string | null): void;
    onCurrentFileChanged(listener: CurrentFileListener): () => void;
}
/** 静态实现:所有会话返回同一个配置文件(绝对路径;相对路径按会话 cwd 解析)。 */
export declare class StaticCurrentFileProvider implements CurrentFileProvider {
    private readonly rawPath;
    private readonly getCwd;
    constructor(rawPath: string, getCwd: (sessionId: string) => Promise<string | null>);
    getCurrentFile(sessionId: string): Promise<string | null>;
}
