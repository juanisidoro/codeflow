# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-01-16

### Added

#### Partial Update Tools (Token-Efficient Operations)
These new tools reduce token usage by ~85-95% compared to full flow rewrites:

- **`get_node`**: Read a single node from a flow without loading the entire file
- **`get_phase`**: Read a single phase with optional node data inclusion
- **`update_node`**: Partially update a node with deep merge (only send changed fields)
- **`add_node`**: Add a new node to a flow, optionally assigning to a phase
- **`delete_node`**: Remove a node from flow, all phases, and edges
- **`update_phase`**: Partially update a phase (name, description, nodes)
- **`update_metadata`**: Update only metadata fields with auto-changelog support
- **`patch_flow`**: Apply JSON Patch (RFC 6902) operations for complex atomic changes
- **`validate_flow`**: Validate a flow against CODEFLOW_SPEC_v2 before saving

#### New Dependencies
- `fast-json-patch`: For RFC 6902 JSON Patch support

#### TypeScript Types
- Added full TypeScript interfaces for `Flow`, `FlowNode`, `FlowPhase`, `FlowMetadata`
- Added `ValidationError` interface for structured validation results

### Changed

- Server version bumped to 2.0.0
- README updated with new tools documentation and examples
- Tools now organized into categories: Core, Partial Updates, Code Exploration

### Technical Details

The partial update tools address the main pain point of v1.x: having to read and rewrite entire flow files (300-600 lines of JSON) to make small changes.

**Token usage comparison:**

| Operation | v1.x | v2.0 | Savings |
|-----------|------|------|---------|
| Update 1 node | ~1200 tokens | ~50 tokens | 96% |
| Add 1 node | ~1200 tokens | ~50 tokens | 96% |
| Update metadata | ~1200 tokens | ~30 tokens | 97% |
| Multiple changes | ~1200 tokens | ~100 tokens | 92% |

---

## [1.0.0] - 2025-01-10

### Added

- Initial release
- Core tools: `read_codeflow_spec`, `list_flows`, `read_flow`, `save_flow`, `save_analysis`, `delete_flow`
- Code exploration: `list_code_files`, `read_code_file`, `scan_undocumented`
- Project info: `get_project_info`
- Git integration (branch and commit detection)
- Support for `CODEFLOW_FLOWS_DIR` environment variable
- Bundled specs: `CODEFLOW_SPEC_v2.md`, `CODEFLOW_ANALYSIS_SPEC_v1.md`
