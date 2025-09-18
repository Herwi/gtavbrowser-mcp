# GTA V Browser MCP Server

[![npm version](https://badge.fury.io/js/gtavbrowser-mcp.svg)](https://www.npmjs.com/package/gtavbrowser-mcp)

A Model Context Protocol (MCP) server for browsing and extracting files from Grand Theft Auto V's RPF archives. Based on CodeWalker's RPF handling implementation.

## Quick Start with Claude Desktop

Add to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "gtavbrowser": {
      "command": "npx",
      "args": [
        "-y",
        "gtavbrowser-mcp",
        "C:/Program Files/Rockstar Games/Grand Theft Auto V"
      ]
    }
  }
}
```

Replace the path with your actual GTA V installation directory.

## Features

- Browse RPF archives and nested RPF files
- List directory contents within RPF archives
- Read and extract files from RPF archives
- Search for files across all RPF archives
- Support for encrypted and compressed files
- Get detailed file information
- Generate directory tree structures

## Current Limitations

⚠️ **NG Encryption**: Most GTA V RPF files use NG (Next Generation) encryption which requires complex decryption keys and tables extracted from the GTA V executable. This MCP currently only supports:
- Unencrypted RPF files (OPEN encryption)
- AES-encrypted RPF files

NG-encrypted RPF files (which includes most official GTA V archives like `common.rpf`, `update.rpf`, and DLC archives) will be skipped with an error message. This significantly limits the current functionality until proper NG decryption is implemented.

## Installation

### Using NPX (Recommended)

No installation required! The server can be run directly with npx:

```bash
npx gtavbrowser-mcp "C:/Program Files/Rockstar Games/Grand Theft Auto V"
```

### Global Installation

```bash
npm install -g gtavbrowser-mcp
gtavbrowser-mcp "C:/Program Files/Rockstar Games/Grand Theft Auto V"
```

### Manual Installation

```bash
git clone https://github.com/Herwi/gtavbrowser-mcp.git
cd gtavbrowser-mcp
npm install
npm run build
```

## Usage

### With NPX

```bash
npx -y gtavbrowser-mcp "C:/Program Files/Rockstar Games/Grand Theft Auto V"
```

### Global Command

If installed globally:

```bash
gtavbrowser-mcp "C:/Program Files/Rockstar Games/Grand Theft Auto V"
```

### Direct Execution

```bash
node dist/index.js "C:/Program Files/Rockstar Games/Grand Theft Auto V"
```

### Environment Variable

You can also set the GTA V path via environment variable:

```bash
export GTA_V_PATH="C:/Program Files/Rockstar Games/Grand Theft Auto V"
gtavbrowser-mcp
```

### Available Tools

The server automatically initializes with the GTA V directory provided at startup, so all tools are immediately available without any initialization step.

#### 1. `list_rpf_files`
List all available RPF archive files in the GTA V directory.

**Parameters:**
- `pattern` (optional): Pattern to filter RPF files

#### 2. `list_directory`
List contents of a directory within an RPF archive.

**Parameters:**
- `rpfPath`: Path to the RPF file relative to GTA V directory
- `directoryPath` (optional): Path within the RPF to list. Empty string for root.

#### 3. `read_file`
Read the contents of a file from an RPF archive. Returns text content for text files or base64 for binary files.

**Parameters:**
- `rpfPath`: Path to the RPF file relative to GTA V directory
- `filePath`: Path to the file within the RPF

#### 4. `get_file_info`
Get detailed information about a file or directory in an RPF archive.

**Parameters:**
- `rpfPath`: Path to the RPF file relative to GTA V directory
- `filePath`: Path to the file or directory within the RPF

#### 5. `search_files`
Search for files across all RPF archives using a pattern.

**Parameters:**
- `pattern`: Search pattern (supports wildcards with *)

#### 6. `get_directory_tree`
Get a tree structure of directories and files in an RPF archive.

**Parameters:**
- `rpfPath`: Path to the RPF file relative to GTA V directory
- `directoryPath` (optional): Starting directory path within the RPF
- `maxDepth` (optional): Maximum depth to traverse (default: 3)

#### 7. `extract_file`
Extract a file from an RPF archive to local filesystem.

**Parameters:**
- `rpfPath`: Path to the RPF file relative to GTA V directory
- `filePath`: Path to the file within the RPF
- `outputPath`: Local path to save the extracted file

## Configuration

### Claude Desktop Configuration

The easiest way to use this server with Claude Desktop is through npx. Add to your Claude Desktop configuration file (usually located at `%APPDATA%/Claude/claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "gtavbrowser": {
      "command": "npx",
      "args": [
        "-y",
        "gtavbrowser-mcp",
        "C:/Program Files/Rockstar Games/Grand Theft Auto V"
      ]
    }
  }
}
```

### Alternative: Local Installation

If you prefer to run from a local installation:

```json
{
  "mcpServers": {
    "gtavbrowser": {
      "command": "node",
      "args": [
        "path/to/gtavbrowser/dist/index.js",
        "C:/Program Files/Rockstar Games/Grand Theft Auto V"
      ]
    }
  }
}
```

## Supported File Types

The server can handle various GTA V file types:
- **Text files**: `.txt`, `.xml`, `.meta`, `.dat`, `.gxt2`, `.cfg`, `.ini`
- **Game data**: `.ymt`, `.ytyp`, `.ymf`, `.ymap`, `.ybn`, `.ydd`, `.ydr`, `.yft`, `.ytd`
- **Binary files**: All other file types are returned as base64-encoded data

## RPF Archive Support

- **RPF7 format**: Full support for GTA V's RPF7 archive format
- **Encryption**: Supports AES and NG encryption methods
- **Compression**: Automatic decompression of compressed files
- **Nested RPFs**: Full support for RPF archives within RPF archives

## Technical Details

### Architecture

The server is built with:
- TypeScript for type safety
- MCP SDK for protocol implementation
- Node.js file system APIs for file operations
- Zod for schema validation

### RPF File Structure

RPF (RAGE Package File) archives consist of:
1. **Header**: Version, entry count, names length, encryption type
2. **Table of Contents**: Entry definitions (directories and files)
3. **Names Table**: String table for entry names
4. **File Data**: Actual file contents (potentially encrypted/compressed)

### Encryption Methods

- **NONE**: No encryption
- **OPEN**: OpenIV style with unencrypted TOC
- **AES**: AES-128 ECB encryption
- **NG**: Custom XOR-based encryption

## Development

### Building from Source

```bash
npm install
npm run build
```

### Watch Mode

```bash
npm run watch
```

## Credits

Based on the RPF handling implementation from [CodeWalker](https://github.com/dexyfex/CodeWalker) by dexyfex.

## License

MIT