import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { GTACrypto, RpfEncryption } from './crypto.js';

export abstract class RpfEntry {
  nameOffset: number = 0;
  name: string = "";
  nameLower: string = "";
  path: string = "";
  parent?: RpfDirectoryEntry;
  file?: RpfFile;

  abstract read(data: DataView, offset: number): void;
}

export class RpfDirectoryEntry extends RpfEntry {
  entriesIndex: number = 0;
  entriesCount: number = 0;
  directories: RpfDirectoryEntry[] = [];
  files: RpfFileEntry[] = [];

  read(data: DataView, offset: number): void {
    this.nameOffset = data.getUint32(offset, true);
    const h1 = data.getUint32(offset + 4, true);
    const h2 = data.getUint32(offset + 8, true);
    const h3 = data.getUint32(offset + 12, true);

    this.entriesIndex = h1;
    this.entriesCount = h2;

    if (h3 !== 0x7FFFFF00) {
      throw new Error(`Invalid directory entry identifier: ${h3.toString(16)}`);
    }
  }
}

export abstract class RpfFileEntry extends RpfEntry {
  fileOffset: number = 0;
  fileSize: number = 0;
  fileUncompressedSize: number = 0;
  isEncrypted: boolean = false;

  abstract read(data: DataView, offset: number): void;

  getFileData(rpf: RpfFile): Buffer {
    const fd = fs.openSync(rpf.filePath, 'r');
    try {
      const fileOffset = this.fileOffset * 512;
      const buffer = Buffer.alloc(this.fileSize);
      fs.readSync(fd, buffer, 0, this.fileSize, rpf.startPos + fileOffset);

      let result: Buffer = buffer;

      if (this.isEncrypted) {
        if (rpf.isAESEncrypted) {
          result = GTACrypto.decryptAES(result) as Buffer;
        } else if (rpf.isNGEncrypted) {
          result = GTACrypto.decryptNG(result, this.name, this.fileUncompressedSize) as Buffer;
        }
      }

      if (this.fileUncompressedSize > 0 && this.fileUncompressedSize !== this.fileSize) {
        result = zlib.inflateSync(result) as Buffer;
      }

      return result;
    } finally {
      fs.closeSync(fd);
    }
  }
}

export class RpfBinaryFileEntry extends RpfFileEntry {
  encryptionType: number = 0;

  read(data: DataView, offset: number): void {
    const d1 = data.getBigUint64(offset, true);
    const d2 = data.getBigUint64(offset + 8, true);

    this.nameOffset = Number((d1 >> 0n) & 0xFFFFn);
    this.fileSize = Number((d1 >> 16n) & 0xFFFFFFn);
    this.fileOffset = Number((d1 >> 40n) & 0xFFFFFFn);

    this.fileUncompressedSize = Number((d2 >> 0n) & 0xFFFFFFn);
    this.encryptionType = Number((d2 >> 24n) & 0xFFn);

    if ((d2 >> 32n) !== 0n) {
      throw new Error(`Invalid binary file entry`);
    }

    this.isEncrypted = this.encryptionType !== 0;
  }
}

export class RpfResourceFileEntry extends RpfFileEntry {
  systemFlags: number = 0;
  graphicsFlags: number = 0;

  read(data: DataView, offset: number): void {
    const d1 = data.getBigUint64(offset, true);
    const d2 = data.getBigUint64(offset + 8, true);

    this.nameOffset = Number((d1 >> 0n) & 0xFFFFn);
    this.fileSize = Number((d1 >> 16n) & 0xFFFFFFn);
    this.fileOffset = Number((d1 >> 40n) & 0xFFFFFFn);

    this.systemFlags = Number(d2 & 0xFFFFFFFFn);
    this.graphicsFlags = Number((d2 >> 32n) & 0xFFFFFFFFn);

    if (this.fileSize === 0xFFFFFF) {
      this.fileSize = this.getResourceSize();
      this.fileUncompressedSize = this.fileSize;
    }
  }

  private getResourceSize(): number {
    const baseSize = ((this.systemFlags >> 27) & 0x1) ? 0x10 : 0x0;
    const virtualSize = (this.systemFlags & 0x7FF) << ((this.systemFlags >> 11) & 0xF);
    const physicalSize = ((this.systemFlags >> 15) & 0x7F) << ((this.systemFlags >> 25) & 0xF);
    const virtualSizeGraphics = (this.graphicsFlags & 0x7FF) << ((this.graphicsFlags >> 11) & 0xF);
    const physicalSizeGraphics = ((this.graphicsFlags >> 15) & 0x7F) << ((this.graphicsFlags >> 25) & 0xF);

    return baseSize + virtualSize + physicalSize + virtualSizeGraphics + physicalSizeGraphics;
  }
}

export class RpfFile {
  filePath: string;
  fileName: string;
  nameUpper: string;
  fileSize: number = 0;
  startPos: number = 0;
  version: number = 0;
  encryption: RpfEncryption = RpfEncryption.NONE;
  entryCount: number = 0;
  namesLength: number = 0;
  isAESEncrypted: boolean = false;
  isNGEncrypted: boolean = false;
  allEntries: RpfEntry[] = [];
  root?: RpfDirectoryEntry;
  parent?: RpfFile;
  children: RpfFile[] = [];

  constructor(filePath: string, fileName: string, startPos: number = 0, parent?: RpfFile) {
    this.filePath = filePath;
    this.fileName = fileName;
    this.nameUpper = fileName.toUpperCase();
    this.startPos = startPos;
    this.parent = parent;

    try {
      const stats = fs.statSync(filePath);
      this.fileSize = stats.size;
    } catch (error) {
      console.error(`Error getting file size: ${error}`);
    }
  }

  async scanStructure(): Promise<void> {
    const fd = fs.openSync(this.filePath, 'r');

    try {
      const headerBuffer = Buffer.alloc(16);
      fs.readSync(fd, headerBuffer, 0, 16, this.startPos);

      const headerView = new DataView(headerBuffer.buffer);
      this.version = headerView.getUint32(0, true);
      this.entryCount = headerView.getUint32(4, true);
      this.namesLength = headerView.getUint32(8, true);
      this.encryption = headerView.getUint32(12, true);

      if (this.version !== 0x52504637) {
        throw new Error(`Invalid RPF version: ${this.version.toString(16)}`);
      }

      this.isAESEncrypted = this.encryption === RpfEncryption.AES;
      this.isNGEncrypted = this.encryption === RpfEncryption.NG;

      const entriesSize = this.entryCount * 16;
      const entriesBuffer = Buffer.alloc(entriesSize);
      fs.readSync(fd, entriesBuffer, 0, entriesSize, this.startPos + 16);

      const namesBuffer = Buffer.alloc(this.namesLength);
      fs.readSync(fd, namesBuffer, 0, this.namesLength, this.startPos + 16 + entriesSize);

      let decryptedEntries: Buffer = entriesBuffer;
      let decryptedNames: Buffer = namesBuffer;

      if (this.encryption === RpfEncryption.AES) {
        decryptedEntries = GTACrypto.decryptAES(entriesBuffer) as Buffer;
        decryptedNames = GTACrypto.decryptAES(namesBuffer) as Buffer;
      } else if (this.encryption === RpfEncryption.NG) {
        decryptedEntries = GTACrypto.decryptNG(entriesBuffer, this.fileName, this.fileSize) as Buffer;
        decryptedNames = GTACrypto.decryptNG(namesBuffer, this.fileName, this.fileSize) as Buffer;
      }

      this.parseEntries(decryptedEntries, decryptedNames);
      await this.scanNestedRpfs();

    } finally {
      fs.closeSync(fd);
    }
  }

  private parseEntries(entriesData: Buffer, namesData: Buffer): void {
    const entriesView = new DataView(entriesData.buffer);
    this.allEntries = [];

    for (let i = 0; i < this.entryCount; i++) {
      const offset = i * 16;
      const h2 = entriesView.getUint32(offset + 8, true);

      let entry: RpfEntry;

      if (h2 === 0x7FFFFF00) {
        entry = new RpfDirectoryEntry();
      } else if ((h2 & 0x80000000) === 0) {
        entry = new RpfBinaryFileEntry();
      } else {
        entry = new RpfResourceFileEntry();
      }

      entry.read(entriesView, offset);
      entry.name = this.readName(namesData, entry.nameOffset);
      entry.nameLower = entry.name.toLowerCase();
      entry.file = this;

      this.allEntries.push(entry);
    }

    this.buildHierarchy();
  }

  private readName(namesData: Buffer, offset: number): string {
    let end = offset;
    while (end < namesData.length && namesData[end] !== 0) {
      end++;
    }
    return namesData.toString('utf8', offset, end);
  }

  private buildHierarchy(): void {
    for (const entry of this.allEntries) {
      if (entry instanceof RpfDirectoryEntry) {
        const dir = entry;
        const startIdx = dir.entriesIndex;
        const endIdx = startIdx + dir.entriesCount;

        for (let i = startIdx; i < endIdx; i++) {
          const child = this.allEntries[i];
          child.parent = dir;

          if (child instanceof RpfDirectoryEntry) {
            dir.directories.push(child);
          } else if (child instanceof RpfFileEntry) {
            dir.files.push(child);
          }
        }
      }
    }

    if (this.allEntries.length > 0 && this.allEntries[0] instanceof RpfDirectoryEntry) {
      this.root = this.allEntries[0];
      this.root.path = this.filePath;
    }

    this.updatePaths(this.root);
  }

  private updatePaths(dir?: RpfDirectoryEntry, currentPath: string = ""): void {
    if (!dir) return;

    for (const subdir of dir.directories) {
      subdir.path = currentPath ? `${currentPath}\\${subdir.name}` : subdir.name;
      this.updatePaths(subdir, subdir.path);
    }

    for (const file of dir.files) {
      file.path = currentPath ? `${currentPath}\\${file.name}` : file.name;
    }
  }

  private async scanNestedRpfs(): Promise<void> {
    if (!this.root) return;

    const rpfFiles = this.findRpfFiles(this.root);

    for (const rpfEntry of rpfFiles) {
      if (rpfEntry instanceof RpfBinaryFileEntry) {
        const nestedRpf = new RpfFile(
          this.filePath,
          rpfEntry.name,
          rpfEntry.fileOffset * 512,
          this
        );

        try {
          await nestedRpf.scanStructure();
          this.children.push(nestedRpf);

          rpfEntry.file = nestedRpf;
        } catch (error) {
          console.error(`Failed to scan nested RPF ${rpfEntry.name}: ${error}`);
        }
      }
    }
  }

  private findRpfFiles(dir: RpfDirectoryEntry): RpfFileEntry[] {
    const rpfFiles: RpfFileEntry[] = [];

    for (const file of dir.files) {
      if (file.nameLower.endsWith('.rpf')) {
        rpfFiles.push(file);
      }
    }

    for (const subdir of dir.directories) {
      rpfFiles.push(...this.findRpfFiles(subdir));
    }

    return rpfFiles;
  }

  findEntry(entryPath: string): RpfEntry | undefined {
    const parts = entryPath.split(/[\/\\]/);
    let current: RpfEntry | undefined = this.root;

    for (const part of parts) {
      if (!current || !(current instanceof RpfDirectoryEntry)) {
        return undefined;
      }

      const lowerPart = part.toLowerCase();
      const currentDir = current as RpfDirectoryEntry;
      current = undefined;

      for (const dir of currentDir.directories) {
        if (dir.nameLower === lowerPart) {
          current = dir;
          break;
        }
      }

      if (!current) {
        for (const file of currentDir.files) {
          if (file.nameLower === lowerPart) {
            current = file;
            break;
          }
        }
      }
    }

    return current;
  }
}