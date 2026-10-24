import type { ReactElement } from 'react';
/** 场景模板标识(与宿主 schema 的枚举一致)。 */
type ProfileId = 'meeting' | 'project' | 'thinking';
/** 设置命名空间的解析值。 */
interface StudioSettings {
    defaultProfile: ProfileId;
    autoSave: boolean;
    maxUndoSteps: number;
}
/** 客户端看到的命名空间快照(对应 SettingsScopeSnapshot)。 */
interface ScopeSnapshot {
    status: 'loading' | 'ready' | 'unavailable';
    value: StudioSettings | undefined;
    /** 组装层(宿主 provider 解析 value 时所覆盖的那一层)。 */
    base: unknown;
    /** 原始用户层:字段**出现**在这里才是“被覆盖”,不比较值。 */
    user: unknown;
    /** 写入围栏;首次 Host 视图到达前为 undefined。 */
    revision: number | undefined;
    /** 宿主设置文档是否接受写入。 */
    writable: boolean;
}
/** 一条按路径寻址的写入(mutate 的元素形状)。 */
type PathOp = {
    op: 'set';
    path: string[];
    value: unknown;
} | {
    op: 'unset';
    path: string[];
};
/** 一个命名空间的读写面(对应 SettingsScope)。 */
interface SettingsScope {
    getSnapshot(): ScopeSnapshot;
    subscribe(listener: () => void): () => void;
    mutate(ops: readonly PathOp[], expectedRevision?: number): Promise<void>;
}
/** 浏览器侧 context 中本插件用到的表面。 */
interface ClientContext {
    slots: {
        inject(name: string, callback: () => void): void;
        register(spec: {
            name: string;
            key: string;
        }, component: () => ReactElement | null): () => void;
    };
    inject(deps: string[], callback: (ctx: unknown) => void): unknown;
}
/** 必需服务:`slots` 是浏览器半边的立足点(没有它就没有 UI)。 */
export declare const inject: string[];
/**
 * 挂载浏览器半边。
 * @param ctx - 浏览器侧 cordis context。
 */
export declare function apply(ctx: ClientContext): void;
/**
 * 设置卡片:可折叠头部 + 三个设置行 + 右下角操作行。
 *
 * 外观按宿主 `PluginCard` 对齐;折叠是**卡片本地状态**,收起只隐藏主体——组件保持
 * 挂载,因此未保存草稿不因收起丢失。
 * @param props - 绑定的设置命名空间读写面,以及初始展开状态(默认收起,与宿主卡片一致;
 *   该参数同时让无渲染器的用例能直接断言展开态结构)。
 */
export declare function SettingsCard({ scope, initiallyOpen }: {
    scope: SettingsScope;
    initiallyOpen?: boolean;
}): ReactElement | null;
export {};
