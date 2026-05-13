"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MoveFilePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var MoveFileModal = class extends import_obsidian.Modal {
  // 成功提示消息
  /**
   * 构造函数
   * @param app Obsidian应用实例
   * @param file 当前打开的markdown文件
   */
  constructor(app, file) {
    super(app);
    this.sourceFile = file;
    this.destinationPath = this.getDefaultDestinationPath();
    this.groups = [];
    this.errorMessage = "";
    this.successMessage = "";
  }
  /**
   * 获取默认目标文件夹路径
   * 默认在当前文件同目录下创建一个以当前文件名命名的文件夹
   * @returns 默认目标路径
   */
  getDefaultDestinationPath() {
    const fileName = this.sourceFile.basename;
    const parentFolder = this.sourceFile.parent?.path || "";
    return `${parentFolder}/${fileName}`;
  }
  /**
   * 分析当前markdown文件中的引用文件
   * 提取所有markdown链接和wiki链接引用的文件，按扩展名分组
   */
  async analyzeReferencedFiles() {
    const content = await this.app.vault.read(this.sourceFile);
    const references = this.extractReferences(content);
    const extensionMap = /* @__PURE__ */ new Map();
    const sourceFolder = this.sourceFile.parent?.path || "";
    for (const ref of references) {
      let file = this.app.vault.getAbstractFileByPath(ref);
      if (!(file instanceof import_obsidian.TFile) && sourceFolder) {
        const relativePath = `${sourceFolder}/${ref}`;
        file = this.app.vault.getAbstractFileByPath(relativePath);
      }
      if (file instanceof import_obsidian.TFile) {
        const ext = file.extension.toLowerCase();
        if (!extensionMap.has(ext)) {
          extensionMap.set(ext, []);
        }
        extensionMap.get(ext).push({
          name: file.name,
          path: file.path,
          extension: ext,
          exists: true
        });
      }
    }
    this.groups = Array.from(extensionMap.entries()).map(([ext, files]) => ({
      extension: ext,
      files,
      selected: true
    })).sort((a, b) => a.extension.localeCompare(b.extension));
  }
  /**
   * 从markdown内容中提取所有引用链接
   * 支持多种链接格式：
   * - Markdown链接: [text](path)
   * - Wiki链接: [[path]], ![[path]]
   * - 带锚点/别名的Wiki链接: [[path#xx]], [[path|xx]], ![[path#xx]], ![[path|xx]]
   * @param content markdown文件内容
   * @returns 去重后的引用路径列表（已提取纯路径，去掉锚点和别名）
   */
  extractReferences(content) {
    const references = [];
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      const link = match[2];
      if (link && !link.startsWith("http://") && !link.startsWith("https://") && !link.startsWith("mailto:")) {
        const purePath = this.extractPurePath(link);
        if (purePath) {
          references.push(purePath);
        }
      }
    }
    const wikiLinkRegex = /!?\[\[([^\]]+)\]\]/g;
    while ((match = wikiLinkRegex.exec(content)) !== null) {
      const link = match[1];
      if (link) {
        const purePath = this.extractPurePath(link);
        if (purePath) {
          references.push(purePath);
        }
      }
    }
    return [...new Set(references)];
  }
  /**
   * 从链接中提取纯路径部分
   * 移除锚点（#后面的内容）和别名（|后面的内容）
   * @param link 原始链接
   * @returns 纯路径
   */
  extractPurePath(link) {
    if (!link) return "";
    const pipeIndex = link.indexOf("|");
    if (pipeIndex !== -1) {
      link = link.substring(0, pipeIndex);
    }
    const hashIndex = link.indexOf("#");
    if (hashIndex !== -1) {
      link = link.substring(0, hashIndex);
    }
    return link.trim();
  }
  /**
   * 获取所有被选中的文件列表
   * @returns 选中的引用文件数组
   */
  getSelectedFiles() {
    const selected = [];
    for (const group of this.groups) {
      if (group.selected) {
        selected.push(...group.files);
      }
    }
    return selected;
  }
  /**
   * 切换整个扩展名分组的选中状态
   * @param groupExtension 扩展名（不含点号）
   */
  toggleGroup(groupExtension) {
    const group = this.groups.find((g) => g.extension === groupExtension);
    if (group) {
      group.selected = !group.selected;
    }
    this.render();
  }
  /**
   * 切换单个文件的选中状态（影响分组的全选状态）
   * @param groupExtension 文件所属扩展名
   * @param fileName 文件名
   */
  toggleFile(groupExtension, fileName) {
    const group = this.groups.find((g) => g.extension === groupExtension);
    if (group) {
      const fileIndex = group.files.findIndex((f) => f.name === fileName);
      if (fileIndex !== -1) {
        const allSelected = group.files.every((f) => f !== group.files[fileIndex] && this.isFileSelected(groupExtension, f.name));
        group.selected = allSelected;
      }
    }
    this.render();
  }
  /**
   * 检查单个文件是否被选中
   * @param groupExtension 文件所属扩展名
   * @param fileName 文件名
   * @returns 是否选中
   */
  isFileSelected(groupExtension, fileName) {
    const group = this.groups.find((g) => g.extension === groupExtension);
    if (!group || !group.selected) return false;
    return true;
  }
  /**
   * 如果目标文件夹不存在则创建
   * @param path 文件夹路径
   */
  async createFolderIfNotExists(path) {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) {
      await this.app.vault.createFolder(path);
    }
  }
  /**
   * 执行文件移动操作
   * 包含验证、创建文件夹、移动文件、更新链接、记录历史等步骤
   */
  async moveFiles() {
    const selectedFiles = this.getSelectedFiles();
    if (selectedFiles.length === 0) {
      this.errorMessage = "Please select at least one file to move.";
      this.successMessage = "";
      this.render();
      return;
    }
    if (!this.destinationPath.trim()) {
      this.errorMessage = "Please enter a destination folder path.";
      this.successMessage = "";
      this.render();
      return;
    }
    try {
      await this.createFolderIfNotExists(this.destinationPath);
      const movedFiles = [];
      for (const refFile of selectedFiles) {
        const sourceFile = this.app.vault.getAbstractFileByPath(refFile.path);
        if (sourceFile instanceof import_obsidian.TFile) {
          const destPath = `${this.destinationPath}/${sourceFile.name}`;
          const existingFile = this.app.vault.getAbstractFileByPath(destPath);
          if (existingFile) {
            await this.app.vault.delete(existingFile);
          }
          await this.app.vault.rename(sourceFile, destPath);
          movedFiles.push({
            sourcePath: sourceFile.path,
            destPath,
            timestamp: Date.now()
          });
          await this.updateMarkdownLinks(sourceFile.path, destPath);
        }
      }
      this.saveMoveHistory(movedFiles);
      this.successMessage = `Successfully moved ${selectedFiles.length} file(s) to ${this.destinationPath}`;
      this.errorMessage = "";
      new import_obsidian.Notice(this.successMessage);
      setTimeout(() => {
        this.close();
      }, 2e3);
    } catch (error) {
      this.errorMessage = `Error moving files: ${error instanceof Error ? error.message : "Unknown error"}`;
      this.successMessage = "";
    }
    this.render();
  }
  /**
   * 更新源markdown文件中的链接引用
   * 将旧路径替换为新路径，支持markdown链接和wiki链接两种格式
   * @param oldPath 旧文件路径
   * @param newPath 新文件路径
   */
  async updateMarkdownLinks(oldPath, newPath) {
    const content = await this.app.vault.read(this.sourceFile);
    const oldName = this.app.vault.getAbstractFileByPath(oldPath)?.name || "";
    let newContent = content;
    newContent = newContent.replace(
      new RegExp(`\\[([^\\]]+)\\]\\(${oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "g"),
      `[$1](${newPath})`
    );
    newContent = newContent.replace(
      new RegExp(`\\[([^\\]]+)\\]\\(${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "g"),
      `[$1](${newPath})`
    );
    newContent = newContent.replace(
      new RegExp(`\\[\\[${oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\]`, "g"),
      `[[${newPath}]]`
    );
    newContent = newContent.replace(
      new RegExp(`\\[\\[${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\]`, "g"),
      `[[${newPath}]]`
    );
    if (newContent !== content) {
      await this.app.vault.modify(this.sourceFile, newContent);
    }
  }
  /**
   * 保存移动历史到localStorage
   * 最多保存最近10条记录
   * @param records 移动记录数组
   */
  saveMoveHistory(records) {
    const history = this.getMoveHistory();
    history.unshift(...records);
    const trimmedHistory = history.slice(0, 10);
    localStorage.setItem("obsidian-move-file-history", JSON.stringify(trimmedHistory));
  }
  /**
   * 从localStorage获取移动历史记录
   * @returns 移动记录数组
   */
  getMoveHistory() {
    const stored = localStorage.getItem("obsidian-move-file-history");
    return stored ? JSON.parse(stored) : [];
  }
  /**
   * 渲染模态框界面
   * 包含头部、源文件信息、分组列表、目标路径输入、预览和操作按钮
   */
  render() {
    const contentEl = this.contentEl;
    contentEl.empty();
    contentEl.addClass("move-file-modal");
    contentEl.createDiv({ cls: "move-file-header" }, (header) => {
      header.createDiv({ cls: "move-file-title", text: "Move Referenced Files" });
      header.createEl("span", { cls: "move-file-close", text: "\xD7" }).addEventListener("click", () => this.close());
    });
    contentEl.createDiv({ cls: "move-file-source" }, (source) => {
      source.createDiv({ cls: "move-file-source-label", text: "Source File:" });
      source.createDiv({ cls: "move-file-source-value", text: this.sourceFile.path });
    });
    if (this.errorMessage) {
      contentEl.createDiv({ cls: "move-file-error", text: this.errorMessage });
    }
    if (this.successMessage) {
      contentEl.createDiv({ cls: "move-file-success", text: this.successMessage });
    }
    contentEl.createDiv({ cls: "move-file-groups" }, (groupsEl) => {
      for (const group of this.groups) {
        const groupEl = groupsEl.createDiv({ cls: "move-file-group" });
        groupEl.createDiv({ cls: "move-file-group-header" }, (header) => {
          const checkbox = header.createEl("input", { type: "checkbox", cls: "move-file-group-checkbox" });
          checkbox.checked = group.selected;
          checkbox.addEventListener("change", () => this.toggleGroup(group.extension));
          header.createDiv({ cls: "move-file-group-name", text: `.${group.extension}` });
          header.createDiv({ cls: "move-file-group-count", text: `${group.files.length} files` });
        });
        const content = groupEl.createDiv({ cls: "move-file-group-content" });
        for (const file of group.files) {
          content.createDiv({ cls: "move-file-item" }, (item) => {
            const checkbox = item.createEl("input", { type: "checkbox", cls: "move-file-item-checkbox" });
            checkbox.checked = this.isFileSelected(group.extension, file.name);
            checkbox.addEventListener("change", () => this.toggleFile(group.extension, file.name));
            item.createDiv({ cls: "move-file-item-name", text: file.name });
            item.createDiv({ cls: "move-file-item-path", text: file.path });
          });
        }
      }
    });
    contentEl.createDiv({ cls: "move-file-destination" }, (dest) => {
      dest.createDiv({ cls: "move-file-destination-label", text: "Destination Folder:" });
      const input = dest.createEl("input", { type: "text", cls: "move-file-destination-input" });
      input.value = this.destinationPath;
      input.addEventListener("input", (e) => {
        this.destinationPath = e.target.value;
      });
    });
    const selectedFiles = this.getSelectedFiles();
    if (selectedFiles.length > 0) {
      contentEl.createDiv({ cls: "move-file-preview" }, (preview) => {
        preview.createDiv({ cls: "move-file-preview-label", text: `Files to move (${selectedFiles.length}):` });
        const list = preview.createDiv({ cls: "move-file-preview-list" });
        for (const file of selectedFiles) {
          list.createDiv({ cls: "move-file-preview-item", text: file.path });
        }
      });
    }
    contentEl.createDiv({ cls: "move-file-actions" }, (actions) => {
      const cancelBtn = actions.createEl("button", { cls: "move-file-btn move-file-btn-secondary", text: "Cancel" });
      cancelBtn.addEventListener("click", () => this.close());
      const moveBtn = actions.createEl("button", { cls: "move-file-btn move-file-btn-primary", text: "Move Files" });
      moveBtn.addEventListener("click", () => this.moveFiles());
    });
  }
  /**
   * 模态框打开时执行的初始化操作
   */
  async onOpen() {
    await this.analyzeReferencedFiles();
    this.render();
  }
  /**
   * 模态框关闭时执行的清理操作
   */
  onClose() {
    this.contentEl.empty();
  }
};
var MoveFilePlugin = class extends import_obsidian.Plugin {
  /**
   * 插件加载时执行
   * 注册命令和ribbon图标
   */
  async onload() {
    this.addCommand({
      id: "move-referenced-files",
      name: "Move Referenced Files",
      editorCheckCallback: (checking, editor, view) => {
        if (checking) {
          return !!view.file;
        }
        if (view.file) {
          new MoveFileModal(this.app, view.file).open();
        }
      }
    });
    this.addRibbonIcon("folder-up", "Move Referenced Files", (evt) => {
      const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (activeView && activeView.file) {
        new MoveFileModal(this.app, activeView.file).open();
      } else {
        new import_obsidian.Notice("Please open a markdown file first.");
      }
    });
  }
  /**
   * 插件卸载时执行
   * 清理资源（当前无特殊清理需求）
   */
  onunload() {
  }
};
