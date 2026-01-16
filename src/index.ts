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
import * as jsonpatch from "fast-json-patch";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface FlowNode {
  id: string;
  type: string;
  label: string;
  phase?: string;
  data: Record<string, unknown>;
}

interface FlowPhase {
  id: string;
  name: string;
  description: string;
  nodes: string[];
  input?: string;
  output?: string;
  async?: boolean;
}

interface FlowSummary {
  input: string;
  output: string;
  purpose: string;
}

interface FlowMetadata {
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  changelog?: Array<{ date: string; changes: string }>;
  [key: string]: unknown;
}

interface Flow {
  version: string;
  id: string;
  name: string;
  summary: FlowSummary;
  phases: FlowPhase[];
  nodes: FlowNode[];
  edges?: Array<{ from: string; to: string; label?: string }>;
  contracts?: unknown[];
  links?: unknown[];
  metadata?: FlowMetadata;
}

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

function readFlow(filename: string): Flow {
  const flowPath = path.join(getFlowsPath(), filename.endsWith(".cf") ? filename : `${filename}.cf`);
  if (!fs.existsSync(flowPath)) {
    throw new Error(`Flujo no encontrado: ${filename}`);
  }
  return JSON.parse(fs.readFileSync(flowPath, "utf-8")) as Flow;
}

function writeFlow(filename: string, flow: Flow): void {
  const flowPath = path.join(getFlowsPath(), filename.endsWith(".cf") ? filename : `${filename}.cf`);
  ensureFlowsDir();
  fs.writeFileSync(flowPath, JSON.stringify(flow, null, 2), "utf-8");
}

interface ValidationError {
  path: string;
  message: string;
}

function validateFlow(flow: unknown): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const f = flow as Record<string, unknown>;

  // Required root fields
  if (!f.version || f.version !== "2.0") {
    errors.push({ path: "version", message: "Must be '2.0'" });
  }
  if (!f.id || typeof f.id !== "string") {
    errors.push({ path: "id", message: "Required string field" });
  }
  if (!f.name || typeof f.name !== "string") {
    errors.push({ path: "name", message: "Required string field" });
  }

  // Summary validation
  if (!f.summary || typeof f.summary !== "object") {
    errors.push({ path: "summary", message: "Required object" });
  } else {
    const summary = f.summary as Record<string, unknown>;
    if (!summary.input) errors.push({ path: "summary.input", message: "Required" });
    if (!summary.output) errors.push({ path: "summary.output", message: "Required" });
    if (!summary.purpose) errors.push({ path: "summary.purpose", message: "Required" });
  }

  // Phases validation
  if (!Array.isArray(f.phases)) {
    errors.push({ path: "phases", message: "Must be an array" });
  } else {
    const phaseIds = new Set<string>();
    (f.phases as FlowPhase[]).forEach((phase, i) => {
      if (!phase.id) errors.push({ path: `phases[${i}].id`, message: "Required" });
      if (phaseIds.has(phase.id)) errors.push({ path: `phases[${i}].id`, message: "Duplicate ID" });
      phaseIds.add(phase.id);
      if (!phase.name) errors.push({ path: `phases[${i}].name`, message: "Required" });
      if (!phase.description) errors.push({ path: `phases[${i}].description`, message: "Required" });
      if (!Array.isArray(phase.nodes)) errors.push({ path: `phases[${i}].nodes`, message: "Must be array" });
    });
  }

  // Nodes validation
  if (!Array.isArray(f.nodes)) {
    errors.push({ path: "nodes", message: "Must be an array" });
  } else {
    const nodeIds = new Set<string>();
    (f.nodes as FlowNode[]).forEach((node, i) => {
      if (!node.id) errors.push({ path: `nodes[${i}].id`, message: "Required" });
      if (nodeIds.has(node.id)) errors.push({ path: `nodes[${i}].id`, message: "Duplicate ID" });
      nodeIds.add(node.id);
      if (!node.type) errors.push({ path: `nodes[${i}].type`, message: "Required" });
      if (!node.label) errors.push({ path: `nodes[${i}].label`, message: "Required" });
      if (!node.data || typeof node.data !== "object") {
        errors.push({ path: `nodes[${i}].data`, message: "Required object" });
      }
    });

    // Verify all phase.nodes reference existing nodes
    if (Array.isArray(f.phases)) {
      (f.phases as FlowPhase[]).forEach((phase, pi) => {
        phase.nodes?.forEach((nodeId, ni) => {
          if (!nodeIds.has(nodeId)) {
            errors.push({ path: `phases[${pi}].nodes[${ni}]`, message: `Node '${nodeId}' not found` });
          }
        });
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (target[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
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
  // ===========================================================================
  // NEW PARTIAL UPDATE TOOLS (Token-efficient operations)
  // ===========================================================================
  {
    name: "get_node",
    description: `Lee un nodo específico de un flujo sin cargar todo el archivo.
Útil para inspeccionar un nodo antes de modificarlo.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf",
        },
        nodeId: {
          type: "string",
          description: "ID del nodo a leer (ej: 'n1', 'n2')",
        },
      },
      required: ["filename", "nodeId"],
    },
  },
  {
    name: "get_phase",
    description: `Lee una fase específica de un flujo sin cargar todo el archivo.
Incluye los IDs de nodos que pertenecen a la fase.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf",
        },
        phaseId: {
          type: "string",
          description: "ID de la fase a leer (ej: 'p1', 'p2')",
        },
        includeNodes: {
          type: "boolean",
          description: "Si true, incluye los datos completos de los nodos de la fase",
          default: false,
        },
      },
      required: ["filename", "phaseId"],
    },
  },
  {
    name: "update_node",
    description: `Actualiza parcialmente un nodo existente. Solo envía los campos a modificar.
Hace merge profundo con los datos existentes del nodo.
AHORRO: ~50 tokens vs ~600 de save_flow completo.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf",
        },
        nodeId: {
          type: "string",
          description: "ID del nodo a actualizar",
        },
        updates: {
          type: "object",
          description: "Campos a actualizar (ej: { label: 'New Label', data: { description: 'New desc' } })",
        },
      },
      required: ["filename", "nodeId", "updates"],
    },
  },
  {
    name: "add_node",
    description: `Añade un nuevo nodo a un flujo y opcionalmente lo asigna a una fase.
AHORRO: ~50 tokens vs ~600 de save_flow completo.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf",
        },
        node: {
          type: "object",
          description: "Datos del nuevo nodo (debe incluir id, type, label, data)",
        },
        phaseId: {
          type: "string",
          description: "ID de la fase donde añadir el nodo (opcional)",
        },
        afterNodeId: {
          type: "string",
          description: "Insertar después de este nodo en la fase (opcional, default: al final)",
        },
      },
      required: ["filename", "node"],
    },
  },
  {
    name: "delete_node",
    description: `Elimina un nodo de un flujo. También lo elimina de su fase y de cualquier edge.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf",
        },
        nodeId: {
          type: "string",
          description: "ID del nodo a eliminar",
        },
      },
      required: ["filename", "nodeId"],
    },
  },
  {
    name: "update_phase",
    description: `Actualiza parcialmente una fase existente. Solo envía los campos a modificar.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf",
        },
        phaseId: {
          type: "string",
          description: "ID de la fase a actualizar",
        },
        updates: {
          type: "object",
          description: "Campos a actualizar (ej: { name: 'New Name', description: 'New desc' })",
        },
      },
      required: ["filename", "phaseId", "updates"],
    },
  },
  {
    name: "update_metadata",
    description: `Actualiza solo la metadata del flujo sin tocar nodos ni fases.
Útil para actualizar autor, tags, changelog, etc.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf",
        },
        metadata: {
          type: "object",
          description: "Campos de metadata a actualizar/añadir",
        },
        appendChangelog: {
          type: "string",
          description: "Si se proporciona, añade una entrada al changelog con esta descripción",
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "patch_flow",
    description: `Aplica operaciones JSON Patch (RFC 6902) al flujo.
Permite múltiples cambios atómicos en una sola operación.
Operaciones soportadas: add, remove, replace, move, copy, test.
MÁXIMO AHORRO: Envía solo las operaciones, no todo el JSON.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf",
        },
        operations: {
          type: "array",
          description: `Array de operaciones JSON Patch. Ejemplo:
[
  { "op": "replace", "path": "/nodes/0/label", "value": "New Label" },
  { "op": "add", "path": "/nodes/-", "value": { "id": "n99", ... } },
  { "op": "remove", "path": "/nodes/2" }
]`,
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "remove", "replace", "move", "copy", "test"] },
              path: { type: "string" },
              value: {},
              from: { type: "string" },
            },
            required: ["op", "path"],
          },
        },
      },
      required: ["filename", "operations"],
    },
  },
  {
    name: "validate_flow",
    description: `Valida un flujo contra la especificación CODEFLOW_SPEC_v2.
Puede validar un archivo existente o contenido JSON proporcionado.
Útil para verificar antes de guardar.`,
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Nombre del archivo .cf a validar (mutuamente excluyente con content)",
        },
        content: {
          type: "string",
          description: "Contenido JSON a validar (mutuamente excluyente con filename)",
        },
      },
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

    // =========================================================================
    // NEW PARTIAL UPDATE HANDLERS
    // =========================================================================

    // -------------------------------------------------------------------------
    case "get_node": {
      const filename = args.filename as string;
      const nodeId = args.nodeId as string;

      const flow = readFlow(filename);
      const node = flow.nodes.find((n) => n.id === nodeId);

      if (!node) {
        throw new Error(`Nodo '${nodeId}' no encontrado en ${filename}`);
      }

      // Find which phase this node belongs to
      const phase = flow.phases.find((p) => p.nodes.includes(nodeId));

      return JSON.stringify({
        node,
        phase: phase ? { id: phase.id, name: phase.name } : null,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "get_phase": {
      const filename = args.filename as string;
      const phaseId = args.phaseId as string;
      const includeNodes = args.includeNodes as boolean;

      const flow = readFlow(filename);
      const phase = flow.phases.find((p) => p.id === phaseId);

      if (!phase) {
        throw new Error(`Fase '${phaseId}' no encontrada en ${filename}`);
      }

      const result: { phase: FlowPhase; nodes?: FlowNode[] } = { phase };

      if (includeNodes) {
        result.nodes = flow.nodes.filter((n) => phase.nodes.includes(n.id));
      }

      return JSON.stringify(result, null, 2);
    }

    // -------------------------------------------------------------------------
    case "update_node": {
      const filename = args.filename as string;
      const nodeId = args.nodeId as string;
      const updates = args.updates as Record<string, unknown>;

      const flow = readFlow(filename);
      const nodeIndex = flow.nodes.findIndex((n) => n.id === nodeId);

      if (nodeIndex === -1) {
        throw new Error(`Nodo '${nodeId}' no encontrado en ${filename}`);
      }

      // Deep merge updates into existing node
      const existingNode = flow.nodes[nodeIndex];
      flow.nodes[nodeIndex] = deepMerge(
        existingNode as unknown as Record<string, unknown>,
        updates
      ) as unknown as FlowNode;

      // Preserve the ID (cannot be changed)
      flow.nodes[nodeIndex].id = nodeId;

      writeFlow(filename, flow);

      return JSON.stringify({
        success: true,
        nodeId,
        updated: Object.keys(updates),
        node: flow.nodes[nodeIndex],
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "add_node": {
      const filename = args.filename as string;
      const node = args.node as FlowNode;
      const phaseId = args.phaseId as string | undefined;
      const afterNodeId = args.afterNodeId as string | undefined;

      // Validate node has required fields
      if (!node.id || !node.type || !node.label || !node.data) {
        throw new Error("El nodo debe tener: id, type, label, data");
      }

      const flow = readFlow(filename);

      // Check for duplicate ID
      if (flow.nodes.some((n) => n.id === node.id)) {
        throw new Error(`Ya existe un nodo con id '${node.id}'`);
      }

      // Add node to nodes array
      flow.nodes.push(node);

      // Add to phase if specified
      if (phaseId) {
        const phase = flow.phases.find((p) => p.id === phaseId);
        if (!phase) {
          throw new Error(`Fase '${phaseId}' no encontrada`);
        }

        if (afterNodeId) {
          const afterIndex = phase.nodes.indexOf(afterNodeId);
          if (afterIndex === -1) {
            throw new Error(`Nodo '${afterNodeId}' no encontrado en fase '${phaseId}'`);
          }
          phase.nodes.splice(afterIndex + 1, 0, node.id);
        } else {
          phase.nodes.push(node.id);
        }

        // Set phase reference in node
        node.phase = phaseId;
      }

      writeFlow(filename, flow);

      return JSON.stringify({
        success: true,
        action: "added",
        nodeId: node.id,
        phase: phaseId || null,
        totalNodes: flow.nodes.length,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "delete_node": {
      const filename = args.filename as string;
      const nodeId = args.nodeId as string;

      const flow = readFlow(filename);
      const nodeIndex = flow.nodes.findIndex((n) => n.id === nodeId);

      if (nodeIndex === -1) {
        throw new Error(`Nodo '${nodeId}' no encontrado en ${filename}`);
      }

      // Remove from nodes array
      flow.nodes.splice(nodeIndex, 1);

      // Remove from any phases
      for (const phase of flow.phases) {
        const idx = phase.nodes.indexOf(nodeId);
        if (idx !== -1) {
          phase.nodes.splice(idx, 1);
        }
      }

      // Remove from edges
      if (flow.edges) {
        flow.edges = flow.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
      }

      writeFlow(filename, flow);

      return JSON.stringify({
        success: true,
        deletedNode: nodeId,
        remainingNodes: flow.nodes.length,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "update_phase": {
      const filename = args.filename as string;
      const phaseId = args.phaseId as string;
      const updates = args.updates as Record<string, unknown>;

      const flow = readFlow(filename);
      const phaseIndex = flow.phases.findIndex((p) => p.id === phaseId);

      if (phaseIndex === -1) {
        throw new Error(`Fase '${phaseId}' no encontrada en ${filename}`);
      }

      // Merge updates into existing phase
      const existingPhase = flow.phases[phaseIndex];
      flow.phases[phaseIndex] = {
        ...existingPhase,
        ...updates,
        id: phaseId, // Preserve ID
      } as FlowPhase;

      writeFlow(filename, flow);

      return JSON.stringify({
        success: true,
        phaseId,
        updated: Object.keys(updates),
        phase: flow.phases[phaseIndex],
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "update_metadata": {
      const filename = args.filename as string;
      const metadata = (args.metadata as Record<string, unknown>) || {};
      const appendChangelog = args.appendChangelog as string | undefined;

      const flow = readFlow(filename);

      // Initialize metadata if not exists
      if (!flow.metadata) {
        flow.metadata = {};
      }

      // Merge new metadata
      flow.metadata = { ...flow.metadata, ...metadata };

      // Update timestamp
      flow.metadata.updatedAt = new Date().toISOString();

      // Append to changelog if requested
      if (appendChangelog) {
        if (!flow.metadata.changelog) {
          flow.metadata.changelog = [];
        }
        flow.metadata.changelog.push({
          date: new Date().toISOString().split("T")[0],
          changes: appendChangelog,
        });
      }

      writeFlow(filename, flow);

      return JSON.stringify({
        success: true,
        metadata: flow.metadata,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "patch_flow": {
      const filename = args.filename as string;
      const operations = args.operations as jsonpatch.Operation[];

      const flow = readFlow(filename);

      // Validate operations before applying
      const validationResult = jsonpatch.validate(operations, flow);
      if (validationResult) {
        throw new Error(`Operación inválida en índice ${validationResult.index}: ${validationResult.message}`);
      }

      // Apply the patch
      const patchedFlow = jsonpatch.applyPatch(flow, operations, true, false).newDocument;

      // Validate the result
      const flowValidation = validateFlow(patchedFlow);
      if (!flowValidation.valid) {
        throw new Error(`El flujo resultante es inválido:\n${flowValidation.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n")}`);
      }

      writeFlow(filename, patchedFlow as Flow);

      return JSON.stringify({
        success: true,
        operationsApplied: operations.length,
        filename,
      }, null, 2);
    }

    // -------------------------------------------------------------------------
    case "validate_flow": {
      const filename = args.filename as string | undefined;
      const content = args.content as string | undefined;

      let flowData: unknown;

      if (filename) {
        flowData = readFlow(filename);
      } else if (content) {
        try {
          flowData = JSON.parse(content);
        } catch (e) {
          return JSON.stringify({
            valid: false,
            errors: [{ path: "root", message: `JSON inválido: ${e}` }],
          }, null, 2);
        }
      } else {
        throw new Error("Debes proporcionar 'filename' o 'content'");
      }

      const result = validateFlow(flowData);

      return JSON.stringify({
        valid: result.valid,
        errors: result.errors,
        summary: result.valid
          ? "El flujo es válido según CODEFLOW_SPEC_v2"
          : `Encontrados ${result.errors.length} errores de validación`,
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
    version: "2.0.0",
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
