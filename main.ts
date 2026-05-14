import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile } from 'obsidian';

const STORAGE_KEY = 'obsidian-move-file-history';

interface MoveFileRecord {
  sourcePath: string;
  destPath: string;
  timestamp: number;
  operation: 'move' | 'undo';
}

interface ReferencedFile {
  name: string;
  path: string;
  extension: string;
  exists: boolean;
  selected: boolean;
}

interface ExtensionGroup {
  extension: string;
  files: ReferencedFile[];
  selected: boolean;
}

interface HistoryGroup {
  timestamp: number;
  records: MoveFileRecord[];
}

const Storage = {
  getHistory(): MoveFileRecord[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  saveHistory(records: MoveFileRecord[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  },

  addRecord(record: MoveFileRecord): void {
    const history = this.getHistory();
    history.push(record);
    this.saveHistory(history);
  },

  removeByIndex(index: number): void {
    const history = this.getHistory();
    history.splice(index, 1);
    this.saveHistory(history);
  },

  removeByTimestamp(timestamp: number): void {
    const history = this.getHistory();
    const filtered = history.filter(r => r.timestamp !== timestamp);
    this.saveHistory(filtered);
  }
};

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function groupHistoryByTimestamp(history: MoveFileRecord[]): HistoryGroup[] {
  const groups = new Map<number, MoveFileRecord[]>();
  
  for (const record of history) {
    const existing = groups.get(record.timestamp);
    groups.set(record.timestamp, existing ? [...existing, record] : [record]);
  }
  
  return Array.from(groups.entries())
    .map(([timestamp, records]) => ({ timestamp, records }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

class MoveFileModal extends Modal {
  private sourceFile: TFile;
  private groups: ExtensionGroup[] = [];
  private destinationPath: string;
  private errorMessage = '';
  private successMessage = '';
  private moveSourceFile = false;

  constructor(app: App, file: TFile) {
    super(app);
    this.sourceFile = file;
    this.destinationPath = this.getDefaultDestinationPath();
  }

  private getDefaultDestinationPath(): string {
    const fileName = this.sourceFile.basename;
    const parentFolder = this.sourceFile.parent?.path || '';
    return `${parentFolder}/${fileName}`;
  }

  private async analyzeReferencedFiles(): Promise<void> {
    const extensionMap = new Map<string, ReferencedFile[]>();
    const addedPaths = new Set<string>();

    const resolveAndAdd = (file: TFile): void => {
      if (addedPaths.has(file.path)) return;
      addedPaths.add(file.path);
      
      const ext = file.extension.toLowerCase();
      const files = extensionMap.get(ext) || [];
      files.push({
        name: file.name,
        path: file.path,
        extension: ext,
        exists: true,
        selected: true
      });
      extensionMap.set(ext, files);
    };

    const resolvedLinks = this.app.metadataCache.resolvedLinks[this.sourceFile.path] || {};
    for (const destPath of Object.keys(resolvedLinks)) {
      const file = this.app.vault.getAbstractFileByPath(destPath);
      if (file instanceof TFile) resolveAndAdd(file);
    }

    const fileCache = this.app.metadataCache.getFileCache(this.sourceFile);
    if (fileCache?.embeds) {
      for (const embed of fileCache.embeds) {
        const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, this.sourceFile.path);
        if (resolvedFile instanceof TFile) resolveAndAdd(resolvedFile);
      }
    }

    this.groups = Array.from(extensionMap.entries())
      .map(([ext, files]) => ({ extension: ext, files, selected: true }))
      .sort((a, b) => a.extension.localeCompare(b.extension));
  }

  private getSelectedFiles(): ReferencedFile[] {
    return this.groups.flatMap(group => group.files.filter(file => file.selected));
  }

  private toggleGroup(groupExtension: string): void {
    const group = this.groups.find(g => g.extension === groupExtension);
    if (!group) return;
    
    const newValue = !group.selected;
    group.selected = newValue;
    group.files.forEach(file => file.selected = newValue);
    this.render();
  }

  private toggleFile(groupExtension: string, fileName: string): void {
    const group = this.groups.find(g => g.extension === groupExtension);
    if (!group) return;
    
    const file = group.files.find(f => f.name === fileName);
    if (!file) return;
    
    file.selected = !file.selected;
    const allSelected = group.files.every(f => f.selected);
    const noneSelected = group.files.every(f => !f.selected);
    group.selected = allSelected ? true : noneSelected ? false : undefined;
    this.render();
  }

  private isFileSelected(groupExtension: string, fileName: string): boolean {
    const group = this.groups.find(g => g.extension === groupExtension);
    if (!group) return false;
    const file = group.files.find(f => f.name === fileName);
    return file?.selected ?? false;
  }

  private async createFolderIfNotExists(path: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) {
      await this.app.vault.createFolder(path);
    }
  }

  private async moveFiles(): Promise<void> {
    const selectedFiles = this.getSelectedFiles();

    if (selectedFiles.length === 0 && !this.moveSourceFile) {
      this.errorMessage = 'Please select at least one file to move.';
      this.successMessage = '';
      this.render();
      return;
    }

    if (!this.destinationPath.trim()) {
      this.errorMessage = 'Please enter a destination folder path.';
      this.successMessage = '';
      this.render();
      return;
    }

    try {
      await this.createFolderIfNotExists(this.destinationPath);
      const timestamp = Date.now();
      let movedCount = 0;

      for (const refFile of selectedFiles) {
        const file = this.app.vault.getAbstractFileByPath(refFile.path);
        if (!(file instanceof TFile)) continue;

        const destPath = `${this.destinationPath}/${file.name}`;
        if (file.path === destPath) continue;
        
        const existingFile = this.app.vault.getAbstractFileByPath(destPath);
        if (existingFile) continue;

        const sourceFilePath = file.path;
        await this.app.fileManager.renameFile(file, destPath);

        Storage.addRecord({
          sourcePath: sourceFilePath,
          destPath,
          timestamp,
          operation: 'move'
        });
        movedCount++;
      }

      if (this.moveSourceFile) {
        const sourceDestPath = `${this.destinationPath}/${this.sourceFile.name}`;
        if (this.sourceFile.path !== sourceDestPath) {
          const existingFile = this.app.vault.getAbstractFileByPath(sourceDestPath);
          if (!existingFile) {
            const sourceFilePath = this.sourceFile.path;
            await this.app.fileManager.renameFile(this.sourceFile, sourceDestPath);
            
            Storage.addRecord({
              sourcePath: sourceFilePath,
              destPath: sourceDestPath,
              timestamp,
              operation: 'move'
            });
            movedCount++;
          }
        }
      }

      this.successMessage = `Successfully moved ${movedCount} file(s) to ${this.destinationPath}`;
      this.errorMessage = '';
      new Notice(this.successMessage);

      setTimeout(() => this.close(), 2000);

    } catch (error) {
      this.errorMessage = `Error moving files: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.successMessage = '';
    }

    this.render();
  }

  private render(): void {
    const contentEl = this.contentEl;
    contentEl.empty();
    contentEl.addClass('move-file-modal');

    contentEl.createDiv({ cls: 'move-file-header' }, header => {
      header.createDiv({ cls: 'move-file-title', text: 'Move Referenced Files' });
    });

    contentEl.createDiv({ cls: 'move-file-source' }, source => {
      source.createDiv({ cls: 'move-file-source-label', text: 'Source File:' });
      source.createDiv({ cls: 'move-file-source-value', text: this.sourceFile.path });
      
      const sourceCheckbox = source.createDiv({ cls: 'move-file-source-checkbox' });
      const checkbox = sourceCheckbox.createEl('input', { type: 'checkbox', cls: 'move-file-source-input' });
      checkbox.checked = this.moveSourceFile;
      checkbox.addEventListener('change', (e) => {
        this.moveSourceFile = (e.target as HTMLInputElement).checked;
      });
      sourceCheckbox.createDiv({ cls: 'move-file-source-label-text', text: 'Move this file' });
    });

    if (this.errorMessage) {
      contentEl.createDiv({ cls: 'move-file-error', text: this.errorMessage });
    }

    if (this.successMessage) {
      contentEl.createDiv({ cls: 'move-file-success', text: this.successMessage });
    }

    contentEl.createDiv({ cls: 'move-file-groups' }, groupsEl => {
      for (const group of this.groups) {
        const groupEl = groupsEl.createDiv({ cls: 'move-file-group' });

        groupEl.createDiv({ cls: 'move-file-group-header' }, header => {
          const checkbox = header.createEl('input', { type: 'checkbox', cls: 'move-file-group-checkbox' });
          checkbox.checked = group.selected;
          checkbox.addEventListener('change', () => this.toggleGroup(group.extension));

          header.createDiv({ cls: 'move-file-group-name', text: `.${group.extension}` });
          header.createDiv({ cls: 'move-file-group-count', text: `${group.files.length} files` });
        });

        const content = groupEl.createDiv({ cls: 'move-file-group-content' });
        for (const file of group.files) {
          content.createDiv({ cls: 'move-file-item' }, item => {
            const checkbox = item.createEl('input', { type: 'checkbox', cls: 'move-file-item-checkbox' });
            checkbox.checked = this.isFileSelected(group.extension, file.name);
            checkbox.addEventListener('change', () => this.toggleFile(group.extension, file.name));

            const info = item.createDiv({ cls: 'move-file-item-info' });
            info.createDiv({ cls: 'move-file-item-name', text: file.name });
            info.createDiv({ cls: 'move-file-item-path', text: file.path });
          });
        }
      }
    });

    contentEl.createDiv({ cls: 'move-file-destination' }, dest => {
      dest.createDiv({ cls: 'move-file-destination-label', text: 'Destination Folder:' });
      const input = dest.createEl('input', { type: 'text', cls: 'move-file-destination-input' });
      input.value = this.destinationPath;
      input.addEventListener('input', e => {
        this.destinationPath = (e.target as HTMLInputElement).value;
      });
    });

    const selectedFiles = this.getSelectedFiles();
    if (selectedFiles.length > 0) {
      contentEl.createDiv({ cls: 'move-file-preview' }, preview => {
        preview.createDiv({ cls: 'move-file-preview-label', text: `Files to move (${selectedFiles.length}):` });
        const list = preview.createDiv({ cls: 'move-file-preview-list' });
        for (const file of selectedFiles) {
          list.createDiv({ cls: 'move-file-preview-item', text: file.path });
        }
      });
    }

    contentEl.createDiv({ cls: 'move-file-actions' }, actions => {
      const cancelBtn = actions.createEl('button', { cls: 'move-file-btn move-file-btn-secondary', text: 'Cancel' });
      cancelBtn.addEventListener('click', () => this.close());

      const moveBtn = actions.createEl('button', { cls: 'move-file-btn move-file-btn-primary', text: 'Move Files' });
      moveBtn.addEventListener('click', () => this.moveFiles());
    });
  }

  async onOpen(): Promise<void> {
    await this.analyzeReferencedFiles();
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class UndoMoveModal extends Modal {
  private history: MoveFileRecord[];

  constructor(app: App) {
    super(app);
    this.history = Storage.getHistory();
  }

  private async undoMoveByTimestamp(timestamp: number): Promise<void> {
    const recordsToUndo = this.history.filter(r => r.timestamp === timestamp);
    let successCount = 0;
    let failCount = 0;

    for (const record of recordsToUndo) {
      const destFile = this.app.vault.getAbstractFileByPath(record.destPath);

      if (!(destFile instanceof TFile)) {
        failCount++;
        continue;
      }

      try {
        await this.app.fileManager.renameFile(destFile, record.sourcePath);
        successCount++;
      } catch {
        failCount++;
      }
    }

    Storage.removeByTimestamp(timestamp);
    this.history = Storage.getHistory();
    this.render();

    if (failCount === 0) {
      new Notice(`Successfully undid ${successCount} file(s)`);
    } else if (successCount === 0) {
      new Notice(`Failed to undo ${failCount} file(s)`);
    } else {
      new Notice(`Undid ${successCount} file(s), ${failCount} failed`);
    }
  }

  private clearHistory(): void {
    Storage.saveHistory([]);
    this.history = [];
    this.render();
    new Notice('History cleared');
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const contentEl = this.contentEl;
    contentEl.empty();
    contentEl.addClass('undo-move-modal');

    contentEl.createDiv({ cls: 'undo-move-header' }, header => {
      header.createDiv({ cls: 'undo-move-title', text: 'Undo Move History' });
    });

    if (this.history.length === 0) {
      contentEl.createDiv({ cls: 'undo-move-empty', text: 'No move history' });
      return;
    }

    const historyGroups = groupHistoryByTimestamp(this.history);

    const historyList = contentEl.createDiv({ cls: 'undo-move-history' });

    for (const group of historyGroups) {
      const groupEl = historyList.createDiv({ cls: 'undo-move-group' });

      groupEl.createDiv({ cls: 'undo-move-group-header' }, header => {
        header.createDiv({ cls: 'undo-move-timestamp', text: formatTimestamp(group.timestamp) });
        header.createDiv({ cls: 'undo-move-group-count', text: `${group.records.length} file(s)` });
        
        const undoBtn = header.createEl('button', { cls: 'undo-move-btn', text: 'Undo All' });
        undoBtn.addEventListener('click', () => this.undoMoveByTimestamp(group.timestamp));
      });

      const filesList = groupEl.createDiv({ cls: 'undo-move-files' });
      for (const record of group.records) {
        const fileItem = filesList.createDiv({ cls: 'undo-move-file-item' });
        const sourcePath = fileItem.createDiv({ cls: 'undo-move-path' });
        sourcePath.createDiv({ cls: 'undo-move-source', text: record.sourcePath });
        fileItem.createDiv({ cls: 'undo-move-arrow', text: '→' });
        const destPath = fileItem.createDiv({ cls: 'undo-move-path' });
        destPath.createDiv({ cls: 'undo-move-dest', text: record.destPath });
      }
    }

    const footer = contentEl.createDiv({ cls: 'undo-move-footer' });
    const clearBtn = footer.createEl('button', { cls: 'undo-move-clear-btn', text: 'Clear History' });
    clearBtn.addEventListener('click', () => this.clearHistory());

    footer.createDiv({ cls: 'undo-move-count', text: `${historyGroups.length} operation(s), ${this.history.length} file(s)` });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export default class MoveFilePlugin extends Plugin {
  async onload(): Promise<void> {
    this.addCommand({
      id: 'move-referenced-files',
      name: 'Move Referenced Files',
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        if (checking) return !!view.file;
        if (view.file) new MoveFileModal(this.app, view.file).open();
      }
    });

    this.addCommand({
      id: 'undo-move-history',
      name: 'Move History (Undo)',
      checkCallback: (checking: boolean) => {
        if (checking) return true;
        new UndoMoveModal(this.app).open();
      }
    });

    this.addRibbonIcon('folder-up', 'Move Referenced Files', (evt: MouseEvent) => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.file) {
        new MoveFileModal(this.app, activeView.file).open();
      } else {
        new Notice('Please open a markdown file first.');
      }
    });
  }

  onunload(): void {
  }
}