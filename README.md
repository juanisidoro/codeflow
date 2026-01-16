# CodeFlow MCP Server

MCP (Model Context Protocol) server for managing code flow documentation with Claude Code.

## Features

- **Generate flows**: Create `.cf` documentation files for your code
- **CRUD operations**: List, read, create, update, and delete flows
- **Code exploration**: List and read code files in your project
- **Undocumented detection**: Find code that needs documentation
- **Git-aware**: Shows current branch and commit info

## Installation

```bash
# Clone or download
git clone https://github.com/your-username/codeflow-mcp.git
cd codeflow-mcp

# Install dependencies
npm install

# Build
npm run build
```

## Configuration

Add to your Claude Code settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "codeflow": {
      "command": "node",
      "args": ["/path/to/codeflow-mcp/dist/index.js"],
      "env": {
        "CODEFLOW_PROJECT_PATH": "/path/to/your/project",
        "CODEFLOW_FLOWS_DIR": "flows"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEFLOW_PROJECT_PATH` | Path to your project | Current working directory |
| `CODEFLOW_FLOWS_DIR` | Directory for `.cf` files | `flows` |

## Available Tools

### `read_codeflow_spec`
Read the CodeFlow specifications to understand the format.

```
"Lee la spec de codeflow para saber cómo generar flujos"
```

### `list_flows`
List all existing `.cf` files in the project.

```
"Lista todos los flujos que tengo"
```

### `read_flow`
Read a specific flow file.

```
"Lee el flujo create-order.cf"
```

### `save_flow`
Create or update a flow file.

```
"Guarda este flujo como process-payment.cf: {...}"
```

### `save_analysis`
Save an analysis file for an existing flow.

```
"Genera el análisis para create-order.cf"
```

### `delete_flow`
Delete a flow and its analysis.

```
"Elimina el flujo old-flow.cf"
```

### `list_code_files`
List code files in a directory.

```
"Lista los archivos en src/services"
```

### `read_code_file`
Read a code file to analyze.

```
"Lee src/orders/createOrder.ts"
```

### `scan_undocumented`
Find code files without documentation.

```
"¿Qué archivos no tienen flujo todavía?"
```

### `get_project_info`
Get general project information.

```
"Dame info del proyecto"
```

## Usage Examples

### Generate a new flow

```
> Lee src/orders/createOrder.ts y genera un flujo siguiendo la spec

Claude will:
1. Read the spec
2. Read the code file
3. Generate a .cf file
4. Save it to flows/
```

### Update existing flow after code changes

```
> Actualiza create-order.cf con los cambios que hice en createOrder.ts

Claude will:
1. Read the current flow
2. Read the updated code
3. Detect differences
4. Update the flow
```

### Find undocumented code

```
> ¿Qué archivos importantes no tienen flujo?

Claude will scan and prioritize files that likely need documentation.
```

## Flow File Structure

Flows are saved in `{project}/flows/`:

```
your-project/
├── src/
│   └── orders/
│       └── createOrder.ts
├── flows/
│   ├── create-order.cf              # Flow documentation
│   └── create-order.cf-analysis.json # Analysis (optional)
└── ...
```

## Specs Included

The MCP includes the CodeFlow specifications:

- `specs/CODEFLOW_SPEC_v2.md` - Flow file format
- `specs/CODEFLOW_ANALYSIS_SPEC_v1.md` - Analysis file format

## Development

```bash
# Watch mode
npm run dev

# Build
npm run build

# Run directly
npm start
```

## License

MIT
