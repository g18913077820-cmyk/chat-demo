# 参与贡献

欢迎提 Issue 和 PR。这个项目是 DeepSeek chat-demo 的一个增强分支，改动主要集中在同步、阅读增强和界面三块。

## 开发环境

- Node.js 22.12 及以上
- pnpm（`corepack enable` 或 `npm i -g pnpm`）

```sh
git clone https://github.com/<你的账号>/chat-demo.git
cd chat-demo
pnpm install
pnpm dev            # http://localhost:8090
```

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发服务器（HMR） |
| `pnpm build` | 生产构建到 `dist/` |
| `pnpm type` | TypeScript 类型检查 |
| `pnpm lint` | oxlint 静态检查 |
| `pnpm format` | oxfmt 格式化 |
| `pnpm sync` | 启动同步服务（可选） |

提交 PR 前请确保 `pnpm type && pnpm lint && pnpm build` 全部通过（CI 也会跑这三项）。

## 目录结构

```text
src/
  app/                 应用外壳、主题与字体
  components/
    chatInput/         输入框、附件、语音
    markdown/          Markdown 渲染、代码块折叠、Mermaid、KaTeX
    messages/          消息列表、单条消息、刻度尺、标签/备注弹窗
    sider/             侧边栏、会话项、搜索
    settings/          设置弹窗（主题、字体、同步、导入导出）
  services/
    chat/              会话状态、IndexedDB、分支、导入导出
    sync/              同步客户端：协议、引擎
    api/               DeepSeek API 与 SSE
server/
  sync-server.mjs      零依赖同步服务
  static-server.mjs    静态站点服务（生产用）
  README.md            同步协议、部署与替代存储方案
docs/                  部署说明与截图
```

## 常见改动从哪里下手

| 想改什么 | 位置 |
| --- | --- |
| 同步协议 / 存储 | `server/sync-server.mjs` + `src/services/sync/` |
| 刻度尺、收藏、标签、备注 | `src/components/messages/MessageRail.tsx`、`store.ts` 里的标记操作 |
| 主题配色 | `src/app/theme.css` 的 `body[data-theme=...]` 段落 |
| 字体 | `src/app/fonts.css` + `src/assets/fonts/`，字体需 OFL 等允许再分发的协议 |
| 导入导出格式 | `src/services/chat/history/`（格式与 DeepSeek 导出的 ZIP 兼容，改动要保证能互相导入） |

## 代码约定

- TypeScript strict 模式，避免 `any`；类型推导不清楚时显式标注
- 注释写「为什么」，不写「做了什么」；与现有代码风格保持一致
- 优先用项目已有的基础组件（`src/components/base/`），不要引入新的 UI 依赖
- 新增文案必须同时改 `src/i18n/zh.ts` 和 `src/i18n/en.ts`（类型会强制检查）
- 不要在代码里写死个人域名、IP、令牌或任何凭据

## 提交与 PR

1. 从 `main` 切分支：`git checkout -b feat/your-feature`
2. 提交信息用祈使句，说明改了什么，例如 `feat: 刻度尺支持按标签筛选`；常用前缀：`feat`、`fix`、`style`、`docs`、`chore`
3. 一个 PR 只做一件事，UI 改动手动附上修改前后截图
4. 描述里写清楚：动机、方案、验证方式（做了什么测试、在哪些浏览器/设备上试过）
5. 涉及界面时，请说明浅色/深色主题和手机竖屏下的表现

## 手动验证清单

没有端到端测试，改动后建议至少自查：

- [ ] 新建会话、发送消息、停止生成、重新生成
- [ ] 切换会话、搜索、收藏/标签/备注、刻度尺跳转
- [ ] 导入一个 DeepSeek 导出的 ZIP（覆盖与合并两种模式）
- [ ] 手机竖屏：侧边栏抽屉、刻度面板、上一轮/下一轮
- [ ] 浅色 / 深色 / 自定义主题各看一眼
- [ ] 如果改了同步：两台浏览器（不同 origin）互相推送与拉取

## 协议

代码以 [MIT](LICENSE) 发布；提交 PR 即表示同意以同一协议贡献。内置字体的授权见 `src/assets/fonts/*/OFL.txt`。
