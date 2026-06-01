# DesktopBox 🖥️

> 全屏透明桌面辅助工具 — 图标收纳盒 · 系统监控 · 进程管理 · 命令行终端

DesktopBox 是一个 Windows 桌面增强工具，采用 **Tauri 2 + TypeScript** 构建。它在桌面壁纸之上渲染一组半透明亚克力材质模块，提供图标管理、资源监控、进程列表和命令行终端功能，**不侵入系统桌面组件（explorer.exe）**。

---

## ✨ 功能

### 📦 图标收纳盒
- 实时同步桌面图标（轮询 200-500ms）
- CSS Grid 网格布局，每行可配 6-12 个图标
- 双击打开文件/文件夹
- 图标拖拽重排 + 持久化顺序
- 可自由拖拽、缩放、调整透明度/模糊

### 📊 资源监控
- CPU 使用率（每秒刷新）
- 内存使用率（已用/总量 + 百分比）
- GPU 使用率（数据可用时显示）
- 系统时间

### 📋 进程列表
- 进程名 / PID / CPU% / 内存占用（每 0.5 秒刷新）
- 按列排序（升序/降序）
- 即时搜索过滤

### 💻 命令行终端
- 内嵌 xterm.js 终端
- Rust cmd.exe 子进程管道通信
- 支持 `dir`、`cd`、`mkdir`、`tasklist` 等基础指令
- ANSI 彩色输出
- 自定义指令集（JSON 配置 + 快捷按钮）

### ⌨️ 全局快捷键
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+D` | 隐藏/唤出整个应用窗口 |
| `Ctrl+Shift+F` | 切换图标收纳盒显隐 |
| `Ctrl+Shift+H` | 隐藏/恢复除图标盒外的所有模块 |
| `Ctrl+Alt+T` | 打开 Windows Terminal |
| `Ctrl+Alt+B` | 打开 Chrome 浏览器 |

### 🖱️ 系统托盘
- 左键单击托盘图标：隐藏/唤出应用窗口
- 右键菜单：开机自启动开关、关闭 DesktopBox

### 🎨 UI 特性
- 全屏透明无边框窗口，桌面壁纸完全可见
- 亚克力材质模块（`backdrop-filter: blur()`）
- 独立调节每模块的模糊强度（0-50px）和底色透明度
- 无标题栏、无边框设计
- 全局白色字体 + 黑色描边，任何壁纸下清晰可读
- 模块自由拖拽，布局自动持久化

---

## 🏗️ 技术栈

| 层级 | 技术选型 |
|------|----------|
| 前端 | 原生 TypeScript + HTML/CSS（无框架） |
| 构建 | Vite |
| 桌面框架 | Tauri 2（Rust 后端） |
| 系统监控 | `sysinfo` crate |
| 终端 | xterm.js + cmd.exe 管道 |
| 持久化 | `tauri-plugin-store` |
| 状态管理 | `@preact/signals`（轻量响应式） |
| 图标提取 | 自定义 Rust 实现 |

---

## 📦 安装

### 系统要求
- Windows 10+
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)（Windows 10 通常已预装）

### 下载
从 [Releases](https://github.com/MIEA04/desktopBox/releases) 页面下载最新安装包。

### 从源码构建

```bash
# 克隆
git clone https://github.com/MIEA04/desktopBox.git
cd desktopBox

# 安装依赖
pnpm install

# 开发模式
pnpm tauri dev

# 生产构建
pnpm tauri build
```

---

## 🚀 快速开始

1. 启动 DesktopBox → 全屏透明窗口覆盖桌面
2. 通过 **Ctrl+Shift+D** 隐藏/唤出整个窗口
3. 图标收纳盒自动显示桌面图标，双击打开
4. 拖拽各模块到任意位置，缩放至合适大小
5. 通过各模块右上角的 ⚙️ 按钮调节透明度和模糊

---

## 🗺️ 项目结构

```
desktopBox/
├── src/                          # 前端 TypeScript
│   ├── main.ts                   # 入口
│   ├── styles.css                # 全局样式
│   ├── core/                     # 核心层
│   │   ├── ModuleManager.ts      # 模块生命周期管理
│   │   ├── ModuleBase.ts         # 模块基类
│   │   ├── DragEngine.ts         # 拖拽引擎
│   │   ├── StateManager.ts       # 状态管理
│   │   ├── EventBus.ts           # 事件总线
│   │   └── Persistence.ts        # 持久化
│   ├── modules/                  # 业务模块
│   │   ├── IconBox/              # 图标收纳盒
│   │   ├── MonitorPanel/         # 资源监控
│   │   ├── ProcessTable/         # 进程列表
│   │   └── Terminal/             # 命令行终端
│   └── utils/                    # 工具函数
│       ├── constants.ts          # 常量
│       ├── tauriApi.ts           # Tauri API 封装
│       └── helpers.ts            # 辅助函数
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── lib.rs                # 入口 + 快捷键注册
│       ├── commands/             # Tauri 命令
│       │   ├── desktop.rs        # 桌面文件操作
│       │   ├── shell.rs          # 终端管道
│       │   ├── system.rs         # 系统监控
│       │   └── window.rs         # 窗口配置
│       └── services/             # 后台服务
│           ├── file_poller.rs    # 文件轮询
│           ├── shell_manager.rs  # Shell 会话管理
│           └── system_monitor.rs # 系统数据采集
└── README.md                     # 项目说明
```

---

## 📐 架构设计

DesktopBox 采用**嵌套式透明容器架构**：

```
┌─ Tauri 主窗口（全屏、透明、无边框）────────────────┐
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ 图标收纳盒 │  │ 资源监控  │  │  命令行终端      │  │
│  │ (网格布局) │  │ (数字面板)│  │  (xterm.js)     │  │
│  │ 亚克力材质 │  │ 亚克力材质│  │  亚克力材质      │  │
│  │ 可拖拽/缩放│  │ 可拖拽/缩放│  │  可拖拽/缩放    │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────┐                                       │
│  │ 进程列表  │  (所有模块均独立悬浮在桌面之上)        │
│  │ (只读表格)│                                       │
│  │ 亚克力材质│                                       │
│  └──────────┘                                       │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 开发

### 环境准备
- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) 1.70+
- [Tauri 2 CLI](https://v2.tauri.app/)

### 常用命令

```bash
pnpm tauri dev      # 启动开发模式（带热重载）
pnpm tauri build    # 生产构建
pnpm cleanup        # 清理残留进程（端口占用时）
npx tsc --noEmit    # TypeScript 类型检查
cargo check         # Rust 编译检查
```

---

## 📋 需求与里程碑

该项目包含 **44 项功能需求** 和 **12 项非功能需求**，按以下里程碑交付：

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| M1 | 脚手架与系统集成（透明窗口、快捷键） | ✅ |
| M2 | 模块框架 + 图标收纳盒核心 | ✅ |
| M3 | 监控、进程与配置系统 | ✅ |
| M4 | 命令行终端 + 集成测试 | ✅ |
| M5 | 标题栏移除 + 字体视觉重构 | ✅ |
| M6 | 应用隐藏/唤出 + 系统托盘 | ✅ |
| M4.6 | 隐藏其他模块快捷键 | ✅ |
| M4.7 | 系统托盘右键菜单 + 开机自启动 | ✅ |
| M7+ | 图标分区、模块独立配置、配置导入/导出等 | ⏳ 后期迭代 |

详细需求与计划见项目计划文档。

---

## 📄 许可

MIT License © 2026 MIEA04

---

> **DesktopBox** — 让你的桌面变成一个高效的工作站。
