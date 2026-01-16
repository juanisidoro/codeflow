#!/usr/bin/env node

/**
 * CodeFlow MCP Server
 *
 * Provides tools for Claude Code to generate, read, update, and manage
 * code flow documentation (.cf files) in any project.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Get the directory where the MCP is installed (for specs)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPECS_DIR = path.join(__dirname, "..", "specs");

// Project path from environment or current working directory
const PROJECT_PATH = process.env.CODEFLOW_PROJECT_PATH || process.cwd();
const FLOWS_DIR = process.env.CODEFLOW_FLOWS_DIR || "flows";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getFlowsPath(): string {
  return path.join(PROJECT_PATH, FLOWS_DIR);
}

function ensureFlowsDir(): void {
  const flowsPath = getFlowsPath();
  if (!fs.existsSync(flowsPath)) {
    fs.mkdirSync(flowsPath, { recursive: true });
  }
}

function findFiles(dir: string, extensions: string[], recursive = true): string[] {
  if (!fs.existsSync(dir)) return [];

  const results: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    // Skip common non-code directories
    if (item.isDirectory()) {
      if (["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv"].includes(item.name)) {
        continue;
      }
      if (recursive) {
        results.push(...findFiles(fullPath, extensions, recursive));
      }
    } else if (extensions.some((ext) => item.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }

  return results;
}

function getRelativePath(absolutePath: string): string {
  return path.relative(PROJECT_PATH, absolutePath).replace(/\\/g, "/");
}

function readFileContent(filePath: string): string {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_PATH, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(fullPath, "utf-8");
}

function getGitInfo(): { branch: string | null; lastCommit: string | null } {
  try {
    const gitDir = path.join(PROJECT_PATH, ".git");
    if (!fs.existsSync(gitDir)) {
      return { branch: null, lastCommit: null };
    }

    // Read current branch
    const headPath = path.join(gitDir, "HEAD");
    const headContent = fs.readFileSync(headPath, "utf-8").trim();
    let branch: string | null = null;

    if (headContent.startsWith("ref: refs/heads/")) {
      branch = headContent.replace("ref: refs/heads/", "");
    }

    // Try to get last commit
    let lastCommit: string | null = null;
    if (branch) {
      const refPath = path.join(gitDir, "refs", "heads", branch);
      if (fs.existsSync(refPath)) {
        lastCommit = fs.readFileSync(refPath, "utf-8").trim().substring(0, 7);
      }
    }

    return { branch, lastCommit };
  } catch {
    return { branch: null, lastCommit: null };
  }
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS: Tool[] = [
  {
    name: "read_codeflow_spec",
    description: `Lee las especificaciones de CodeFlow (CODEFLOW_SPEC_v2.md y CODEFLOW_ANALYSIS_SPEC_v1.md).
Usa esto SIEMPRE antes de generar o modificar flujos para asegurarte de seguir el formato correcto.`,
    inputSchema: {
      type: "object",
      properties: {
        spec: {
          type: "string",
          enum: ["flow", "analysis", "both"],
          description: "Qué spec leer: 'flow' para CODEFLOW_SPEC_v2, 'analysis' para ANALYSIS_SPEC, 'both' para ambas",
          default: "both",
        },
      },
    },
  },
  {
    name: "list_flows",
    description: `Lista todos los flujos .cf existentes en el proyecto.
Muestra nombre, descripción y si tiene archivo de análisis asociado.`,
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "read_flow",
    description: `Lee el contenido completo de un flujo .cf específico.
También puede leer el archivo de análisis asociado si existe.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf (ej: 'create-order.cf')",
        },
        includeAnalysis: {
          type: "boolean",
          description: "Si también leer el archivo .cf-analysis.json asociado",
          default: false,
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "save_flow",
    description: `Guarda un flujo .cf en el proyecto. Crea el archivo si no existe o lo actualiza si existe.
El contenido debe ser JSON válido siguiendo CODEFLOW_SPEC_v2.
Los flujos se guardan en la carpeta 'flows/' del proyecto.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo (ej: 'create-order.cf'). Se agregará .cf si no lo tiene.",
        },
        content: {
          type: "string",
          description: "Contenido JSON del flujo (debe seguir CODEFLOW_SPEC_v2)",
        },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "save_analysis",
    description: `Guarda un archivo de análisis .cf-analysis.json para un flujo existente.
El contenido debe ser JSON válido siguiendo CODEFLOW_ANALYSIS_SPEC_v1.`,
    inputSchema: {
      type: "object",
      properties: {
        flowFilename: {
          type: "string",
          description: "Nombre del archivo de flujo al que pertenece (ej: 'create-order.cf')",
        },
        content: {
          type: "string",
          description: "Contenido JSON del análisis (debe seguir CODEFLOW_ANALYSIS_SPEC_v1)",
        },
      },
      required: ["flowFilename", "content"],
    },
  },
  {
    name: "delete_flow",
    description: `Elimina un flujo .cf del proyecto. También elimina el archivo de análisis asociado si existe.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf a eliminar",
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "list_code_files",
    description: `Lista archivos de código en un directorio del proyecto.
Útil para explorar el proyecto y encontrar archivos que necesitan documentación.`,
    inputSchema: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Directorio a explorar (relativo al proyecto). Default: 'src'",
          default: "src",
        },
        extensions: {
          type: "array",
          items: { type: "string" },
          description: "Extensiones a buscar (ej: ['.ts', '.js']). Default: ['.ts', '.tsx', '.js', '.jsx']",
        },
        recursive: {
          type: "boolean",
          description: "Buscar recursivamente en subdirectorios",
          default: true,
        },
      },
    },
  },
  {
    name: "read_code_file",
    description: `Lee el contenido de un archivo de código del proyecto.
Usa esto para analizar el código y generar flujos apropiados.`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Ruta al archivo (relativa al proyecto o absoluta)",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "scan_undocumented",
    description: `Escanea el proyecto para encontrar archivos de código que no tienen un flujo .cf asociado.
Útil para identificar qué código necesita documentación.`,
    inputSchema: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Directorio a escanear. Default: 'src'",
          default: "src",
        },
        extensions: {
          type: "array",
          items: { type: "string" },
          description: "Extensiones de código a buscar",
        },
      },
    },
  },
  {
    name: "get_project_info",
    description: `Obtiene información general del proyecto: ruta, branch de Git actual, último commit,
cantidad de flujos, etc. Útil para contexto inicial.`,
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// =============================================================================
// TOOL HANDLERS
// =============================================================================

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    // -------------------------------------------------------------------------
    case "read_codeflow_spec": {
      const specType = (args.spec as string) || "both";
      let result = "";

      if (specType === "flow" || specType === "both") {
        const flowSpecPath = path.join(SPECS_DIR, "CODEFLOW_SPEC_v2.md");
        if (fs.existsSync(flowSpecPath)) {
          result += "# CODEFLOW_SPEC_v2.md\n\n";
          result += fs.readFileSync(flowSpecPath, "utf-8");
          result += "\n\n";
        } else {
          result += "⚠️ CODEFLOW_SPEC_v2.md no encontrado en el MCP\n\n";
        }
      }

      if (specType === "analysis" || specType === "both") {
        const analysisSpecPath = path.join(SPECS_DIR, "CODEFLOW_ANALYSIS_SPEC_v1.md");
        if (fs.existsSync(analysisSpecPath)) {
          result += "# CODEFLOW_ANALYSIS_SPEC_v1.md\n\n";
          result += fs.readFileSync(analysisSpecPath, "utf-8");
        } else {
          result += "⚠️ CODEFLOW_ANALYSIS_SPEC_v1.md no encontrado en el MCP\n\n";
        }
      }

      return result || "No se encontraron especificaciones";
    }

    // -------------------------------------------------------------------------
    case "list_flows": {
      const flowsPath = getFlowsPath();
      if (!fs.existsSync(flowsPath)) {
        return JSON.stringify({
          message: `No existe el directorio de flujos: ${FLOWS_DIR}/`,
          flows: [],
          hint: "Usa save_flow para crear el primer flujo",
        }, null, 2);
      }

      const cfFiles = findFiles(flowsPath, [".cf"], false);
      const flows = cfFiles.map((file) => {
        const filename = path.basename(file);
        const analysisFile = file.replace(".cf", ".cf-analysis.json");
        const hasAnalysis = fs.existsSync(analysisFile);

        let flowData: { name?: string; description?: string } = {};
        try {
          const content = fs.readFileSync(file, "utf-8");
          flowData = JSON.parse(content);
        } catch {
          // Ignore parse errors
        }

        return {
          filename,
          name: flowData.name || filename,
          description: flowData.description || "",
          hasAnalysis,
          path: getRelativePath(file),
        };
      });

      return JSON.stringify({
        flowsDirectory: FLOWS_DIR,
        count: flows.length,
        flows,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "read_flow": {
      const filename = args.filename as string;
      const includeAnalysis = args.includeAnalysis as boolean;

      const flowPath = path.join(getFlowsPath(), filename.endsWith(".cf") ? filename : `${filename}.cf`);

      if (!fs.existsSync(flowPath)) {
        throw new Error(`Flujo no encontrado: ${filename}`);
      }

      const flowContent = fs.readFileSync(flowPath, "utf-8");
      const result: { flow: unknown; analysis?: unknown } = {
        flow: JSON.parse(flowContent),
      };

      if (includeAnalysis) {
        const analysisPath = flowPath.replace(".cf", ".cf-analysis.json");
        if (fs.existsSync(analysisPath)) {
          result.analysis = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
        }
      }

      return JSON.stringify(result, null, 2);
    }

    // -------------------------------------------------------------------------
    case "save_flow": {
      let filename = args.filename as string;
      const content = args.content as string;

      // Ensure .cf extension
      if (!filename.endsWith(".cf")) {
        filename = `${filename}.cf`;
      }

      // Validate JSON
      let flowData: unknown;
      try {
        flowData = JSON.parse(content);
      } catch (e) {
        throw new Error(`Contenido JSON inválido: ${e}`);
      }

      // Ensure flows directory exists
      ensureFlowsDir();

      const flowPath = path.join(getFlowsPath(), filename);
      const isUpdate = fs.existsSync(flowPath);

      // Write the file
      fs.writeFileSync(flowPath, JSON.stringify(flowData, null, 2), "utf-8");

      return JSON.stringify({
        success: true,
        action: isUpdate ? "updated" : "created",
        path: getRelativePath(flowPath),
        filename,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "save_analysis": {
      let flowFilename = args.flowFilename as string;
      const content = args.content as string;

      // Ensure .cf extension
      if (!flowFilename.endsWith(".cf")) {
        flowFilename = `${flowFilename}.cf`;
      }

      const flowPath = path.join(getFlowsPath(), flowFilename);
      if (!fs.existsSync(flowPath)) {
        throw new Error(`Flujo no encontrado: ${flowFilename}. Crea el flujo primero.`);
      }

      // Validate JSON
      let analysisData: unknown;
      try {
        analysisData = JSON.parse(content);
      } catch (e) {
        throw new Error(`Contenido JSON inválido: ${e}`);
      }

      const analysisPath = flowPath.replace(".cf", ".cf-analysis.json");
      const isUpdate = fs.existsSync(analysisPath);

      fs.writeFileSync(analysisPath, JSON.stringify(analysisData, null, 2), "utf-8");

      return JSON.stringify({
        success: true,
        action: isUpdate ? "updated" : "created",
        path: getRelativePath(analysisPath),
        forFlow: flowFilename,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "delete_flow": {
      const filename = args.filename as string;
      const flowPath = path.join(getFlowsPath(), filename.endsWith(".cf") ? filename : `${filename}.cf`);

      if (!fs.existsSync(flowPath)) {
        throw new Error(`Flujo no encontrado: ${filename}`);
      }

      // Delete flow file
      fs.unlinkSync(flowPath);

      // Delete analysis if exists
      const analysisPath = flowPath.replace(".cf", ".cf-analysis.json");
      let deletedAnalysis = false;
      if (fs.existsSync(analysisPath)) {
        fs.unlinkSync(analysisPath);
        deletedAnalysis = true;
      }

      return JSON.stringify({
        success: true,
        deletedFlow: filename,
        deletedAnalysis,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "list_code_files": {
      const directory = (args.directory as string) || "src";
      const extensions = (args.extensions as string[]) || [".ts", ".tsx", ".js", ".jsx"];
      const recursive = args.recursive !== false;

      const dirPath = path.join(PROJECT_PATH, directory);
      if (!fs.existsSync(dirPath)) {
        return JSON.stringify({
          error: `Directorio no encontrado: ${directory}`,
          searchedPath: dirPath,
        }, null, 2);
      }

      const files = findFiles(dirPath, extensions, recursive);
      const relativePaths = files.map(getRelativePath);

      return JSON.stringify({
        directory,
        extensions,
        count: files.length,
        files: relativePaths,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "read_code_file": {
      const filePath = args.filePath as string;
      const content = readFileContent(filePath);

      return `// File: ${filePath}\n// Lines: ${content.split("\n").length}\n\n${content}`;
    }

    // -------------------------------------------------------------------------
    case "scan_undocumented": {
      const directory = (args.directory as string) || "src";
      const extensions = (args.extensions as string[]) || [".ts", ".tsx", ".js", ".jsx"];

      // Get all code files
      const dirPath = path.join(PROJECT_PATH, directory);
      if (!fs.existsSync(dirPath)) {
        return JSON.stringify({
          error: `Directorio no encontrado: ${directory}`,
        }, null, 2);
      }

      const codeFiles = findFiles(dirPath, extensions, true).map(getRelativePath);

      // Get all flows
      const flowsPath = getFlowsPath();
      const flowFiles = fs.existsSync(flowsPath) ? findFiles(flowsPath, [".cf"], false) : [];

      // Extract documented file references from flows
      const documentedPatterns: string[] = [];
      for (const flowFile of flowFiles) {
        try {
          const content = JSON.parse(fs.readFileSync(flowFile, "utf-8"));
          // Check codeReferences in all phases/steps
          if (content.phases) {
            for (const phase of content.phases) {
              if (phase.steps) {
                for (const step of phase.steps) {
                  if (step.codeReferences) {
                    for (const ref of step.codeReferences) {
                      if (ref.file) {
                        documentedPatterns.push(ref.file);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Also consider flow names as patterns
      for (const flowFile of flowFiles) {
        const name = path.basename(flowFile, ".cf").toLowerCase();
        documentedPatterns.push(name);
      }

      // Find undocumented files
      const undocumented = codeFiles.filter((file) => {
        const fileName = path.basename(file, path.extname(file)).toLowerCase();
        const fileLower = file.toLowerCase();

        // Check if any pattern matches
        return !documentedPatterns.some((pattern) => {
          const patternLower = pattern.toLowerCase();
          return fileLower.includes(patternLower) || fileName.includes(patternLower);
        });
      });

      // Prioritize by likely importance
      const prioritized = undocumented.sort((a, b) => {
        // Services, controllers, handlers first
        const importantPatterns = ["service", "controller", "handler", "use-case", "usecase"];
        const aImportant = importantPatterns.some((p) => a.toLowerCase().includes(p));
        const bImportant = importantPatterns.some((p) => b.toLowerCase().includes(p));

        if (aImportant && !bImportant) return -1;
        if (!aImportant && bImportant) return 1;
        return a.localeCompare(b);
      });

      return JSON.stringify({
        scannedDirectory: directory,
        totalCodeFiles: codeFiles.length,
        existingFlows: flowFiles.length,
        undocumentedCount: undocumented.length,
        undocumented: prioritized.slice(0, 20), // Limit to top 20
        hint: undocumented.length > 20
          ? `Mostrando los 20 más importantes de ${undocumented.length} total`
          : undefined,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "get_project_info": {
      const gitInfo = getGitInfo();
      const flowsPath = getFlowsPath();
      const flowsExist = fs.existsSync(flowsPath);
      const flowCount = flowsExist ? findFiles(flowsPath, [".cf"], false).length : 0;

      // Check for specs in project
      const hasLocalSpec = fs.existsSync(path.join(PROJECT_PATH, "CODEFLOW_SPEC_v2.md"));
      const hasLocalAnalysisSpec = fs.existsSync(path.join(PROJECT_PATH, "CODEFLOW_ANALYSIS_SPEC_v1.md"));

      return JSON.stringify({
        projectPath: PROJECT_PATH,
        flowsDirectory: FLOWS_DIR,
        flowsExist,
        flowCount,
        git: {
          isRepo: gitInfo.branch !== null,
          branch: gitInfo.branch,
          lastCommit: gitInfo.lastCommit,
        },
        specs: {
          hasLocalFlowSpec: hasLocalSpec,
          hasLocalAnalysisSpec: hasLocalAnalysisSpec,
          mcpSpecsAvailable: true,
        },
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// =============================================================================
// SERVER SETUP
// =============================================================================

const server = new Server(
  {
    name: "codeflow-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleToolCall(name, (args as Record<string, unknown>) || {});
    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CodeFlow MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
