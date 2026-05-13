
import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile } from 'obsidian';

/**
 * 移动文件记录接口
 * 用于记录文件移动历史，支持撤销操作
 */
interface MoveFileRecord {
  sourcePath: string;  // 源文件路径
  destPath: string;    // 目标文件路径
  timestamp: number;   // 移动时间戳
}

/**
 * 引用文件接口
 * 表示markdown文件中引用的外部文件
 */
interface ReferencedFile {
  name: string;        // 文件名
  path: string;        // 文件完整路径
  extension: string;   // 文件扩展名（小写）
  exists: boolean;     // 文件是否存在
}

/**
 * 扩展名分组接口
 * 将引用文件按扩展名分类管理
 */
interface ExtensionGroup {
  extension: string;       // 扩展名（如: png, jpg, pdf）
  files: ReferencedFile[]; // 该扩展名的所有文件
  selected: boolean;       // 是否选中该组
}

/**
 * 移动引用文件模态框类
 * 提供可视化界面让用户选择和移动当前markdown文件引用的外部文件
 */
class MoveFileModal extends Modal {
  private sourceFile: TFile;          // 当前打开的源markdown文件
  private groups: ExtensionGroup[];   // 按扩展名分组的引用文件列表
  private destinationPath: string;    // 目标文件夹路径
  private errorMessage: string;       // 错误提示消息
  private successMessage: string;     // 成功提示消息

  /**
   * 构造函数
   * @param app Obsidian应用实例
   * @param file 当前打开的markdown文件
   */
  constructor(app: App, file: TFile) {
    super(app);
    this.sourceFile = file;
    // 默认目标文件夹名为当前文件名（不含扩展名）
    this.destinationPath = this.getDefaultDestinationPath();
    this.groups = [];
    this.errorMessage = '';
    this.successMessage = '';
  }

  /**
   * 获取默认目标文件夹路径
   * 默认在当前文件同目录下创建一个以当前文件名命名的文件夹
   * @returns 默认目标路径
   */
  private getDefaultDestinationPath(): string {
    const fileName = this.sourceFile.basename;           // 获取不带扩展名的文件名
    const parentFolder = this.sourceFile.parent?.path || ''; // 获取父文件夹路径
    return `${parentFolder}/${fileName}`;                // 组合成默认路径
  }

  /**
   * 分析当前markdown文件中的引用文件
   * 提取所有markdown链接和wiki链接引用的文件，按扩展名分组
   */
  private async analyzeReferencedFiles(): Promise<void> {
    // 读取当前文件内容
    const content = await this.app.vault.read(this.sourceFile);
    // 提取所有引用路径
    const references = this.extractReferences(content);
    
    // 按扩展名分组存储
    const extensionMap = new Map<string, ReferencedFile[]>();
    
    // 遍历所有引用，验证文件是否存在并分组
    for (const ref of references) {
      const file = this.app.vault.getAbstractFileByPath(ref);
      // 仅处理实际存在的文件
      if (file instanceof TFile) {
        const ext = file.extension.toLowerCase();
        if (!extensionMap.has(ext)) {
          extensionMap.set(ext, []);
        }
        extensionMap.get(ext)!.push({
          name: file.name,
          path: file.path,
          extension: ext,
          exists: true
        });
      }
    }

    // 转换为分组数组并按扩展名排序
    this.groups = Array.from(extensionMap.entries())
      .map(([ext, files]) => ({
        extension: ext,
        files: files,
        selected: true  // 默认选中所有分组
      }))
      .sort((a, b) => a.extension.localeCompare(b.extension));
  }

  /**
   * 从markdown内容中提取所有引用链接
   * 支持两种链接格式：markdown链接 [text](path) 和 wiki链接 [[path]]
   * @param content markdown文件内容
   * @returns 去重后的引用路径列表
   */
  private extractReferences(content: string): string[] {
    const references: string[] = [];
    
    // 匹配markdown链接格式: [text](path)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      const link = match[2];
      // 过滤掉外部链接（http/https/mailto）
      if (link && !link.startsWith('http://') && !link.startsWith('https://') && !link.startsWith('mailto:')) {
        references.push(link);
      }
    }

    // 匹配wiki链接格式: [[path]]
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    while ((match = wikiLinkRegex.exec(content)) !== null) {
      const link = match[1];
      if (link) {
        references.push(link);
      }
    }

    // 去重后返回
    return [...new Set(references)];
  }

  /**
   * 获取所有被选中的文件列表
   * @returns 选中的引用文件数组
   */
  private getSelectedFiles(): ReferencedFile[] {
    const selected: ReferencedFile[] = [];
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
  private toggleGroup(groupExtension: string): void {
    const group = this.groups.find(g => g.extension === groupExtension);
    if (group) {
      group.selected = !group.selected;
    }
    this.render();  // 重新渲染界面
  }

  /**
   * 切换单个文件的选中状态（影响分组的全选状态）
   * @param groupExtension 文件所属扩展名
   * @param fileName 文件名
   */
  private toggleFile(groupExtension: string, fileName: string): void {
    const group = this.groups.find(g => g.extension === groupExtension);
    if (group) {
      const fileIndex = group.files.findIndex(f => f.name === fileName);
      if (fileIndex !== -1) {
        // 检查除当前文件外其他文件是否都被选中
        const allSelected = group.files.every(f => f !== group.files[fileIndex] && this.isFileSelected(groupExtension, f.name));
        group.selected = allSelected;
      }
    }
    this.render();  // 重新渲染界面
  }

  /**
   * 检查单个文件是否被选中
   * @param groupExtension 文件所属扩展名
   * @param fileName 文件名
   * @returns 是否选中
   */
  private isFileSelected(groupExtension: string, fileName: string): boolean {
    const group = this.groups.find(g => g.extension === groupExtension);
    if (!group || !group.selected) return false;
    return true;
  }

  /**
   * 如果目标文件夹不存在则创建
   * @param path 文件夹路径
   */
  private async createFolderIfNotExists(path: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) {
      await this.app.vault.createFolder(path);
    }
  }

  /**
   * 执行文件移动操作
   * 包含验证、创建文件夹、移动文件、更新链接、记录历史等步骤
   */
  private async moveFiles(): Promise<void> {
    const selectedFiles = this.getSelectedFiles();
    
    // 验证：必须选择至少一个文件
    if (selectedFiles.length === 0) {
      this.errorMessage = 'Please select at least one file to move.';
      this.successMessage = '';
      this.render();
      return;
    }

    // 验证：必须填写目标路径
    if (!this.destinationPath.trim()) {
      this.errorMessage = 'Please enter a destination folder path.';
      this.successMessage = '';
      this.render();
      return;
    }

    try {
      // 创建目标文件夹（如果不存在）
      await this.createFolderIfNotExists(this.destinationPath);

      const movedFiles: MoveFileRecord[] = [];

      // 遍历移动每个选中的文件
      for (const refFile of selectedFiles) {
        const sourceFile = this.app.vault.getAbstractFileByPath(refFile.path);
        if (sourceFile instanceof TFile) {
          const destPath = `${this.destinationPath}/${sourceFile.name}`;
          
          // 如果目标已存在同名文件，先删除
          const existingFile = this.app.vault.getAbstractFileByPath(destPath);
          if (existingFile) {
            await this.app.vault.delete(existingFile);
          }

          // 移动文件（重命名操作）
          await this.app.vault.rename(sourceFile, destPath);
          
          // 记录移动历史
          movedFiles.push({
            sourcePath: sourceFile.path,
            destPath: destPath,
            timestamp: Date.now()
          });

          // 更新源markdown文件中的链接引用
          await this.updateMarkdownLinks(sourceFile.path, destPath);
        }
      }

      // 保存移动历史记录
      this.saveMoveHistory(movedFiles);

      // 设置成功消息
      this.successMessage = `Successfully moved ${selectedFiles.length} file(s) to ${this.destinationPath}`;
      this.errorMessage = '';
      new Notice(this.successMessage);

      // 2秒后自动关闭模态框
      setTimeout(() => {
        this.close();
      }, 2000);

    } catch (error) {
      // 处理移动过程中的错误
      this.errorMessage = `Error moving files: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.successMessage = '';
    }

    this.render();  // 重新渲染以显示结果
  }

  /**
   * 更新源markdown文件中的链接引用
   * 将旧路径替换为新路径，支持markdown链接和wiki链接两种格式
   * @param oldPath 旧文件路径
   * @param newPath 新文件路径
   */
  private async updateMarkdownLinks(oldPath: string, newPath: string): Promise<void> {
    const content = await this.app.vault.read(this.sourceFile);
    const oldName = this.app.vault.getAbstractFileByPath(oldPath)?.name || '';
    
    let newContent = content;
    
    // 替换markdown链接格式: [text](oldPath) -> [text](newPath)
    newContent = newContent.replace(
      new RegExp(`\\[([^\\]]+)\\]\\(${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
      `[$1](${newPath})`
    );
    
    // 替换markdown链接格式（仅文件名）: [text](oldName) -> [text](newPath)
    newContent = newContent.replace(
      new RegExp(`\\[([^\\]]+)\\]\\(${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
      `[$1](${newPath})`
    );
    
    // 替换wiki链接格式: [[oldPath]] -> [[newPath]]
    newContent = newContent.replace(
      new RegExp(`\\[\\[${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'g'),
      `[[${newPath}]]`
    );
    
    // 替换wiki链接格式（仅文件名）: [[oldName]] -> [[newPath]]
    newContent = newContent.replace(
      new RegExp(`\\[\\[${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'g'),
      `[[${newPath}]]`
    );

    // 只有内容发生变化时才保存
    if (newContent !== content) {
      await this.app.vault.modify(this.sourceFile, newContent);
    }
  }

  /**
   * 保存移动历史到localStorage
   * 最多保存最近10条记录
   * @param records 移动记录数组
   */
  private saveMoveHistory(records: MoveFileRecord[]): void {
    const history = this.getMoveHistory();
    history.unshift(...records);           // 添加到历史记录开头
    const trimmedHistory = history.slice(0, 10);  // 保留最近10条
    localStorage.setItem('obsidian-move-file-history', JSON.stringify(trimmedHistory));
  }

  /**
   * 从localStorage获取移动历史记录
   * @returns 移动记录数组
   */
  private getMoveHistory(): MoveFileRecord[] {
    const stored = localStorage.getItem('obsidian-move-file-history');
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * 渲染模态框界面
   * 包含头部、源文件信息、分组列表、目标路径输入、预览和操作按钮
   */
  private render(): void {
    const contentEl = this.contentEl;
    contentEl.empty();
    contentEl.addClass('move-file-modal');

    // 头部区域
    contentEl.createDiv({ cls: 'move-file-header' }, (header) => {
      header.createDiv({ cls: 'move-file-title', text: 'Move Referenced Files' });
      header.createEl('span', { cls: 'move-file-close', text: '×' }).addEventListener('click', () => this.close());
    });

    // 源文件信息
    contentEl.createDiv({ cls: 'move-file-source' }, (source) => {
      source.createDiv({ cls: 'move-file-source-label', text: 'Source File:' });
      source.createDiv({ cls: 'move-file-source-value', text: this.sourceFile.path });
    });

    // 错误消息
    if (this.errorMessage) {
      contentEl.createDiv({ cls: 'move-file-error', text: this.errorMessage });
    }

    // 成功消息
    if (this.successMessage) {
      contentEl.createDiv({ cls: 'move-file-success', text: this.successMessage });
    }

    // 扩展名分组列表
    contentEl.createDiv({ cls: 'move-file-groups' }, (groupsEl) => {
      for (const group of this.groups) {
        const groupEl = groupsEl.createDiv({ cls: 'move-file-group' });
        
        // 分组头部（可点击切换选中状态）
        groupEl.createDiv({ cls: 'move-file-group-header' }, (header) => {
          const checkbox = header.createEl('input', { type: 'checkbox', cls: 'move-file-group-checkbox' });
          checkbox.checked = group.selected;
          checkbox.addEventListener('change', () => this.toggleGroup(group.extension));
          
          header.createDiv({ cls: 'move-file-group-name', text: `.${group.extension}` });
          header.createDiv({ cls: 'move-file-group-count', text: `${group.files.length} files` });
        });

        // 分组内容（文件列表）
        const content = groupEl.createDiv({ cls: 'move-file-group-content' });
        for (const file of group.files) {
          content.createDiv({ cls: 'move-file-item' }, (item) => {
            const checkbox = item.createEl('input', { type: 'checkbox', cls: 'move-file-item-checkbox' });
            checkbox.checked = this.isFileSelected(group.extension, file.name);
            checkbox.addEventListener('change', () => this.toggleFile(group.extension, file.name));
            
            item.createDiv({ cls: 'move-file-item-name', text: file.name });
            item.createDiv({ cls: 'move-file-item-path', text: file.path });
          });
        }
      }
    });

    // 目标路径输入
    contentEl.createDiv({ cls: 'move-file-destination' }, (dest) => {
      dest.createDiv({ cls: 'move-file-destination-label', text: 'Destination Folder:' });
      const input = dest.createEl('input', { type: 'text', cls: 'move-file-destination-input' });
      input.value = this.destinationPath;
      input.addEventListener('input', (e) => {
        this.destinationPath = (e.target as HTMLInputElement).value;
      });
    });

    // 移动预览
    const selectedFiles = this.getSelectedFiles();
    if (selectedFiles.length > 0) {
      contentEl.createDiv({ cls: 'move-file-preview' }, (preview) => {
        preview.createDiv({ cls: 'move-file-preview-label', text: `Files to move (${selectedFiles.length}):` });
        const list = preview.createDiv({ cls: 'move-file-preview-list' });
        for (const file of selectedFiles) {
          list.createDiv({ cls: 'move-file-preview-item', text: file.path });
        }
      });
    }

    // 操作按钮
    contentEl.createDiv({ cls: 'move-file-actions' }, (actions) => {
      const cancelBtn = actions.createEl('button', { cls: 'move-file-btn move-file-btn-secondary', text: 'Cancel' });
      cancelBtn.addEventListener('click', () => this.close());

      const moveBtn = actions.createEl('button', { cls: 'move-file-btn move-file-btn-primary', text: 'Move Files' });
      moveBtn.addEventListener('click', () => this.moveFiles());
    });
  }

  /**
   * 模态框打开时执行的初始化操作
   */
  async onOpen(): Promise<void> {
    await this.analyzeReferencedFiles();  // 分析引用文件
    this.render();                        // 渲染界面
  }

  /**
   * 模态框关闭时执行的清理操作
   */
  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * 插件主类
 * 负责注册命令和ribbon图标
 */
export default class MoveFilePlugin extends Plugin {
  /**
   * 插件加载时执行
   * 注册命令和ribbon图标
   */
  async onload(): Promise<void> {
    // 注册命令面板命令
    this.addCommand({
      id: 'move-referenced-files',
      name: 'Move Referenced Files',
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        // checking为true时，返回命令是否可用（必须有打开的文件）
        if (checking) {
          return !!view.file;
        }
        // 执行命令时打开模态框
        if (view.file) {
          new MoveFileModal(this.app, view.file).open();
        }
      }
    });

    // 注册侧边栏ribbon图标
    this.addRibbonIcon('folder-up', 'Move Referenced Files', (evt: MouseEvent) => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.file) {
        new MoveFileModal(this.app, activeView.file).open();
      } else {
        new Notice('Please open a markdown file first.');
      }
    });
  }

  /**
   * 插件卸载时执行
   * 清理资源（当前无特殊清理需求）
   */
  onunload(): void {
  }
}
