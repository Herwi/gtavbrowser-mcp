#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { RpfManager } from './rpf-manager.js';

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

const args = process.argv.slice(2);

// Support both direct execution and npx with environment variable
let gtaPath = process.env.GTA_V_PATH || args[0];

if (!gtaPath) {
  console.error("Error: GTA V directory path is required");
  console.error("");
  console.error("Usage:");
  console.error("  Direct: mcp-server-gtavbrowser <gta-v-directory>");
  console.error("  NPX: npx @modelcontextprotocol/server-gtavbrowser <gta-v-directory>");
  console.error("  Environment: Set GTA_V_PATH environment variable");
  console.error("");
  console.error("Example:");
  console.error("  mcp-server-gtavbrowser \"C:\\Program Files\\Rockstar Games\\Grand Theft Auto V\"");
  console.error("");
  console.error("For Claude Desktop, add to config:");
  console.error("  \"gtavbrowser\": {");
  console.error("    \"command\": \"npx\",");
  console.error("    \"args\": [");
  console.error("      \"-y\",");
  console.error("      \"@modelcontextprotocol/server-gtavbrowser\",");
  console.error("      \"C:/Program Files/Rockstar Games/Grand Theft Auto V\"");
  console.error("    ]");
  console.error("  }");
  process.exit(1);
}
const rpfManager = new RpfManager();

const InitializeArgsSchema = z.object({
  path: z.string().optional().describe('Path to GTA V directory. If not provided, uses the path from command line arguments.')
});

const ListRpfArgsSchema = z.object({
  pattern: z.string().optional().describe('Optional pattern to filter RPF files')
});

const ListDirectoryArgsSchema = z.object({
  rpfPath: z.string().describe('Path to the RPF file relative to GTA V directory'),
  directoryPath: z.string().optional().default('').describe('Path within the RPF to list. Empty string for root.')
});

const ReadFileArgsSchema = z.object({
  rpfPath: z.string().describe('Path to the RPF file relative to GTA V directory'),
  filePath: z.string().describe('Path to the file within the RPF')
});

const GetFileInfoArgsSchema = z.object({
  rpfPath: z.string().describe('Path to the RPF file relative to GTA V directory'),
  filePath: z.string().describe('Path to the file or directory within the RPF')
});

const SearchFilesArgsSchema = z.object({
  pattern: z.string().describe('Search pattern (supports wildcards with *)')
});

const GetDirectoryTreeArgsSchema = z.object({
  rpfPath: z.string().describe('Path to the RPF file relative to GTA V directory'),
  directoryPath: z.string().optional().default('').describe('Starting directory path within the RPF'),
  maxDepth: z.number().optional().default(3).describe('Maximum depth to traverse')
});

const ExtractFileArgsSchema = z.object({
  rpfPath: z.string().describe('Path to the RPF file relative to GTA V directory'),
  filePath: z.string().describe('Path to the file within the RPF'),
  outputPath: z.string().describe('Local path to save the extracted file')
});

const server = new Server(
  {
    name: "gtavbrowser",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "initialize",
        description: "Initialize the GTA V browser with the game directory. Must be called before using other tools.",
        inputSchema: zodToJsonSchema(InitializeArgsSchema) as ToolInput,
      },
      {
        name: "list_rpf_files",
        description: "List all available RPF archive files in the GTA V directory",
        inputSchema: zodToJsonSchema(ListRpfArgsSchema) as ToolInput,
      },
      {
        name: "list_directory",
        description: "List contents of a directory within an RPF archive",
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "read_file",
        description: "Read the contents of a file from an RPF archive. Returns text content for text files or base64 for binary files.",
        inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
      },
      {
        name: "get_file_info",
        description: "Get detailed information about a file or directory in an RPF archive",
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
      },
      {
        name: "search_files",
        description: "Search for files across all RPF archives using a pattern",
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
      },
      {
        name: "get_directory_tree",
        description: "Get a tree structure of directories and files in an RPF archive",
        inputSchema: zodToJsonSchema(GetDirectoryTreeArgsSchema) as ToolInput,
      },
      {
        name: "extract_file",
        description: "Extract a file from an RPF archive to local filesystem",
        inputSchema: zodToJsonSchema(ExtractFileArgsSchema) as ToolInput,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "initialize": {
        const parsed = InitializeArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }

        const initPath = parsed.data.path || gtaPath;
        await rpfManager.init(initPath);

        const rpfCount = rpfManager.getRpfList().length;
        return {
          content: [{
            type: "text",
            text: `Successfully initialized GTA V browser at ${initPath}\nFound ${rpfCount} RPF archives`
          }],
        };
      }

      case "list_rpf_files": {
        if (!rpfManager.isInitialized()) {
          throw new Error("RPF manager not initialized. Call 'initialize' first.");
        }

        const parsed = ListRpfArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }

        let rpfList = rpfManager.getRpfList();

        if (parsed.data.pattern) {
          const pattern = parsed.data.pattern.toLowerCase();
          rpfList = rpfList.filter(rpf => rpf.toLowerCase().includes(pattern));
        }

        return {
          content: [{
            type: "text",
            text: rpfList.length > 0
              ? `Found ${rpfList.length} RPF files:\n${rpfList.join('\n')}`
              : "No RPF files found matching the criteria"
          }],
        };
      }

      case "list_directory": {
        if (!rpfManager.isInitialized()) {
          throw new Error("RPF manager not initialized. Call 'initialize' first.");
        }

        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }

        const contents = rpfManager.listDirectory(parsed.data.rpfPath, parsed.data.directoryPath);

        if (!contents) {
          throw new Error(`Directory not found: ${parsed.data.directoryPath} in ${parsed.data.rpfPath}`);
        }

        const output: string[] = [];

        if (contents.directories.length > 0) {
          output.push("Directories:");
          contents.directories.forEach(dir => output.push(`  [DIR] ${dir}`));
        }

        if (contents.files.length > 0) {
          if (output.length > 0) output.push("");
          output.push("Files:");
          contents.files.forEach(file => output.push(`  [FILE] ${file}`));
        }

        if (output.length === 0) {
          output.push("Empty directory");
        }

        return {
          content: [{
            type: "text",
            text: output.join('\n')
          }],
        };
      }

      case "read_file": {
        if (!rpfManager.isInitialized()) {
          throw new Error("RPF manager not initialized. Call 'initialize' first.");
        }

        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }

        const content = rpfManager.getFileContent(parsed.data.rpfPath, parsed.data.filePath);

        if (!content) {
          throw new Error(`File not found: ${parsed.data.filePath} in ${parsed.data.rpfPath}`);
        }

        const fileExt = parsed.data.filePath.split('.').pop()?.toLowerCase() || '';
        const textExtensions = ['txt', 'xml', 'meta', 'dat', 'gxt2', 'cfg', 'ini', 'ymt', 'ytyp', 'ymf'];

        if (textExtensions.includes(fileExt)) {
          try {
            const textContent = content.toString('utf-8');
            return {
              content: [{
                type: "text",
                text: textContent
              }],
            };
          } catch {
            return {
              content: [{
                type: "text",
                text: `Binary file (${content.length} bytes). Base64: ${content.toString('base64')}`
              }],
            };
          }
        } else {
          return {
            content: [{
              type: "text",
              text: `Binary file (${content.length} bytes). Base64: ${content.toString('base64')}`
            }],
          };
        }
      }

      case "get_file_info": {
        if (!rpfManager.isInitialized()) {
          throw new Error("RPF manager not initialized. Call 'initialize' first.");
        }

        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }

        const info = rpfManager.getFileInfo(parsed.data.rpfPath, parsed.data.filePath);

        if (!info) {
          throw new Error(`Entry not found: ${parsed.data.filePath} in ${parsed.data.rpfPath}`);
        }

        const output = [
          `Name: ${info.name}`,
          `Type: ${info.type}`,
          `Path: ${info.path}`,
          `RPF: ${info.rpfPath}`,
        ];

        if (info.type === 'file') {
          output.push(`Size: ${info.size} bytes`);
          if (info.compressedSize > 0 && info.compressedSize !== info.size) {
            output.push(`Uncompressed Size: ${info.compressedSize} bytes`);
          }
          output.push(`Encrypted: ${info.encrypted}`);
        }

        return {
          content: [{
            type: "text",
            text: output.join('\n')
          }],
        };
      }

      case "search_files": {
        if (!rpfManager.isInitialized()) {
          throw new Error("RPF manager not initialized. Call 'initialize' first.");
        }

        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }

        const results = rpfManager.searchFiles(parsed.data.pattern);

        if (results.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No files found matching pattern: ${parsed.data.pattern}`
            }],
          };
        }

        const output = [`Found ${results.length} matches:\n`];

        results.slice(0, 100).forEach(result => {
          output.push(`${result.rpfPath}:${result.entryPath}`);
        });

        if (results.length > 100) {
          output.push(`\n... and ${results.length - 100} more results`);
        }

        return {
          content: [{
            type: "text",
            text: output.join('\n')
          }],
        };
      }

      case "get_directory_tree": {
        if (!rpfManager.isInitialized()) {
          throw new Error("RPF manager not initialized. Call 'initialize' first.");
        }

        const parsed = GetDirectoryTreeArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }

        const tree = rpfManager.getDirectoryTree(
          parsed.data.rpfPath,
          parsed.data.directoryPath,
          parsed.data.maxDepth
        );

        if (!tree) {
          throw new Error(`Directory not found: ${parsed.data.directoryPath} in ${parsed.data.rpfPath}`);
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(tree, null, 2)
          }],
        };
      }

      case "extract_file": {
        if (!rpfManager.isInitialized()) {
          throw new Error("RPF manager not initialized. Call 'initialize' first.");
        }

        const parsed = ExtractFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }

        const content = rpfManager.getFileContent(parsed.data.rpfPath, parsed.data.filePath);

        if (!content) {
          throw new Error(`File not found: ${parsed.data.filePath} in ${parsed.data.rpfPath}`);
        }

        const fs = await import('fs/promises');
        const path = await import('path');

        const outputDir = path.dirname(parsed.data.outputPath);
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(parsed.data.outputPath, content);

        return {
          content: [{
            type: "text",
            text: `Successfully extracted ${parsed.data.filePath} to ${parsed.data.outputPath} (${content.length} bytes)`
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function runServer() {
  try {
    console.error("Initializing GTA V Browser MCP Server...");
    console.error(`GTA V Directory: ${gtaPath}`);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("GTA V Browser MCP Server running on stdio");
    console.error("Call 'initialize' to start browsing RPF archives");
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer();