# CodeFlow Analysis Specification v1.0

## Overview

CodeFlow Analysis is a structured format for documenting findings, metrics, and recommendations derived from analyzing CodeFlow (.cf) files. It enables LLMs and tools to provide consistent, actionable insights about code quality, security, performance, and maintainability.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [File Structure](#file-structure)
3. [Schema Reference](#schema-reference)
4. [Finding Categories](#finding-categories)
5. [Severity Levels](#severity-levels)
6. [Metrics](#metrics)
7. [Analysis Templates](#analysis-templates)
8. [Examples](#examples)
9. [LLM Analysis Guide](#llm-analysis-guide)

---

## Design Principles

1. **Actionable**: Every finding should have a clear suggestion
2. **Prioritized**: Severity helps teams focus on what matters
3. **Comparable**: Metrics allow comparison between flows
4. **Traceable**: Findings reference specific nodes/phases
5. **Extensible**: Custom categories and metrics allowed

---

## File Structure

### File Naming

- Analysis files: `{flowId}.cf-analysis.json`
- Example: `quick-edit-product.cf-analysis.json`

### Minimal Valid File

```json
{
  "version": "1.0",
  "flowId": "quick-edit-product",
  "flowVersion": "2.0",
  "analyzedAt": "2024-01-15T10:00:00Z",
  "findings": [],
  "metrics": {}
}
```

---

## Schema Reference

### Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Must be "1.0" |
| `flowId` | string | Yes | Reference to the analyzed .cf file |
| `flowVersion` | string | Yes | Version of the flow file analyzed |
| `analyzedAt` | string | Yes | ISO 8601 timestamp |
| `analyzer` | string | No | Who/what performed the analysis |
| `findings` | Finding[] | Yes | List of findings |
| `metrics` | Metrics | Yes | Calculated metrics |
| `comparisons` | Comparison[] | No | Comparisons with other flows |
| `recommendations` | Recommendation[] | No | High-level recommendations |

### Finding Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique finding ID (e.g., "F001") |
| `category` | Category | Yes | Finding category |
| `severity` | Severity | Yes | Finding severity |
| `title` | string | Yes | Short title (5-10 words) |
| `description` | string | Yes | Detailed description |
| `location` | Location | Yes | Where the issue was found |
| `suggestion` | string | Yes | How to fix/improve |
| `effort` | "low" \| "medium" \| "high" | No | Estimated fix effort |
| `references` | string[] | No | Links to documentation |
| `codeExample` | CodeExample | No | Before/after code example |

### Location Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | "node" \| "phase" \| "edge" \| "flow" | Yes | Location type |
| `ids` | string[] | Yes | Node/phase IDs involved |
| `description` | string | No | Additional context |

### CodeExample Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `language` | string | Yes | Programming language |
| `before` | string | No | Current code |
| `after` | string | No | Suggested code |

### Metrics Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `complexity` | ComplexityMetrics | Yes | Complexity measurements |
| `coverage` | CoverageMetrics | Yes | Coverage measurements |
| `dependencies` | DependencyMetrics | Yes | Dependency measurements |
| `custom` | Record<string, number> | No | Custom metrics |

### ComplexityMetrics

| Field | Type | Description |
|-------|------|-------------|
| `totalNodes` | number | Total number of nodes |
| `totalPhases` | number | Total number of phases |
| `totalEdges` | number | Total number of edges |
| `maxDepth` | number | Maximum nesting depth |
| `branchingFactor` | number | Average branches per condition |
| `cyclomaticComplexity` | number | Number of independent paths |

### CoverageMetrics

| Field | Type | Description |
|-------|------|-------------|
| `inputValidation` | number | % of input fields validated (0-1) |
| `errorHandling` | number | % of external calls with error handling (0-1) |
| `documentation` | number | % of nodes with descriptions (0-1) |
| `codeReferences` | number | % of nodes with code refs (0-1) |

### DependencyMetrics

| Field | Type | Description |
|-------|------|-------------|
| `externalServices` | number | Number of external service calls |
| `databaseOperations` | number | Number of DB read/write operations |
| `eventEmissions` | number | Number of events emitted |
| `sharedWithFlows` | number | Number of flows sharing nodes |

### Comparison Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `flowId` | string | Yes | Compared flow ID |
| `similarity` | number | Yes | Similarity score (0-1) |
| `sharedPhases` | string[] | No | Phase IDs that are similar |
| `sharedNodes` | string[] | No | Node IDs that are similar |
| `differences` | string[] | No | Key differences |

### Recommendation Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Recommendation ID |
| `priority` | number | Yes | Priority (1 = highest) |
| `title` | string | Yes | Short title |
| `description` | string | Yes | Detailed description |
| `impact` | "low" \| "medium" \| "high" | Yes | Expected impact |
| `relatedFindings` | string[] | No | Finding IDs this addresses |

---

## Finding Categories

### Security (SEC)

Issues related to authentication, authorization, and data protection.

| ID | Name | Description |
|----|------|-------------|
| SEC001 | Missing Authentication | Endpoint lacks authentication |
| SEC002 | Weak Authentication | Authentication method is weak |
| SEC003 | Missing Authorization | No permission checks |
| SEC004 | Sensitive Data Exposure | Sensitive data in logs/responses |
| SEC005 | Injection Vulnerability | Possible injection attack vector |
| SEC006 | Insecure External Call | External call without TLS/auth |
| SEC007 | Missing Input Validation | Input not validated |
| SEC008 | Credential Exposure | Credentials hardcoded or exposed |

### Reliability (REL)

Issues related to error handling, resilience, and consistency.

| ID | Name | Description |
|----|------|-------------|
| REL001 | Missing Error Handling | No try/catch or error handler |
| REL002 | No Retry Strategy | External call without retry |
| REL003 | No Circuit Breaker | No protection against cascading failures |
| REL004 | Missing Timeout | Operation without timeout |
| REL005 | No Rollback | Transaction without rollback capability |
| REL006 | Inconsistent State | Possible data inconsistency |
| REL007 | Missing Idempotency | Non-idempotent operation without protection |
| REL008 | Single Point of Failure | Critical path with no redundancy |

### Maintainability (MNT)

Issues related to code quality and long-term maintenance.

| ID | Name | Description |
|----|------|-------------|
| MNT001 | Code Duplication | Logic duplicated across flows |
| MNT002 | High Complexity | Too many nodes/branches |
| MNT003 | Missing Documentation | Nodes without descriptions |
| MNT004 | Missing Code References | No traceability to source |
| MNT005 | Tight Coupling | High dependency between flows |
| MNT006 | God Node | Single node doing too much |
| MNT007 | Inconsistent Naming | Field names inconsistent across flows |
| MNT008 | Dead Code | Unreachable nodes |

### Performance (PRF)

Issues related to speed and resource usage.

| ID | Name | Description |
|----|------|-------------|
| PRF001 | N+1 Query | Multiple queries in loop |
| PRF002 | Sequential External Calls | Calls that could be parallel |
| PRF003 | Missing Caching | Repeated fetches without cache |
| PRF004 | Large Payload | Transferring unnecessary data |
| PRF005 | Sync Blocking | Blocking operation in sync path |
| PRF006 | Missing Pagination | Unbounded query results |
| PRF007 | Inefficient Transform | Complex transform in hot path |
| PRF008 | Missing Index Hint | Query without index guidance |

### Contract (CTR)

Issues related to data contracts and interfaces.

| ID | Name | Description |
|----|------|-------------|
| CTR001 | Missing Required Field | Required field not present |
| CTR002 | Type Mismatch | Field type inconsistent |
| CTR003 | Undocumented Field | Field without type annotation |
| CTR004 | Breaking Change | Change that breaks compatibility |
| CTR005 | Inconsistent Contract | Same entity with different shapes |
| CTR006 | Missing Validation | Field without validation rule |
| CTR007 | Implicit Contract | Contract not explicitly defined |
| CTR008 | Version Mismatch | Contract version conflicts |

---

## Severity Levels

| Level | Description | Action Required |
|-------|-------------|-----------------|
| `critical` | Security vulnerability or data loss risk | Immediate fix required |
| `high` | Significant risk or major issue | Fix before next release |
| `medium` | Moderate issue, improvement needed | Plan to fix soon |
| `low` | Minor issue or enhancement | Fix when convenient |
| `info` | Observation, no action needed | For awareness only |

### Severity Guidelines

```
CRITICAL:
- Authentication bypass
- SQL injection
- Data exposure
- Complete feature failure

HIGH:
- Missing authorization
- No error handling on critical path
- Data inconsistency risk
- Performance degradation >10x

MEDIUM:
- Missing input validation
- No retry on external calls
- Code duplication
- Missing documentation

LOW:
- Naming inconsistencies
- Minor optimizations
- Style issues
- Enhancement suggestions

INFO:
- Observations
- Metrics notes
- Alternative approaches
```

---

## Metrics

### Standard Metrics

Every analysis should calculate these metrics:

```json
{
  "metrics": {
    "complexity": {
      "totalNodes": 17,
      "totalPhases": 5,
      "totalEdges": 16,
      "maxDepth": 2,
      "branchingFactor": 1.2,
      "cyclomaticComplexity": 3
    },
    "coverage": {
      "inputValidation": 0.8,
      "errorHandling": 0.6,
      "documentation": 0.9,
      "codeReferences": 0.7
    },
    "dependencies": {
      "externalServices": 2,
      "databaseOperations": 4,
      "eventEmissions": 1,
      "sharedWithFlows": 3
    }
  }
}
```

### Scoring

Overall scores can be derived from metrics:

```
Security Score = (authenticated + authorized + validated + encrypted) / 4
Reliability Score = (errorHandled + retriable + idempotent + recoverable) / 4
Maintainability Score = (documented + referenced + lowComplexity + noDuplication) / 4
Performance Score = (parallelized + cached + paginated + indexed) / 4

Overall Health = (Security + Reliability + Maintainability + Performance) / 4
```

---

## Analysis Templates

### Security Audit Template

```json
{
  "template": "security-audit",
  "checks": [
    { "id": "SEC001", "check": "All endpoints have authentication" },
    { "id": "SEC003", "check": "All mutations have authorization" },
    { "id": "SEC007", "check": "All inputs are validated" },
    { "id": "SEC006", "check": "All external calls use TLS" },
    { "id": "SEC004", "check": "No sensitive data in responses" }
  ]
}
```

### Performance Review Template

```json
{
  "template": "performance-review",
  "checks": [
    { "id": "PRF001", "check": "No N+1 queries in loops" },
    { "id": "PRF002", "check": "Independent calls are parallelized" },
    { "id": "PRF003", "check": "Repeated reads use caching" },
    { "id": "PRF005", "check": "Heavy processing is async" }
  ]
}
```

### Contract Compliance Template

```json
{
  "template": "contract-compliance",
  "checks": [
    { "id": "CTR001", "check": "All required fields documented" },
    { "id": "CTR002", "check": "Field types consistent across flows" },
    { "id": "CTR005", "check": "Same entity has same shape everywhere" },
    { "id": "CTR006", "check": "All input fields have validation" }
  ]
}
```

---

## Examples

### Complete Analysis Example

```json
{
  "version": "1.0",
  "flowId": "quick-edit-simple-product",
  "flowVersion": "2.0",
  "analyzedAt": "2024-01-15T10:00:00Z",
  "analyzer": "Claude CodeFlow Analyzer",

  "findings": [
    {
      "id": "F001",
      "category": "security",
      "severity": "medium",
      "title": "WooCommerce credentials use Basic Auth",
      "description": "The external call to WooCommerce (n10) uses Basic Authentication with credentials that may be stored in code or environment variables without rotation.",
      "location": {
        "type": "node",
        "ids": ["n10", "n11"],
        "description": "External calls to WooCommerce API"
      },
      "suggestion": "Use a secrets manager with automatic rotation. Consider OAuth2 if WooCommerce supports it.",
      "effort": "medium",
      "references": [
        "https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication"
      ]
    },
    {
      "id": "F002",
      "category": "reliability",
      "severity": "medium",
      "title": "No circuit breaker for external calls",
      "description": "WooCommerce calls (n10, n11) have retry logic but no circuit breaker. If WooCommerce is down, the system will keep retrying and potentially overwhelm both systems.",
      "location": {
        "type": "node",
        "ids": ["n10", "n11"]
      },
      "suggestion": "Implement circuit breaker pattern. After N consecutive failures, stop calling for a cooldown period.",
      "effort": "medium",
      "codeExample": {
        "language": "javascript",
        "before": "await wooProductService.updateProduct(payload);",
        "after": "await circuitBreaker.fire(() => wooProductService.updateProduct(payload));"
      }
    },
    {
      "id": "F003",
      "category": "maintainability",
      "severity": "low",
      "title": "Auth chain duplicated across flows",
      "description": "The authentication chain (n2, n3) is identical to quick-edit-batch-variations. This logic is duplicated.",
      "location": {
        "type": "phase",
        "ids": ["p1"]
      },
      "suggestion": "Extract auth chain to a shared middleware composition that can be reused across flows.",
      "effort": "low"
    },
    {
      "id": "F004",
      "category": "performance",
      "severity": "low",
      "title": "Sequential WooCommerce calls",
      "description": "The update (n10) and fetch (n11) are sequential. The fetch waits for update to complete.",
      "location": {
        "type": "node",
        "ids": ["n10", "n11"]
      },
      "suggestion": "This is likely intentional (need updated data), but consider if eventual consistency is acceptable for faster response.",
      "effort": "low"
    },
    {
      "id": "F005",
      "category": "contract",
      "severity": "info",
      "title": "Input allows partial updates",
      "description": "All price/stock fields are optional. The system correctly handles partial updates.",
      "location": {
        "type": "node",
        "ids": ["n1"]
      },
      "suggestion": "Consider adding validation that at least one field must be provided.",
      "effort": "low"
    }
  ],

  "metrics": {
    "complexity": {
      "totalNodes": 17,
      "totalPhases": 5,
      "totalEdges": 16,
      "maxDepth": 1,
      "branchingFactor": 1.0,
      "cyclomaticComplexity": 2
    },
    "coverage": {
      "inputValidation": 0.6,
      "errorHandling": 0.7,
      "documentation": 1.0,
      "codeReferences": 0.8
    },
    "dependencies": {
      "externalServices": 2,
      "databaseOperations": 3,
      "eventEmissions": 1,
      "sharedWithFlows": 1
    }
  },

  "comparisons": [
    {
      "flowId": "quick-edit-batch-variations",
      "similarity": 0.75,
      "sharedPhases": ["p1", "p2", "p3"],
      "sharedNodes": ["n2", "n3", "n4", "n5", "n6"],
      "differences": [
        "Batch has loop processing for variations",
        "Batch has optional parent update",
        "Batch emits different event type"
      ]
    }
  ],

  "recommendations": [
    {
      "id": "R001",
      "priority": 1,
      "title": "Extract shared authentication chain",
      "description": "Create a reusable auth middleware composition for Firebase auth + idempotency check. This will reduce duplication and ensure consistency.",
      "impact": "medium",
      "relatedFindings": ["F003"]
    },
    {
      "id": "R002",
      "priority": 2,
      "title": "Add circuit breaker for WooCommerce",
      "description": "Implement circuit breaker pattern for all WooCommerce API calls to improve resilience.",
      "impact": "high",
      "relatedFindings": ["F002"]
    },
    {
      "id": "R003",
      "priority": 3,
      "title": "Review credential management",
      "description": "Audit how WooCommerce credentials are stored and consider implementing rotation.",
      "impact": "medium",
      "relatedFindings": ["F001"]
    }
  ]
}
```

---

## LLM Analysis Guide

### Step 1: Load the Flow

Read the .cf file and understand:
- What the flow does (summary)
- How it's structured (phases)
- What operations it performs (nodes)

### Step 2: Run Security Checks

For each node, check:
- [ ] Is authentication present for entry points?
- [ ] Is authorization checked for mutations?
- [ ] Are inputs validated?
- [ ] Are external calls secured?
- [ ] Is sensitive data protected?

### Step 3: Run Reliability Checks

For each external call and command:
- [ ] Is there error handling?
- [ ] Is there retry logic?
- [ ] Is there timeout?
- [ ] Is there rollback capability?
- [ ] Is there idempotency protection?

### Step 4: Run Maintainability Checks

Across the flow:
- [ ] Are all nodes documented?
- [ ] Are there code references?
- [ ] Is complexity reasonable (<20 nodes)?
- [ ] Is there duplication with other flows?

### Step 5: Run Performance Checks

For queries and external calls:
- [ ] Are there N+1 patterns?
- [ ] Can operations be parallelized?
- [ ] Is there caching opportunity?
- [ ] Are payloads optimized?

### Step 6: Run Contract Checks

For input/output nodes:
- [ ] Are all fields typed?
- [ ] Are required fields marked?
- [ ] Are contracts consistent with other flows?
- [ ] Is validation sufficient?

### Step 7: Calculate Metrics

Count and calculate:
- Complexity metrics
- Coverage percentages
- Dependency counts

### Step 8: Compare with Other Flows

If other flows are available:
- Calculate similarity
- Identify shared patterns
- Note differences

### Step 9: Generate Recommendations

Based on findings:
- Prioritize by severity
- Group related findings
- Provide actionable suggestions

### Prompt Template

```
Analyze the following CodeFlow file and generate a CodeFlow Analysis JSON.

Requirements:
1. Check for security issues (authentication, authorization, validation)
2. Check for reliability issues (error handling, retry, circuit breaker)
3. Check for maintainability issues (duplication, complexity, documentation)
4. Check for performance issues (N+1, parallelization, caching)
5. Check for contract issues (typing, consistency, validation)
6. Calculate all standard metrics
7. Compare with these other flows: [list flow IDs]
8. Generate prioritized recommendations

Flow to analyze:
[paste .cf content here]

Other flows for comparison:
[paste other .cf contents if available]

Output only valid JSON following CodeFlow Analysis Spec v1.0.
```

---

## Validation Checklist

Before saving an analysis file, verify:

- [ ] `version` is "1.0"
- [ ] `flowId` matches an existing .cf file
- [ ] `analyzedAt` is valid ISO 8601
- [ ] All findings have id, category, severity, title, description, location, suggestion
- [ ] All categories are valid (security, reliability, maintainability, performance, contract)
- [ ] All severities are valid (critical, high, medium, low, info)
- [ ] Metrics include all required fields
- [ ] Finding IDs are unique
- [ ] Location IDs reference valid nodes/phases
