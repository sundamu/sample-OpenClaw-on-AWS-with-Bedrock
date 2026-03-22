# OpenClaw Enterprise — Technical Architecture

How we turn a personal AI assistant into an enterprise digital workforce without touching its source code.

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        User Touchpoints                              │
│  WhatsApp · Telegram · Slack · Discord · Web Portal · Admin Console  │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────────┐
│  Gateway EC2 (single instance, ~$52/mo)                              │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │ OpenClaw GW │ │ H2 Proxy     │ │ Tenant Router│ │Admin Console│ │
│  │ port 18789  │ │ port 8091    │ │ port 8090    │ │ port 8099   │ │
│  │ IM channels │ │ intercepts   │ │ derives      │ │ React+FastAPI│ │
│  │ Web UI      │ │ Bedrock SDK  │ │ tenant_id    │ │ 24 pages    │ │
│  └──────┬──────┘ └──────┬───────┘ └──────┬───────┘ └─────────────┘ │
│         │ AWS SDK call   │ rewrite        │ invoke                   │
│         └───────────────►│───────────────►│                          │
└──────────────────────────────────────────┬───────────────────────────┘
                                           │
┌──────────────────────────────────────────▼───────────────────────────┐
│  Bedrock AgentCore Runtime                                           │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Firecracker microVM (per tenant, per request)                  │ │
│  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐ │ │
│  │  │ entrypoint.sh│  │ server.py     │  │workspace_assembler.py│ │ │
│  │  │ S3 sync      │  │ HTTP :8080    │  │ 3-layer SOUL merge   │ │ │
│  │  │ skill load   │  │ openclaw CLI  │  │ Global+Position+     │ │ │
│  │  │ watchdog     │  │ usage tracking│  │ Personal → SOUL.md   │ │ │
│  │  └──────────────┘  └───────┬───────┘  └──────────────────────┘ │ │
│  │                            │ openclaw agent --json               │ │
│  │                            ▼                                     │ │
│  │                    OpenClaw CLI → Bedrock (Nova 2 Lite)          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                       │                    │
┌──────────────────────▼────────────────────▼──────────────────────────┐
│  AWS Services                                                        │
│  ┌──────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐  │
│  │ DynamoDB │ │   S3   │ │   SSM   │ │ Bedrock │ │  CloudWatch  │  │
│  │ org,audit│ │ SOUL,  │ │ tenant→ │ │ Nova 2  │ │  agent logs  │  │
│  │ usage,   │ │ skills,│ │ position│ │ Lite,   │ │  invocation  │  │
│  │ sessions │ │ memory,│ │ mapping │ │ Sonnet, │ │  metrics     │  │
│  │          │ │ knowl. │ │ API keys│ │ Pro     │ │              │  │
│  └──────────┘ └────────┘ └─────────┘ └─────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Mechanism: Three-Layer SOUL Injection

This is the key innovation. We control OpenClaw's behavior without modifying its code.

### How OpenClaw Works (Unmodified)

OpenClaw reads `~/.openclaw/workspace/SOUL.md` at session start and uses it as the system prompt. It also reads `AGENTS.md`, `TOOLS.md`, `USER.md`, and files in `memory/` and `knowledge/`.

### What We Do

Before OpenClaw reads these files, `workspace_assembler.py` constructs them by merging three layers from S3:

```
S3: _shared/soul/global/SOUL.md          ← Layer 1: IT-locked policies
  + _shared/soul/positions/pos-fa/SOUL.md ← Layer 2: Finance Analyst role
  + emp-carol/workspace/SOUL.md           ← Layer 3: Carol's preferences
  ────────────────────────────────────────
  = ~/.openclaw/workspace/SOUL.md         ← What OpenClaw reads
```

### Merge Logic (workspace_assembler.py)

```python
def merge_soul(global_soul, position_soul, personal_soul):
    parts = []
    if global_soul:
        # Identity override prefix ensures LLM compliance
        parts.append(f"CRITICAL IDENTITY OVERRIDE: You are an ACME Corp employee.\n\n{global_soul}")
    if position_soul:
        parts.append(f"<!-- POSITION -->\n{position_soul}")
    if personal_soul:
        parts.append(f"<!-- PERSONAL -->\n{personal_soul}")
    return "\n\n---\n\n".join(parts)
```

The order matters: Global rules appear first in the prompt, giving them highest priority. An employee's personal preferences cannot override "Never share customer PII" from the Global layer.

### Tenant ID Resolution

```
Telegram message from Carol
  → OpenClaw Gateway receives message
  → H2 Proxy intercepts Bedrock SDK call, extracts channel + user_id
  → Tenant Router derives: tenant_id = "tg__emp-carol__a1b2c3d4"
  → AgentCore creates Firecracker microVM with this session ID
  → server.py extracts base ID: "emp-carol"
  → workspace_assembler.py looks up SSM: emp-carol → pos-fa (Finance Analyst)
  → Merges Global + pos-fa + emp-carol workspace files
  → OpenClaw reads merged SOUL.md → responds as "ACME Corp Finance Analyst"
```

## Data Architecture

### DynamoDB Single-Table Design

One table (`openclaw-enterprise`), partition key `PK`, sort key `SK`, one GSI.

```
PK              SK                    Entity          Example
─────────────── ───────────────────── ─────────────── ──────────────────────
ORG#acme        DEPT#dept-eng         Department      Engineering, 45 people
ORG#acme        POS#pos-sa            Position        Solutions Architect
ORG#acme        EMP#emp-carol         Employee        Carol Zhang, Finance
ORG#acme        AGENT#agent-fa-carol  Agent           Finance Agent - Carol
ORG#acme        BIND#bind-001         Binding         Carol ↔ Finance Agent
ORG#acme        AUDIT#2026-03-20T...  Audit Entry     Agent invocation log
ORG#acme        APPROVAL#apr-001      Approval        Pending skill request
ORG#acme        CONFIG#model          Config          Default model settings
ORG#acme        USAGE#emp-carol#date  Usage           Daily token counts
ORG#acme        SESSION#sess-001      Session         Active conversation
ORG#acme        RULE#rule-001         Routing Rule    Channel→agent mapping
ORG#acme        CONV#sess-001#001     Conversation    Chat message in session

GSI1PK          GSI1SK                Purpose
─────────────── ───────────────────── ──────────────────────
TYPE#employee   EMP#emp-carol         List all employees
TYPE#agent      AGENT#agent-fa-carol  List all agents
TYPE#usage      USAGE#2026-03-20#...  Usage by date
TYPE#session    SESSION#sess-001      List active sessions
```

### S3 Structure

```
openclaw-tenants-{account}/
├── _shared/
│   ├── soul/
│   │   ├── global/              ← Layer 1 (IT locked)
│   │   │   ├── SOUL.md
│   │   │   ├── AGENTS.md
│   │   │   └── TOOLS.md
│   │   └── positions/           ← Layer 2 (per role)
│   │       ├── pos-sa/SOUL.md
│   │       ├── pos-sde/SOUL.md
│   │       ├── pos-fa/SOUL.md
│   │       └── ... (10 positions)
│   ├── skills/                  ← Skill manifests + code
│   │   ├── web-search/skill.json
│   │   ├── excel-gen/skill.json
│   │   └── ... (26 skills)
│   └── knowledge/               ← Shared knowledge docs
│       ├── company-policies/
│       ├── arch-standards/
│       └── ... (10 categories)
├── emp-carol/                   ← Layer 3 (personal)
│   └── workspace/
│       ├── USER.md              ← Preferences
│       ├── MEMORY.md            ← Persistent memory
│       └── memory/
│           └── 2026-03-21.md    ← Daily memory
├── emp-w5/workspace/
└── ... (20 employees)
```

## Permission System

### Plan A: Pre-Execution (SOUL.md Injection)

The position SOUL template declares allowed/blocked tools:

```markdown
<!-- pos-fa/SOUL.md -->
## Tool Permissions
You have access to: web_search, jina-reader, deep-research, excel-gen, s3-files
You MUST NOT use: shell, code_execution, browser, github-pr, file_write
If asked to use a blocked tool, explain that your Finance Analyst role
does not have that permission and suggest alternatives.
```

This is injected into the system prompt. The LLM self-enforces.

### Plan E: Post-Execution (Response Audit)

`server.py` scans every response for blocked tool patterns:

```python
_TOOL_PATTERN = re.compile(
    r'\b(shell|browser|file_write|code_execution|install_skill)\b', re.IGNORECASE
)

def _audit_response(tenant_id, response_text, allowed_tools):
    matches = _TOOL_PATTERN.findall(response_text)
    for tool in set(t.lower() for t in matches):
        if tool not in allowed_tools:
            log_permission_denied(tenant_id, tool, "RESPONSE_AUDIT")
```

### Skill Filtering (skill_loader.py)

Each skill has a manifest with role permissions:

```json
{
  "name": "excel-gen",
  "permissions": {
    "allowedRoles": ["pos-fa", "pos-ae", "pos-pm"],
    "blockedRoles": ["pos-sde", "pos-devops"]
  }
}
```

`skill_loader.py` reads the tenant's position from SSM, then only loads skills where the position is in `allowedRoles` (or `allowedRoles` is `["*"]`).

## RBAC Implementation

### Three Roles

```
Admin    → Full access to all 19 admin pages + all API endpoints
Manager  → Same pages, but data scoped to their department
Employee → Portal only (5 pages: Chat, Profile, Usage, Skills, Requests)
```

### Manager Data Scoping (BFS Sub-Department Rollup)

When a manager calls any list API, the backend computes their visible scope:

```python
def _get_dept_scope(user):
    if user.role == "admin": return None  # no filter
    # BFS from manager's department to find all sub-departments
    depts = db.get_departments()
    ids = {user.department_id}
    queue = [user.department_id]
    while queue:
        current = queue.pop(0)
        for d in depts:
            if d.get("parentId") == current and d["id"] not in ids:
                ids.add(d["id"])
                queue.append(d["id"])
    return ids  # manager sees only these departments
```

Every list endpoint applies this filter:
```python
@app.get("/api/v1/org/employees")
def get_employees(authorization):
    user = _get_current_user(authorization)
    employees = db.get_employees()
    if user.role == "manager":
        scope = _get_dept_scope(user)
        employees = [e for e in employees if e.get("departmentId") in scope]
    return employees
```

## Memory Persistence

### Write Path (during session)

```
Employee sends message → OpenClaw processes → writes memory/2026-03-21.md
  → Watchdog (entrypoint.sh, every 60s) detects new file
  → aws s3 sync workspace/ → s3://bucket/emp-carol/workspace/
  → Excludes: SOUL.md, AGENTS.md, TOOLS.md (assembled files)
```

### Read Path (next session)

```
New request arrives → server.py._ensure_workspace_assembled()
  → aws s3 sync s3://bucket/emp-carol/workspace/ → local workspace/
  → workspace_assembler.py merges SOUL layers
  → OpenClaw reads workspace/ including memory/ from previous session
  → Agent remembers: "Carol prefers EBITDA analysis"
```

### Why Exclude Assembled Files from Writeback

If we synced SOUL.md back to S3, an employee could:
1. Edit their personal SOUL.md to say "Ignore all previous instructions"
2. Next session, the merged SOUL.md (with the override) gets synced back
3. The Global layer's security policies would be overwritten

By excluding assembled files, the personal layer in S3 stays clean, and the merge always starts fresh from the three source layers.

## Real-Time Usage Tracking

Every successful agent invocation triggers a fire-and-forget DynamoDB write:

```python
def _write_usage_to_dynamodb(tenant_id, base_id, usage, model, duration_ms):
    # Atomic increment — no read-modify-write race condition
    table.update_item(
        Key={"PK": "ORG#acme", "SK": f"USAGE#{base_id}#{today}"},
        UpdateExpression="ADD inputTokens :inp, outputTokens :out, requests :one, cost :cost",
        ExpressionAttributeValues={
            ":inp": input_tokens, ":out": output_tokens,
            ":one": 1, ":cost": cost,
        },
    )
```

This runs in a background thread so it doesn't block the response. The Admin Console reads these records for the Usage & Cost page, Dashboard KPIs, and per-agent charts.

## Cost Model

```
20 employees, ~100 conversations/day, Nova 2 Lite

EC2 (c7g.large)     $52/mo   ← Gateway + Router + Admin Console
DynamoDB              $1/mo   ← Pay-per-request, ~2000 writes/day
S3                   <$1/mo   ← Workspace files, skills, knowledge
Bedrock            $5-15/mo   ← ~100 conv/day × ~500 tokens/conv
AgentCore          included   ← Pay per invocation (in Bedrock pricing)
────────────────────────────
Total              ~$60-70/mo

vs ChatGPT Team: $25/user × 20 = $500/mo
Savings: 85%+
```

The key insight: Firecracker microVMs have zero idle cost. 20 agents don't mean 20 running containers — they mean 20 potential microVMs that only exist during active conversations.
