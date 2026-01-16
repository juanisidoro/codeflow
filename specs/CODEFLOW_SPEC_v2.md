# CodeFlow Specification v2.0

## Overview

CodeFlow v2.0 is a hierarchical JSON format for documenting code flows with multiple levels of abstraction. It enables progressive disclosure: from high-level summaries to detailed node-by-node analysis.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [File Structure](#file-structure)
3. [Zoom Levels](#zoom-levels)
4. [Schema Reference](#schema-reference)
5. [Node Types](#node-types)
6. [Type Notation](#type-notation)
7. [Examples](#examples)
8. [LLM Generation Guide](#llm-generation-guide)
9. [Migration from v1.0](#migration-from-v10)

---

## Design Principles

1. **Progressive Disclosure**: Users can understand a flow at any depth level
2. **Generic**: Works for any programming language or architecture
3. **LLM-Friendly**: Clear structure that LLMs can generate consistently
4. **Comparable**: Flows can be compared at any zoom level
5. **Extensible**: Custom fields allowed in `metadata` and `data`

---

## File Structure

### File Extension

- Flow files: `.cf` (CodeFlow)
- Analysis files: `.cf-analysis.json` (see Analysis Spec)

### Minimal Valid File

```json
{
  "version": "2.0",
  "id": "my-flow",
  "name": "My Flow",
  "summary": {
    "input": "What enters the flow",
    "output": "What exits the flow",
    "purpose": "What this flow does in one sentence"
  },
  "phases": [],
  "nodes": []
}
```

---

## Zoom Levels

CodeFlow v2.0 defines three zoom levels for visualization:

### Level 0: Summary (Bird's Eye View)

Shows only the `summary` block - one sentence describing the entire flow.

```
┌─────────────────────────────────────────────────────────┐
│  Quick Edit Product                                     │
│                                                         │
│  PATCH /products/:id { price, stock }                   │
│            ↓                                            │
│  202 Accepted + async WooCommerce sync                  │
└─────────────────────────────────────────────────────────┘
```

### Level 1: Phases (Grouped View)

Shows `phases` as collapsed boxes with their summaries.

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   Auth   │───▶│ Prepare  │───▶│ Process  │───▶│  Notify  │
│  Chain   │    │ Context  │    │  Async   │    │ Complete │
│          │    │          │    │          │    │          │
│ 2 nodes  │    │ 2 nodes  │    │ 7 nodes  │    │ 4 nodes  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### Level 2: Nodes (Full Detail)

Shows all `nodes` with their complete data, optionally grouped by phase.

```
┌─ Auth Chain ──────────────────────────────────────────────┐
│  ┌────────────┐    ┌─────────────────┐                   │
│  │ Firebase   │───▶│ Idempotency     │                   │
│  │ Auth       │    │ Check           │                   │
│  └────────────┘    └─────────────────┘                   │
└───────────────────────────────────────────────────────────┘
```

---

## Schema Reference

### Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Must be "2.0" |
| `id` | string | Yes | Unique identifier, kebab-case |
| `name` | string | Yes | Human-readable name |
| `summary` | Summary | Yes | High-level description |
| `phases` | Phase[] | Yes | Grouped sections of the flow |
| `nodes` | Node[] | Yes | Detailed steps |
| `edges` | Edge[] | No | Connections (if omitted, sequential within phases) |
| `contracts` | Contract[] | No | Explicit DTO definitions |
| `links` | FlowLink[] | No | References to other flows |
| `metadata` | Metadata | No | Additional information |

### Summary Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input` | string | Yes | What data/request enters (1 line) |
| `output` | string | Yes | What data/response exits (1 line) |
| `purpose` | string | Yes | What this flow does (1 sentence) |

### Phase Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (e.g., "p1", "p2") |
| `name` | string | Yes | Short name (1-3 words) |
| `description` | string | Yes | What this phase does (1 sentence) |
| `nodes` | string[] | Yes | Array of node IDs in this phase |
| `input` | string | No | What enters this phase |
| `output` | string | No | What exits this phase |
| `async` | boolean | No | If true, this phase runs asynchronously |

### Node Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (e.g., "n1", "n2") |
| `type` | NodeType | Yes | Type of node (see Node Types) |
| `label` | string | Yes | Short label (2-4 words) |
| `phase` | string | No | Reference to parent phase ID |
| `data` | NodeData | Yes | Type-specific data |
| `ref` | CodeRef | No | Reference to source code |

### NodeData Object (varies by type)

#### For `input` and `output` nodes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | What this input/output represents |
| `fields` | Record<string, string> | Yes | Field name → type notation |
| `headers` | Record<string, string> | No | HTTP headers (for input) |
| `example` | object | No | Example payload |
| `constraints` | string[] | No | Validation constraints |

#### For `validation` nodes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | What is being validated |
| `rules` | string[] | Yes | List of validation rules |
| `errorResponse` | object | No | Error response shape |

#### For `transform` nodes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | What transformation occurs |
| `mappings` | string[] | Yes | List of field mappings ("from → to") |

#### For `query` nodes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | What data is being fetched |
| `queries` | string[] | Yes | List of queries/operations |
| `returns` | Record<string, string> | No | What is returned |

#### For `logic` nodes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | What logic is executed |
| `operations` | string[] | Yes | List of operations |
| `conditions` | string[] | No | Conditional branches |

#### For `command` nodes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | What mutation occurs |
| `commands` | string[] | Yes | List of write operations |

#### For `event` nodes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | What events are emitted |
| `events` | string[] | Yes | List of event names |
| `payload` | Record<string, string> | No | Event payload shape |

#### For `external` nodes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | What external service is called |
| `service` | string | No | Service name |
| `operations` | string[] | Yes | List of external operations |
| `errorHandling` | string[] | No | How errors are handled |

#### For `condition` nodes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | What decision is made |
| `conditions` | string[] | Yes | List of conditions and outcomes |

### CodeRef Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | string | Yes | File path |
| `function` | string | No | Function name |
| `line` | number | No | Line number |
| `class` | string | No | Class name |

### Edge Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | string | Yes | Source node/phase ID |
| `to` | string | Yes | Target node/phase ID |
| `label` | string | No | Edge label (condition, etc.) |
| `async` | boolean | No | If true, async transition |

### Contract Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Contract identifier |
| `name` | string | Yes | Contract name (e.g., "CreateOrderDTO") |
| `type` | "input" \| "output" \| "internal" | Yes | Contract type |
| `usedIn` | string[] | Yes | Node IDs that use this contract |
| `fields` | Record<string, string> | Yes | Field definitions |

### FlowLink Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `flowId` | string | Yes | Referenced flow ID |
| `relationship` | "calls" \| "calledBy" \| "similar" | Yes | Relationship type |
| `at` | string | No | Node ID where link occurs |
| `context` | string | No | Additional context |

### Metadata Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `author` | string | No | Who created this flow |
| `createdAt` | string | No | ISO 8601 timestamp |
| `updatedAt` | string | No | ISO 8601 timestamp |
| `sourceFiles` | string[] | No | Source files analyzed |
| `tags` | string[] | No | Categorization tags |
| `domain` | string | No | Business domain |

---

## Node Types

| Type | Icon | Color | Purpose |
|------|------|-------|---------|
| `input` | ArrowDownToLine | Blue (#3B82F6) | Entry point, incoming data |
| `output` | ArrowUpFromLine | Cyan (#06B6D4) | Exit point, response data |
| `validation` | ShieldCheck | Green (#10B981) | Business rules, constraints |
| `transform` | ArrowLeftRight | Purple (#8B5CF6) | Data mapping, conversion |
| `query` | Search | Amber (#F59E0B) | Data retrieval, reads |
| `logic` | Cog | Gray (#6B7280) | Calculations, decisions |
| `command` | Zap | Red (#EF4444) | Mutations, writes |
| `event` | Radio | Pink (#EC4899) | Domain events |
| `external` | Globe | Indigo (#6366F1) | External API calls |
| `condition` | GitBranch | Orange (#F97316) | Branching, if/else |

---

## Type Notation

Use compact notation for field types:

| Notation | Meaning | Example |
|----------|---------|---------|
| `type!` | Required | `userId: "string!"` |
| `type?` | Optional | `coupon: "string?"` |
| `Type[]!` | Required array | `items: "OrderItem[]!"` |
| `Type[]?` | Optional array | `tags: "string[]?"` |
| `number!` | Required number | `quantity: "number!"` |
| `boolean!` | Required boolean | `active: "boolean!"` |
| `datetime!` | ISO 8601 datetime | `createdAt: "datetime!"` |

---

## Examples

### Complete Flow Example

```json
{
  "version": "2.0",
  "id": "quick-edit-product",
  "name": "Quick Edit Product",

  "summary": {
    "input": "PATCH /products/:id { price, stock }",
    "output": "202 Accepted + async WooCommerce sync + WebSocket notification",
    "purpose": "Fast inline editing of product fields with async processing"
  },

  "phases": [
    {
      "id": "p1",
      "name": "Auth Chain",
      "description": "Validate Firebase token and check idempotency",
      "nodes": ["n1", "n2", "n3"],
      "input": "HTTP Request + Bearer Token",
      "output": "Authenticated Request"
    },
    {
      "id": "p2",
      "name": "Prepare",
      "description": "Generate operation context and register tracking",
      "nodes": ["n4", "n5"],
      "input": "Authenticated Request",
      "output": "Operation Context"
    },
    {
      "id": "p3",
      "name": "Respond",
      "description": "Return immediate 202 response",
      "nodes": ["n6"],
      "input": "Operation Context",
      "output": "202 Accepted Response"
    },
    {
      "id": "p4",
      "name": "Process",
      "description": "Sync changes with WooCommerce and persist",
      "nodes": ["n7", "n8", "n9", "n10", "n11", "n12", "n13"],
      "input": "Payload + Current State",
      "output": "Updated Product in Firestore",
      "async": true
    },
    {
      "id": "p5",
      "name": "Notify",
      "description": "Emit events and complete operation",
      "nodes": ["n14", "n15", "n16", "n17"],
      "input": "Changes",
      "output": "WebSocket broadcast + Operation completed",
      "async": true
    }
  ],

  "nodes": [
    {
      "id": "n1",
      "type": "input",
      "label": "HTTP Request",
      "phase": "p1",
      "data": {
        "description": "PATCH /api/v1/shops/:shopId/products/:productId/quick-edit",
        "fields": {
          "shopId": "string!",
          "productId": "number!",
          "regular_price": "string?",
          "sale_price": "string?",
          "stock_quantity": "number?"
        }
      }
    },
    {
      "id": "n2",
      "type": "validation",
      "label": "Firebase Auth",
      "phase": "p1",
      "data": {
        "description": "Validate Firebase ID token",
        "rules": [
          "Authorization header must exist",
          "Bearer token must be valid",
          "Token must not be expired"
        ]
      },
      "ref": {
        "file": "middleware/firebaseAuth.js",
        "function": "verifyToken"
      }
    }
  ],

  "contracts": [
    {
      "id": "QuickEditRequest",
      "name": "Quick Edit Request DTO",
      "type": "input",
      "usedIn": ["n1"],
      "fields": {
        "shopId": "string!",
        "productId": "number!",
        "regular_price": "string?",
        "sale_price": "string?",
        "stock_quantity": "number?"
      }
    },
    {
      "id": "AcceptedResponse",
      "name": "Accepted Response",
      "type": "output",
      "usedIn": ["n6"],
      "fields": {
        "productId": "number!",
        "operationId": "string!",
        "status": "string!"
      }
    }
  ],

  "links": [
    {
      "flowId": "quick-edit-batch-variations",
      "relationship": "similar",
      "context": "Same auth chain and response pattern"
    }
  ],

  "metadata": {
    "author": "Claude",
    "createdAt": "2024-01-15T10:00:00Z",
    "sourceFiles": [
      "routes/products.js",
      "services/quickEditService.js",
      "middleware/firebaseAuth.js"
    ],
    "tags": ["api", "products", "async"],
    "domain": "ecommerce"
  }
}
```

---

## LLM Generation Guide

When generating a CodeFlow v2.0 file, follow these steps:

### Step 1: Analyze and Summarize

First, understand the entire flow and write the summary:

```
1. What HTTP method/endpoint or trigger starts this flow?
2. What is the final output or side effect?
3. In one sentence, what does this flow accomplish?
```

### Step 2: Identify Phases

Group related operations into 3-7 phases:

```
Common phase patterns:
- Auth/Security (validation, authentication)
- Preparation (context, setup)
- Response (immediate return)
- Processing (main business logic)
- Persistence (save to database)
- Notification (events, broadcasts)
- Cleanup (complete, rollback)
```

### Step 3: Detail Nodes

For each phase, list the individual steps:

```
For each step, determine:
- Type: What kind of operation is this?
- Label: Short name (2-4 words)
- Data: What specifically happens?
- Ref: What file/function implements this?
```

### Step 4: Define Contracts

Extract explicit DTOs for input/output nodes:

```
For each input/output:
- List all fields with types
- Mark required (!) vs optional (?)
- Include constraints if any
```

### Step 5: Add Edges (if non-linear)

Only add edges if the flow has branches or non-sequential paths.

### Prompt Template

```
Analyze the following code and generate a CodeFlow v2.0 JSON file.

Requirements:
1. Start with a clear summary (input, output, purpose)
2. Group steps into 3-7 logical phases
3. Detail each node with appropriate type
4. Include code references (file, function, line)
5. Extract explicit contracts for DTOs
6. Add metadata (sourceFiles, tags, domain)

Code to analyze:
[paste code here]

Output only valid JSON following CodeFlow Spec v2.0.
```

---

## Migration from v1.0

To migrate a v1.0 file to v2.0:

1. Add `summary` object:
   - Extract from first input node and last output node
   - Write a purpose sentence

2. Group nodes into `phases`:
   - Identify logical groupings (auth, process, notify)
   - Create phase objects with node references

3. Add `phase` field to each node:
   - Reference the parent phase ID

4. Optional: Extract `contracts`:
   - Pull field definitions from input/output nodes
   - Create explicit contract objects

### Migration Script (Conceptual)

```javascript
function migrateV1toV2(v1Flow) {
  return {
    version: "2.0",
    id: v1Flow.id,
    name: v1Flow.name,
    summary: {
      input: extractInputSummary(v1Flow.nodes),
      output: extractOutputSummary(v1Flow.nodes),
      purpose: v1Flow.description || "Migrated flow"
    },
    phases: inferPhases(v1Flow.nodes),
    nodes: v1Flow.nodes.map(n => ({ ...n, phase: inferPhase(n) })),
    edges: v1Flow.edges,
    metadata: {
      migratedFrom: "1.0",
      migratedAt: new Date().toISOString()
    }
  };
}
```

---

## Validation Checklist

Before saving a v2.0 file, verify:

- [ ] `version` is "2.0"
- [ ] `id` is kebab-case and unique
- [ ] `summary` has input, output, and purpose
- [ ] `phases` array has 1-10 phases
- [ ] Each phase has unique `id` and lists valid node IDs
- [ ] `nodes` array is not empty
- [ ] Each node has `id`, `type`, `label`, and `data`
- [ ] All node IDs referenced in phases exist
- [ ] If `edges` exist, all referenced IDs are valid
- [ ] Field types use correct notation (!, ?, [])
