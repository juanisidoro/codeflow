# CodeFlow MCP Server

MCP (Model Context Protocol) server for managing code flow documentation with Claude Code.

## Features

- **Generate flows**: Create `.cf` documentation files for your code
- **CRUD operations**: List, read, create, update, and delete flows
- **Partial updates**: Update nodes, phases, and metadata individually (saves ~85% tokens)
- **JSON Patch support**: RFC 6902 compliant patch operations for complex changes
- **Validation**: Validate flows against CODEFLOW_SPEC_v2 before saving
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

### Core Operations

| Tool | Description |
|------|-------------|
| `read_codeflow_spec` | Read the CodeFlow specifications |
| `list_flows` | List all `.cf` files in the project |
| `read_flow` | Read a specific flow file |
| `save_flow` | Create or update a `.cf` file |
| `save_analysis` | Save analysis for a flow |
| `delete_flow` | Delete a flow and its analysis |
| `get_project_info` | Get project information |

### Partial Updates (Token-Efficient) ✨ NEW in v2.0

| Tool | Description | Token Savings |
|------|-------------|---------------|
| `get_node` | Read a single node from a flow | ~90% |
| `get_phase` | Read a single phase (optionally with nodes) | ~90% |
| `update_node` | Update specific fields of a node | ~85% |
| `add_node` | Add a new node to a flow/phase | ~85% |
| `delete_node` | Remove a node from flow, phases, and edges | ~95% |
| `update_phase` | Update specific fields of a phase | ~85% |
| `update_metadata` | Update only metadata + auto-changelog | ~95% |
| `patch_flow` | Apply JSON Patch (RFC 6902) operations | ~90% |
| `validate_flow` | Validate flow against CODEFLOW_SPEC_v2 | N/A |

### Code Exploration

| Tool | Description |
|------|-------------|
| `list_code_files` | List code files in a directory |
| `read_code_file` | Read a code file |
| `scan_undocumented` | Find code without documentation |

### Example: Efficient Updates

```javascript
// Before (v1.x): ~1200 tokens
read_flow("my-flow.cf")              // 600 tokens to read
save_flow("my-flow.cf", <full JSON>) // 600 tokens to write

// After (v2.0): ~50 tokens
update_node("my-flow.cf", "n3", {
  label: "New Label",
  data: { description: "Updated description" }
})

// Multiple changes with JSON Patch: ~100 tokens
patch_flow("my-flow.cf", [
  { "op": "replace", "path": "/nodes/0/label", "value": "New" },
  { "op": "add", "path": "/metadata/tags/-", "value": "updated" }
])
```

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
