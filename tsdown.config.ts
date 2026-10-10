/**
 * tsdown 构建配置:只负责浏览器客户端 bundle(`lib/client.js`)。
 *
 * 宿主半边(`lib/index.js` 等)由 tsc 编译(见 tsconfig.json);本配置产出 DSH
 * 官方客户端 bundle 形态:
 *
 *   window.__ModuleLoader__.load({ id, factory })
 *
 * 其中 **id = npm 包名**(client-modules 以包名为 compose key);它同时是设置
 * 命名空间与设置卡片 slot 的 key,三者必须一致(见 src/plugin/config.ts 的
 * `SETTINGS_NAMESPACE`)。
 *
 * 依赖策略:平台外部依赖(react / react/jsx-runtime / cordis)由 shell 的模块表
 * 提供,保持 external;不声明 `@deepseek-ai/*` —— 客户端 bundle 的纯度门禁禁止
 * 跨半边 value import,跨插件协作一律走 cordis 服务。
 */
import { builtinModules } from 'node:module'
import { readFileSync } from 'node:fs'
import type { UserConfig } from 'tsdown'

/** Node 内建模块永远不能进入浏览器 module-loader 闭包。 */
const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(id => `node:${id}`),
])

/** 注册的 bundle id:npm 包名(module-loader compose key,必须等于包名)。 */
const BUNDLE_ID = 'dsh-structured-document'

/**
 * 卡片头部显示的插件版本号,构建期从本包 `package.json` 的 `version` 读入并
 * 内联为字符串字面量(见下面的 `define`)。这样版本号只有一个事实源,不会随
 * 发版漂移;浏览器闭包运行时不需要读文件,也不引入 Node 内建。
 */
function readOwnVersion(): string {
  const raw = readFileSync(new URL('./package.json', import.meta.url), 'utf8')
  const version = (JSON.parse(raw) as { version?: unknown }).version
  if (typeof version !== 'string' || version === '') {
    throw new Error('tsdown: package.json 缺少可用于卡片头部的 version 字段')
  }
  return version
}

/** 平台外部依赖(shell 静态模块表提供):React 及其 JSX runtime。 */
const PLATFORM_EXTERNALS = ['react', 'react/jsx-runtime', 'cordis']

/** 拒绝 @deepseek-ai value import 与 Node 内建泄漏。 */
function purityGate(): NonNullable<UserConfig['plugins']> {
  return [
    {
      name: 'dsh-structured-document:client-purity',
      resolveId(source: string) {
        if (NODE_BUILTINS.has(source)) {
          throw new Error(
            `client bundle purity: Node builtin "${source}" cannot run in the browser module table`,
          )
        }
        if (source.startsWith('@deepseek-ai/')) {
          throw new Error(
            `client bundle purity: "${source}" is not a platform module — ` +
            'cross-plugin value imports are forbidden; collaborate through cordis services',
          )
        }
        return null
      },
    },
  ]
}

export default {
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  deps: {
    // 平台外部依赖走模块表;其余 npm 依赖默认保持 external,不塞进浏览器闭包。
    neverBundle: PLATFORM_EXTERNALS,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    // 卡片头部的版本号:构建期读 package.json 后内联,单一事实源(见 readOwnVersion)。
    // 源码里以 `declare const __DSD_VERSION__` 声明,未打包直接运行时回退为占位串。
    __DSD_VERSION__: JSON.stringify(readOwnVersion()),
  },
  plugins: purityGate(),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(BUNDLE_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    // 闭包工厂的 require 只解析模块表条目;关闭代码分割,产物为单一脚本。
    codeSplitting: false,
  },
} satisfies UserConfig
