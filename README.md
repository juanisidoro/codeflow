# CodeFlow MCP Server

MCP (Model Context Protocol) server for managing code flow documentation with Claude Code.

## Features

- **Generate flows**: Create `.cf` documentation files for your code
- **CRUD operations**: List, read, create, update, and delete flows
- **Code exploration**: List and read code files in your project
- **Undocumented detection**: Find code that needs documentation
- **Git-aware**: Shows current branch and commit info

---

## Installation

### Option 1: Install globally (recommended)

```bash
npm install -g codeflow-mcp
```

### Option 2: Use with npx (no install needed)

Just configure Claude Code to use `npx` (see below).

---

## Configuration for Claude Code

### Per-project configuration (recommended)

Create a `.mcp.json` file in your project root:

**macOS / Linux:**
```json
{
  "mcpServers": {
    "codeflow": {
      "command": "npx",
      "args": ["-y", "codeflow-mcp"]
    }
  }
}
```

**Windows:**
```json
{
  "mcpServers": {
    "codeflow": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "codeflow-mcp"]
    }
  }
}
```

This file can be committed to git - it works on any machine.

### Monorepo / Custom flows directory

If your flows are in a different location (e.g., monorepo with multiple projects), use the `CODEFLOW_FLOWS_DIR` environment variable:

```json
{
  "mcpServers": {
    "codeflow": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "codeflow-mcp"],
      "env": {
        "CODEFLOW_FLOWS_DIR": "backend/FCC/products"
      }
    }
  }
}
```

Example monorepo structure:
```
my-monorepo/
├── frontend/
├── backend/
│   └── FCC/
│       └── products/        ← Your flows here
│           ├── auth.cf
│           └── orders.cf
├── shared/
└── .mcp.json                ← Config points to backend/FCC/products
```

### Global configuration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "codeflow": {
      "command": "codeflow-mcp"
    }
  }
}
```

(Requires global installation first)

---

## Usage

After configuring, open Claude Code in your project and use natural language:

```
> Get project info

> List all flows

> What files don't have flows yet?

> Read src/orders/createOrder.ts and generate a flow following the spec

> Update create-order.cf with the changes I made to createOrder.ts
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `read_codeflow_spec` | Read the CodeFlow specifications |
| `list_flows` | List all `.cf` files in the project |
| `read_flow` | Read a specific flow file |
| `save_flow` | Create or update a `.cf` file |
| `save_analysis` | Save analysis for a flow |
| `delete_flow` | Delete a flow and its analysis |
| `list_code_files` | List code files in a directory |
| `read_code_file` | Read a code file |
| `scan_undocumented` | Find code without documentation |
| `get_project_info` | Get project information |

---

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
├── .mcp.json                         # MCP configuration
└── ...
```

---

## Specs Included

The MCP includes the CodeFlow specifications:

- `CODEFLOW_SPEC_v2.md` - Flow file format
- `CODEFLOW_ANALYSIS_SPEC_v1.md` - Analysis file format

These are automatically available via the `read_codeflow_spec` tool.

---

## Development

```bash
# Clone the repo
git clone https://github.com/juanisidoro/codeflow.git
cd codeflow

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start
```

---

## Links

- **npm**: https://www.npmjs.com/package/codeflow-mcp
- **GitHub**: https://github.com/juanisidoro/codeflow

## License

MIT
