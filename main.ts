
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

interface MoveFileRecord {
  sourcePath: string;
  destPath: string;
  timestamp: number;
}

interface ReferencedFile {
  name: string;
  path: string;
  extension: string;
  exists: boolean;
}

interface ExtensionGroup {
  extension: string;
  files: ReferencedFile[];
  selected: boolean;
}

class MoveFileModal extends Modal {
  private sourceFile: TFile;
  private groups: ExtensionGroup[] = [];
  private destinationPath: string = '';
  private errorMessage: string = '';
  private successMessage: string = '';

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
    const content = await this.app.vault.read(this.sourceFile);
    const references = this.extractReferences(content);
    
    const extensionMap = new Map<string, ReferencedFile[]>();
    
    for (const ref of references) {
      const file = this.app.vault.getAbstractFileByPath(ref);
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

    this.groups = Array.from(extensionMap.entries())
      .map(([ext, files]) => ({
        extension: ext,
        files: files,
        selected: true
      }))
      .sort((a, b) => a.extension.localeCompare(b.extension));
  }

  private extractReferences(content: string): string[] {
    const references: string[] = [];
    
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      const link = match[2];
      if (link && !link.startsWith('http://') && !link.startsWith('https://') && !link.startsWith('mailto:')) {
        references.push(link);
      }
    }

    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    while ((match = wikiLinkRegex.exec(content)) !== null) {
      const link = match[1];
      if (link) {
        references.push(link);
      }
    }

    return [...new Set(references)];
  }

  private getSelectedFiles(): ReferencedFile[] {
    const selected: ReferencedFile[] = [];
    for (const group of this.groups) {
      if (group.selected) {
        selected.push(...group.files);
      }
    }
    return selected;
  }

  private toggleGroup(groupExtension: string): void {
    const group = this.groups.find(g => g.extension === groupExtension);
    if (group) {
      group.selected = !group.selected;
    }
    this.render();
  }

  private toggleFile(groupExtension: string, fileName: string): void {
    const group = this.groups.find(g => g.extension === groupExtension);
    if (group) {
      const fileIndex = group.files.findIndex(f => f.name === fileName);
      if (fileIndex !== -1) {
        const allSelected = group.files.every(f => f !== group.files[fileIndex] && this.isFileSelected(groupExtension, f.name));
        group.selected = allSelected;
      }
    }
    this.render();
  }

  private isFileSelected(groupExtension: string, fileName: string): boolean {
    const group = this.groups.find(g => g.extension === groupExtension);
    if (!group || !group.selected) return false;
    return true;
  }

  private async createFolderIfNotExists(path: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) {
      await this.app.vault.createFolder(path);
    }
  }

  private async moveFiles(): Promise<void> {
    const selectedFiles = this.getSelectedFiles();
    if (selectedFiles.length === 0) {
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

      const movedFiles: MoveFileRecord[] = [];

      for (const refFile of selectedFiles) {
        const sourceFile = this.app.vault.getAbstractFileByPath(refFile.path);
        if (sourceFile instanceof TFile) {
          const destPath = `${this.destinationPath}/${sourceFile.name}`;
          
          const existingFile = this.app.vault.getAbstractFileByPath(destPath);
          if (existingFile) {
            await this.app.vault.delete(existingFile);
          }

          await this.app.vault.rename(sourceFile, destPath);
          movedFiles.push({
            sourcePath: sourceFile.path,
            destPath: destPath,
            timestamp: Date.now()
          });

          await this.updateMarkdownLinks(sourceFile.path, destPath);
        }
      }

      this.saveMoveHistory(movedFiles);

      this.successMessage = `Successfully moved ${selectedFiles.length} file(s) to ${this.destinationPath}`;
      this.errorMessage = '';
      new Notice(this.successMessage);

      setTimeout(() => {
        this.close();
      }, 2000);

    } catch (error) {
      this.errorMessage = `Error moving files: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.successMessage = '';
    }

    this.render();
  }

  private async updateMarkdownLinks(oldPath: string, newPath: string): Promise<void> {
    const content = await this.app.vault.read(this.sourceFile);
    const oldName = this.app.vault.getAbstractFileByPath(oldPath)?.name || '';
    
    let newContent = content;
    
    newContent = newContent.replace(
      new RegExp(`\\[([^\\]]+)\\]\\(${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
      `[$1](${newPath})`
    );
    
    newContent = newContent.replace(
      new RegExp(`\\[([^\\]]+)\\]\\(${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
      `[$1](${newPath})`
    );
    
    newContent = newContent.replace(
      new RegExp(`\\[\\[${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'g'),
      `[[${newPath}]]`
    );
    
    newContent = newContent.replace(
      new RegExp(`\\[\\[${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'g'),
      `[[${newPath}]]`
    );

    if (newContent !== content) {
      await this.app.vault.modify(this.sourceFile, newContent);
    }
  }

  private saveMoveHistory(records: MoveFileRecord[]): void {
    const history = this.getMoveHistory();
    history.unshift(...records);
    const trimmedHistory = history.slice(0, 10);
    localStorage.setItem('obsidian-move-file-history', JSON.stringify(trimmedHistory));
  }

  private getMoveHistory(): MoveFileRecord[] {
    const stored = localStorage.getItem('obsidian-move-file-history');
    return stored ? JSON.parse(stored) : [];
  }

  private render(): void {
    const contentEl = this.contentEl;
    contentEl.empty();
    contentEl.addClass('move-file-modal');

    contentEl.createDiv({ cls: 'move-file-header' }, (header) => {
      header.createDiv({ cls: 'move-file-title', text: 'Move Referenced Files' });
      header.createEl('span', { cls: 'move-file-close', text: '×' }).addEventListener('click', () => this.close());
    });

    contentEl.createDiv({ cls: 'move-file-source' }, (source) => {
      source.createDiv({ cls: 'move-file-source-label', text: 'Source File:' });
      source.createDiv({ cls: 'move-file-source-value', text: this.sourceFile.path });
    });

    if (this.errorMessage) {
      contentEl.createDiv({ cls: 'move-file-error', text: this.errorMessage });
    }

    if (this.successMessage) {
      contentEl.createDiv({ cls: 'move-file-success', text: this.successMessage });
    }

    contentEl.createDiv({ cls: 'move-file-groups' }, (groupsEl) => {
      for (const group of this.groups) {
        const groupEl = groupsEl.createDiv({ cls: 'move-file-group' });
        
        groupEl.createDiv({ cls: 'move-file-group-header' }, (header) => {
          const checkbox = header.createEl('input', { type: 'checkbox', cls: 'move-file-group-checkbox' });
          checkbox.checked = group.selected;
          checkbox.addEventListener('change', () => this.toggleGroup(group.extension));
          
          header.createDiv({ cls: 'move-file-group-name', text: `.${group.extension}` });
          header.createDiv({ cls: 'move-file-group-count', text: `${group.files.length} files` });
        });

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

    contentEl.createDiv({ cls: 'move-file-destination' }, (dest) => {
      dest.createDiv({ cls: 'move-file-destination-label', text: 'Destination Folder:' });
      const input = dest.createEl('input', { type: 'text', cls: 'move-file-destination-input' });
      input.value = this.destinationPath;
      input.addEventListener('input', (e) => {
        this.destinationPath = (e.target as HTMLInputElement).value;
      });
    });

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

    contentEl.createDiv({ cls: 'move-file-actions' }, (actions) => {
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

export default class MoveFilePlugin extends Plugin {
  async onload(): Promise<void> {
    this.addCommand({
      id: 'move-referenced-files',
      name: 'Move Referenced Files',
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        if (checking) {
          return !!view.file;
        }
        if (view.file) {
          new MoveFileModal(this.app, view.file).open();
        }
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
