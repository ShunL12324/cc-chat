# cc-chat

Discord Bot 桥接 Claude Code 到手机端。

## 项目概述

通过 Discord Bot 在手机上控制本地电脑的 Claude Code，支持多项目并发对话。

## 技术栈

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Discord**: discord.js v14
- **Database**: bun:sqlite
- **Claude**: CLI spawn (`claude -p --output-format stream-json`)

## 架构设计

```
src/
├── index.ts                 # 入口
├── config.ts                # 配置
├── types/                   # 类型定义
│   ├── index.ts
│   ├── claude.ts            # Claude SDK 消息类型
│   └── session.ts           # 会话类型
├── core/                    # 核心逻辑
│   ├── claude-runner.ts     # Claude CLI 执行器
│   ├── message-parser.ts    # 消息解析器
│   ├── session-manager.ts   # 会话管理
│   └── process-manager.ts   # 进程管理
├── store/                   # 存储层
│   └── sqlite-store.ts      # SQLite 实现
└── adapters/                # 适配器
    ├── discord-bot.ts       # Discord Bot
    ├── commands.ts          # 斜杠命令
    └── output-formatter.ts  # 输出格式化
```

## 核心概念

### Thread 架构
- 主频道 `#claude` 用于创建项目
- 每个 Thread = 一个项目 = 一个工作目录
- Thread 名称 = 项目名称（自动从路径提取）

### Session 管理
- Session ID 从 Claude 的 `stream-json` 输出获取
- 使用 `--resume <session_id>` 恢复对话
- SQLite 持久化存储

### 命令列表
| 命令 | 描述 | 位置 |
|------|------|------|
| `/new <path>` | 创建项目线程 | 主频道 |
| `/ls [path]` | 浏览目录（按钮交互） | 任意 |
| `/session` | 查看 session 信息 | 线程内 |
| `/session clear` | 清除 session | 线程内 |
| `/status` | 查看所有项目状态 | 任意 |
| `/cost` | 查看费用统计 | 任意 |
| `/stop` | 停止运行中的任务 | 线程内 |
| `/model <model>` | 切换模型 | 线程内 |
| `/archive` | 归档线程 | 线程内 |

## 开发规范

### 代码风格
- 使用 ESM 模块
- 优先使用 Bun 原生 API（spawn、sqlite）
- 类型优先，避免 `any`
- 错误处理：所有异步操作需要 try-catch

### 文件命名
- 小写 kebab-case
- 类型文件以 `.ts` 结尾
- 测试文件以 `.test.ts` 结尾

### 提交规范
- feat: 新功能
- fix: Bug 修复
- refactor: 重构
- docs: 文档

## 环境变量

```env
# Discord
DISCORD_TOKEN=         # Bot Token
DISCORD_CLIENT_ID=     # 应用 ID
DISCORD_GUILD_ID=      # 服务器 ID（开发用）

# 项目
PROJECT_ROOTS=         # 项目根目录，逗号分隔
DB_PATH=./data/cc-chat.db

# 可选
ALLOWED_USER_IDS=      # 允许的用户 ID，逗号分隔
```

## 运行

```bash
# 安装依赖
bun install

# 开发
bun run dev

# 生产
bun run start
```
