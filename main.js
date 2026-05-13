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
    const extensionMap = /* @__PURE__ */ new Map();
    const resolvedLinks = this.app.metadataCache.resolvedLinks[this.sourceFile.path] || {};
    for (const destPath of Object.keys(resolvedLinks)) {
      const file = this.app.vault.getAbstractFileByPath(destPath);
      if (file instanceof import_obsidian.TFile) {
        const ext = file.extension.toLowerCase();
        if (!extensionMap.has(ext)) {
          extensionMap.set(ext, []);
        }
        extensionMap.get(ext).push({
          name: file.name,
          path: file.path,
          extension: ext,
          exists: true,
          selected: true
        });
      }
    }
    const fileCache = this.app.metadataCache.getFileCache(this.sourceFile);
    if (fileCache?.embeds) {
      for (const embed of fileCache.embeds) {
        const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, this.sourceFile.path);
        if (resolvedFile instanceof import_obsidian.TFile) {
          const ext = resolvedFile.extension.toLowerCase();
          const existingFiles = extensionMap.get(ext) || [];
          const alreadyExists = existingFiles.some((f) => f.path === resolvedFile.path);
          if (!alreadyExists) {
            if (!extensionMap.has(ext)) {
              extensionMap.set(ext, []);
            }
            extensionMap.get(ext).push({
              name: resolvedFile.name,
              path: resolvedFile.path,
              extension: ext,
              exists: true,
              selected: true
            });
          }
        }
      }
    }
    this.groups = Array.from(extensionMap.entries()).map(([ext, files]) => ({
      extension: ext,
      files,
      selected: true
    })).sort((a, b) => a.extension.localeCompare(b.extension));
  }
  /**
   * 获取所有被选中的文件列表
   * @returns 选中的引用文件数组
   */
  getSelectedFiles() {
    const selected = [];
    for (const group of this.groups) {
      for (const file of group.files) {
        if (file.selected) {
          selected.push(file);
        }
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
      const newValue = !group.selected;
      group.selected = newValue;
      for (const file of group.files) {
        file.selected = newValue;
      }
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
      const file = group.files.find((f) => f.name === fileName);
      if (file) {
        file.selected = !file.selected;
        const allSelected = group.files.every((f) => f.selected);
        const noneSelected = group.files.every((f) => !f.selected);
        if (allSelected) {
          group.selected = true;
        } else if (noneSelected) {
          group.selected = false;
        } else {
          group.selected = void 0;
        }
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
    if (!group) return false;
    const file = group.files.find((f) => f.name === fileName);
    return file?.selected ?? false;
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
      const timestamps = Date.now();
      for (const refFile of selectedFiles) {
        const sourceFile = this.app.vault.getAbstractFileByPath(refFile.path);
        if (sourceFile instanceof import_obsidian.TFile) {
          const destPath = `${this.destinationPath}/${sourceFile.name}`;
          if (sourceFile.path === destPath) {
            continue;
          }
          const existingFile = this.app.vault.getAbstractFileByPath(destPath);
          if (existingFile) {
            continue;
          }
          const sourceFilePath = sourceFile.path;
          await this.app.fileManager.renameFile(sourceFile, destPath);
          movedFiles.push({
            sourcePath: sourceFilePath,
            destPath,
            id: timestamps,
            operation: "move"
          });
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
    this.addCommand({
      id: "undo-move-referenced-files",
      name: "Undo Last Move",
      checkCallback: (checking) => {
        if (checking) {
          return this.hasMoveHistory();
        }
        this.undoLastMove();
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
  hasMoveHistory() {
    const stored = localStorage.getItem("obsidian-move-file-history");
    return stored && JSON.parse(stored).length > 0;
  }
  async undoLastMove() {
    const movehistory = this.getMoveHistory();
    if (movehistory.length === 0) {
      new import_obsidian.Notice("No move history to undo.");
      return;
    }
    const lastId = movehistory[movehistory.length - 1].id;
    const lastMoveHistory = movehistory.find((record) => record.id === lastId);
    if (!lastMoveHistory) {
      new import_obsidian.Notice("No move history with id: " + lastId);
      return;
    }
    try {
      await this.createFolderIfNotExists(lastMoveHistory.destPath);
      const movedFiles = [];
      const timestamps = Date.now();
      for (const refFile of lastMoveHistory) {
        const sourceFile = this.app.vault.getAbstractFileByPath(refFile.destPath);
        if (sourceFile instanceof import_obsidian.TFile) {
          const destPath = `${refFile.sourcePath}/${sourceFile.name}`;
          if (sourceFile.path === destPath) {
            continue;
          }
          const existingFile = this.app.vault.getAbstractFileByPath(destPath);
          if (existingFile) {
            continue;
          }
          const sourceFilePath = sourceFile.path;
          await this.app.fileManager.renameFile(sourceFile, destPath);
          movedFiles.push({
            sourcePath: sourceFilePath,
            destPath,
            id: timestamps,
            operation: "undo"
          });
        }
      }
      this.saveMoveHistory(movedFiles);
    } catch (error) {
      new import_obsidian.Notice(`Error undoing move: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  getMoveHistory() {
    const stored = localStorage.getItem("obsidian-move-file-history");
    return stored ? JSON.parse(stored) : [];
  }
  saveMoveHistory(records) {
    const history = this.getMoveHistory();
    history.unshift(...records);
    const trimmedHistory = history.slice(0, 10);
    localStorage.setItem("obsidian-move-file-history", JSON.stringify(trimmedHistory));
  }
  /**
   * 插件卸载时执行
   * 清理资源（当前无特殊清理需求）
   */
  onunload() {
  }
};
