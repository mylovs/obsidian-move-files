# Move Files Plugin for Obsidian

一款帮助您高效管理 Obsidian 笔记中引用文件的插件。自动分析当前笔记引用的所有附件，支持按扩展名分类选择并批量移动。

## 功能特性

- **引用文件分析**: 自动识别当前 markdown 文件中引用的所有外部文件（图片、PDF、视频等）
- **扩展名分类**: 按文件扩展名分组展示，支持批量选择
- **移动源文件**: 支持将当前打开的 markdown 文件一起移动
- **智能目标路径**: 默认目标文件夹名为当前文件名（不含扩展名）
- **冲突自动处理**: 目标存在同名文件时自动跳过，避免覆盖
- **移动历史记录**: 保存所有移动操作记录，支持按时间戳分组查看
- **批量撤销操作**: 支持按时间戳撤销同一批次移动的所有文件

## 安装方法

### 方法一：从 Obsidian 插件市场安装（推荐）

1. 打开 Obsidian 设置
2. 进入「第三方插件」页面
3. 点击「浏览」搜索 "Move Files"
4. 点击「安装」然后「启用」

### 方法二：手动安装

1. 下载最新版本的发布包
2. 将解压后的文件夹复制到 Obsidian 的插件目录
   - Windows: `%USERPROFILE%\.obsidian\plugins\`
   - macOS: `~/Library/Application Support/obsidian/plugins/`
3. 在 Obsidian 设置中启用插件

## 使用说明

### 移动引用文件

1. 打开一个 markdown 文件
2. 通过以下方式触发插件：
   - **命令面板**: 按 `Ctrl+P`（Windows）或 `Cmd+P`（macOS），搜索 "Move Referenced Files"
   - **侧边栏图标**: 点击左侧边栏的文件夹向上图标

<br />

1. 在弹出的模态框中：
   - 查看按扩展名分类的引用文件列表
   - 勾选需要移动的文件或文件组
   - 可选择是否同时移动当前 markdown 文件
   - 修改目标文件夹路径（默认为当前文件名）
2. 点击「Move Files」按钮执行移动

### 撤销移动操作

1. 按 `Ctrl+P`（Windows）或 `Cmd+P`（macOS）打开命令面板
2. 搜索 "Move History (Undo)"
3. 在历史记录中选择要撤销的操作批次
4. 点击「Undo All」按钮撤销该批次的所有移动

## 开发

### 环境要求

- Node.js >= 18.x
- npm >= 9.x

### 开发命令

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build

# 代码检查
npm run lint
```

### 安装到 Obsidian（开发模式）

1. 运行 `npm run dev`
2. 在 Obsidian 中开启「开发者模式」
3. 进入「第三方插件」页面，点击「浏览」
4. 选择项目文件夹

## 项目结构

```
obsidian-move-file/
├── main.ts          # 插件核心逻辑
├── manifest.json    # 插件配置文件
├── styles.css       # 插件样式
├── package.json     # Node.js 依赖配置
├── tsconfig.json    # TypeScript 配置
├── 需求文档.md      # 需求说明
├── 开发文档.md      # 开发说明
└── README.md        # 项目说明
```

## 支持的链接格式

| 格式类型       | 示例                 | 说明           |
| :--------- | :----------------- | :----------- |
| Markdown链接 | `[text](path)`     | 标准markdown链接 |
| Wiki链接     | `[[path]]`         | 基础wiki链接     |
| 嵌入Wiki链接   | `![[path]]`        | 带!前缀的嵌入链接    |
| 带锚点Wiki链接  | `[[path#heading]]` | 指向文档内标题的链接   |
| 带别名Wiki链接  | `[[path\|alias]]`  | 自定义显示文本的链接   |

## 版本历史

| 版本     | 日期         | 说明                               |
| :----- | :--------- | :------------------------------- |
| v1.3.0 | 2026-05-15 | 修复存储隔离问题，每个Obsidian库独立存储移动历史     |
| v1.2.0 | 2026-05-14 | 新增移动源文件功能；支持按时间戳批量撤销；优化代码结构      |
| v1.1.0 | 2026-05-14 | 新增撤销移动功能；改用MetadataCache API获取链接 |
| v1.0.0 | 2026-05-13 | 初始版本，支持引用文件分析、按扩展名分类、文件移动        |

<br />

<br />

## 许可证

MIT License

## 贡献

