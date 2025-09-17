import fs from 'fs';
import path from 'path';
import { RpfFile, RpfEntry, RpfDirectoryEntry, RpfFileEntry } from './rpf.js';

export interface RpfSearchResult {
  rpfPath: string;
  entryPath: string;
  entry: RpfEntry;
  rpfFile: RpfFile;
}

export class RpfManager {
  private rootPath: string = "";
  private rpfFiles: Map<string, RpfFile> = new Map();
  private initialized: boolean = false;

  async init(rootPath: string): Promise<void> {
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Root path does not exist: ${rootPath}`);
    }

    this.rootPath = path.resolve(rootPath);
    await this.scanForRpfFiles();
    this.initialized = true;
  }

  private async scanForRpfFiles(): Promise<void> {
    const rpfPaths = this.findRpfFiles(this.rootPath);

    for (const rpfPath of rpfPaths) {
      try {
        const rpfFile = new RpfFile(
          rpfPath,
          path.basename(rpfPath),
          0
        );

        await rpfFile.scanStructure();

        const relativePath = path.relative(this.rootPath, rpfPath).replace(/\\/g, '/');
        this.rpfFiles.set(relativePath, rpfFile);

        console.error(`Loaded RPF: ${relativePath}`);

        this.addNestedRpfs(rpfFile, relativePath);
      } catch (error) {
        console.error(`Failed to load RPF ${rpfPath}: ${error}`);
      }
    }
  }

  private findRpfFiles(dirPath: string): string[] {
    const rpfFiles: string[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            rpfFiles.push(...this.findRpfFiles(fullPath));
          }
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.rpf')) {
          rpfFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}: ${error}`);
    }

    return rpfFiles;
  }

  private addNestedRpfs(rpfFile: RpfFile, basePath: string): void {
    for (const child of rpfFile.children) {
      const nestedPath = `${basePath}/${child.fileName}`;
      this.rpfFiles.set(nestedPath, child);
      console.error(`Loaded nested RPF: ${nestedPath}`);

      if (child.children.length > 0) {
        this.addNestedRpfs(child, nestedPath);
      }
    }
  }

  getRpfList(): string[] {
    return Array.from(this.rpfFiles.keys()).sort();
  }

  getRpfFile(rpfPath: string): RpfFile | undefined {
    return this.rpfFiles.get(rpfPath);
  }

  listDirectory(rpfPath: string, directoryPath: string = ""): { directories: string[], files: string[] } | null {
    const rpf = this.rpfFiles.get(rpfPath);
    if (!rpf || !rpf.root) return null;

    let targetDir: RpfDirectoryEntry;

    if (!directoryPath || directoryPath === "/" || directoryPath === "") {
      targetDir = rpf.root;
    } else {
      const entry = rpf.findEntry(directoryPath);
      if (!entry || !(entry instanceof RpfDirectoryEntry)) {
        return null;
      }
      targetDir = entry;
    }

    return {
      directories: targetDir.directories.map(d => d.name),
      files: targetDir.files.map(f => f.name)
    };
  }

  getFileContent(rpfPath: string, filePath: string): Buffer | null {
    const rpf = this.rpfFiles.get(rpfPath);
    if (!rpf) return null;

    const entry = rpf.findEntry(filePath);
    if (!entry || !(entry instanceof RpfFileEntry)) {
      return null;
    }

    try {
      return entry.getFileData(rpf);
    } catch (error) {
      console.error(`Failed to extract file ${filePath} from ${rpfPath}: ${error}`);
      return null;
    }
  }

  getFileInfo(rpfPath: string, filePath: string): any | null {
    const rpf = this.rpfFiles.get(rpfPath);
    if (!rpf) return null;

    const entry = rpf.findEntry(filePath);
    if (!entry) return null;

    const isDirectory = entry instanceof RpfDirectoryEntry;
    const fileEntry = entry as RpfFileEntry;

    return {
      name: entry.name,
      path: entry.path,
      type: isDirectory ? 'directory' : 'file',
      size: isDirectory ? 0 : fileEntry.fileSize,
      compressedSize: isDirectory ? 0 : fileEntry.fileUncompressedSize,
      encrypted: isDirectory ? false : fileEntry.isEncrypted,
      rpfPath: rpfPath
    };
  }

  searchFiles(pattern: string): RpfSearchResult[] {
    const results: RpfSearchResult[] = [];
    const searchPattern = pattern.toLowerCase();

    for (const [rpfPath, rpfFile] of this.rpfFiles) {
      if (!rpfFile.root) continue;

      this.searchInDirectory(rpfFile.root, rpfPath, searchPattern, results, rpfFile);
    }

    return results;
  }

  private searchInDirectory(
    dir: RpfDirectoryEntry,
    rpfPath: string,
    pattern: string,
    results: RpfSearchResult[],
    rpfFile: RpfFile
  ): void {
    for (const file of dir.files) {
      if (this.matchesPattern(file.nameLower, pattern)) {
        results.push({
          rpfPath,
          entryPath: file.path,
          entry: file,
          rpfFile
        });
      }
    }

    for (const subdir of dir.directories) {
      if (this.matchesPattern(subdir.nameLower, pattern)) {
        results.push({
          rpfPath,
          entryPath: subdir.path,
          entry: subdir,
          rpfFile
        });
      }

      this.searchInDirectory(subdir, rpfPath, pattern, results, rpfFile);
    }
  }

  private matchesPattern(name: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(name);
    }
    return name.includes(pattern);
  }

  getDirectoryTree(rpfPath: string, directoryPath: string = "", maxDepth: number = 3): any | null {
    const rpf = this.rpfFiles.get(rpfPath);
    if (!rpf || !rpf.root) return null;

    let targetDir: RpfDirectoryEntry;

    if (!directoryPath || directoryPath === "/" || directoryPath === "") {
      targetDir = rpf.root;
    } else {
      const entry = rpf.findEntry(directoryPath);
      if (!entry || !(entry instanceof RpfDirectoryEntry)) {
        return null;
      }
      targetDir = entry;
    }

    return this.buildTree(targetDir, 0, maxDepth);
  }

  private buildTree(dir: RpfDirectoryEntry, depth: number, maxDepth: number): any {
    const tree: any = {
      name: dir.name || '/',
      type: 'directory',
      children: []
    };

    if (depth >= maxDepth) {
      return tree;
    }

    for (const subdir of dir.directories) {
      tree.children.push(this.buildTree(subdir, depth + 1, maxDepth));
    }

    for (const file of dir.files) {
      tree.children.push({
        name: file.name,
        type: 'file',
        size: file.fileSize,
        encrypted: file.isEncrypted
      });
    }

    return tree;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}