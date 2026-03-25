# OpenClaw Enterprise on AgentCore

Turn [OpenClaw](https://github.com/openclaw/openclaw) from a personal AI assistant into an enterprise-grade digital workforce platform — without modifying a single line of OpenClaw source code.

## 🦞 Live Demo

> **https://openclaw.awspsa.com**
>
> A real running instance with 7 departments, 13 sub-departments, 11 positions, 22 employees, 22 AI agents (20 personal + 2 shared), 26 role-filtered skills, and 12 knowledge documents — all backed by DynamoDB + S3 on AWS.
>
> This is not a mockup. Every button works, every chart reads from real data, every agent runs on Bedrock AgentCore in isolated Firecracker microVMs. Discord Bot connected with real SOUL injection verified.
>
> Need a demo account? Contact [wjiad@aws](mailto:wjiad@amazon.com) to get access.

## Screenshots

| Admin Dashboard | Employee Portal Chat |
|:-:|:-:|
| ![Admin Dashboard](demo/images/04-admin-dashboard.jpeg) | ![Portal Chat](demo/images/01-portal-chat-permission-denied.jpeg) |

| Agent Factory | Workspace & SOUL Editor |
|:-:|:-:|
| ![Agent Factory](demo/images/03-agent-factory-list.jpeg) | ![SOUL Editor](demo/images/05-workspace-manager-soul.jpeg) |

| Usage & Cost | Skill Platform |
|:-:|:-:|
| ![Usage & Cost](demo/images/02-usage-cost-dashboard.jpeg) | ![Skill Platform](demo/images/08-skill-platform-catalog.jpeg) |

| Audit & AI Insights | Employee Profile |
|:-:|:-:|
| ![Audit Center](demo/images/07-audit-center-ai-insights.jpeg) | ![Employee Profile](demo/images/06-portal-profile-preferences.jpeg) |

## The Problem

OpenClaw is one of the most capable open-source AI agent platforms (200k+ GitHub stars). It excels at personal productivity: connecting AI to WhatsApp, Telegram, Discord, running browser automation, managing calendars. But enterprise deployments need:

- **Multi-tenant isolation** — each employee gets their own agent with separate identity, memory, and permissions
- **Role-based access control** — interns can't run shell commands, finance can't access engineering data
- **Centralized governance** — IT controls agent behavior, skills, and model selection across the organization
- **Audit & compliance** — every agent action logged, PII detection, data sovereignty
- **Cost management** — per-department budgets, model routing, usage tracking

## The Solution

A management layer that wraps OpenClaw with enterprise controls, deployed on AWS Bedrock AgentCore. No fork, no patch, no vendor lock-in — just configuration files and AWS-native services.

### Design Principles

#### 1. Zero Invasion to OpenClaw

We don't fork, patch, or modify a single line of OpenClaw source code. Instead, we control agent behavior entirely through OpenClaw's native workspace file system:

```
workspace/
├── SOUL.md      ← Agent identity & rules (assembled from 3 layers)
├── AGENTS.md    ← Workflow definitions
├── TOOLS.md     ← Tool permissions
├── USER.md      ← Employee preferences
├── MEMORY.md    ← Persistent memory
├── memory/      ← Daily memory files
├── knowledge/   ← Position-scoped documents
└── skills/      ← Role-filtered skill packages
```

The `workspace_assembler` merges Global + Position + Personal layers into these files before OpenClaw reads them. OpenClaw doesn't know it's running in an enterprise context — it just reads its workspace as usual. This means:

- Upgrade OpenClaw independently without breaking enterprise controls
- No maintenance burden from maintaining a fork
- All OpenClaw community plugins and skills work out of the box
- Enterprise logic is fully decoupled and portable

#### 2. Serverless-First Architecture

Each agent runs in an isolated Firecracker microVM via Bedrock AgentCore. There are no long-running servers per tenant — microVMs cold-start in ~5 seconds, execute the request, and auto-scale to zero when idle.

| Traditional Approach | Our Approach |
|---------------------|-------------|
| 1 container per agent, always running | 1 microVM per request, auto-released |
| 20 agents = 20 containers = $400+/mo | 20 agents = 0 idle cost, pay per invocation |
| Manual scaling, capacity planning | Automatic scaling, zero ops |
| Shared process = blast radius risk | Firecracker isolation = hardware-level security |

State persists between sessions via S3 (workspace files, memory) and DynamoDB (usage, audit). The microVM is stateless and disposable — if it crashes, the next request gets a fresh VM with the same workspace from S3.

#### 3. Enterprise-Grade Governance

Every aspect of agent behavior is centrally managed and auditable:

- **Identity control** — IT defines who the agent is (SOUL.md), what it can do (TOOLS.md), and what it knows (knowledge/). Employees can customize preferences but cannot override security policies.
- **Permission enforcement** — Plan A (pre-execution): SOUL.md declares allowed/blocked tools. Plan E (post-audit): response scanner detects unauthorized tool usage.
- **Skill governance** — 26 skills with `allowedRoles`/`blockedRoles` in manifests. Finance gets excel-gen but not shell. SDE gets github-pr but not email-send. IT controls the catalog.
- **Data scoping** — Manager APIs return only their department's data (BFS sub-department rollup). Employees see only their own agent, usage, and memory. No data leaks across organizational boundaries.
- **Auto-provisioning** — New employee + position assignment → system auto-creates agent, binding, shared agent connections, and audit trail. Zero manual setup for IT.

#### 4. Security & Audit by Design

Security is not a feature — it's the architecture:

- **No open ports** — Admin Console accessed via SSM port forwarding or CloudFront with origin restricted to CloudFront managed prefix list. No security group rules exposing ports to the internet.
- **No hardcoded credentials** — Login password (`ADMIN_PASSWORD`) and JWT signing secret (`JWT_SECRET`) are environment variables. No secrets in source code.
- **Tenant isolation** — Each employee's agent runs in a separate Firecracker microVM with its own filesystem, network namespace, and memory space. One compromised agent cannot affect another.
- **IAM least privilege** — AgentCore execution role has only the permissions it needs: DynamoDB read/write, S3 read/write, SSM read, Bedrock invoke. No admin access, no wildcard policies.
- **Comprehensive audit trail** — Every agent invocation, tool execution, permission denial, SOUL change, and admin action is logged to DynamoDB with actor, timestamp, and detail. AI Insights scanner detects anomalies (unusual hours, excessive tool usage, SOUL version drift).
- **Memory privacy** — Employee memory files (MEMORY.md, daily memories) are private. Managers see aggregated usage stats but cannot read memory content. Memory writeback excludes assembled files (SOUL.md, AGENTS.md, TOOLS.md) to prevent employees from overriding IT policies.

#### 5. File-First Knowledge

Following OpenClaw's philosophy, knowledge is stored as Markdown files in S3 — not in a vector database. Agents read documents via the `workspace/knowledge/` directory.

- Zero infrastructure cost (no OpenSearch, no Pinecone, no embedding pipeline)
- Human-readable and auditable (it's just Markdown)
- Scope-controlled (Engineering docs vs. Finance docs vs. HR docs)
- Upload via Admin Console, full-text search across all documents
- Bedrock Knowledge Base integration planned for v1.1 (hybrid retrieval)

#### 6. Three-Layer SOUL Architecture

Agent identity is composed from three layers, each managed by a different stakeholder:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: GLOBAL (IT locked — CISO + CTO approval)      │
│  Company policies, security red lines, data handling     │
│  "Never share customer PII. Never execute rm -rf."       │
├─────────────────────────────────────────────────────────┤
│  Layer 2: POSITION (Department admin managed)            │
│  Role expertise, tool permissions, knowledge scope       │
│  "You are a Finance Analyst. Use excel-gen, not shell."  │
├─────────────────────────────────────────────────────────┤
│  Layer 3: PERSONAL (Employee self-service)               │
│  Communication preferences, custom instructions          │
│  "I prefer concise answers. Always use TypeScript."      │
└─────────────────────────────────────────────────────────┘
                        ↓ merge
              Final SOUL.md (what OpenClaw reads)
```

The merged SOUL.md is what the agent reads. An SA agent and a Finance agent use the same LLM but have completely different identities, capabilities, and boundaries. The merge order ensures Global rules always take precedence — employees cannot override security policies through personal preferences.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Admin Console (React + FastAPI)                             │
│  ├── 19 admin pages (org, agents, SOUL editor, monitor...)  │
│  ├── 5 employee portal pages (chat, profile, usage...)      │
│  ├── 3-role RBAC (admin / manager / employee)               │
│  └── All data from DynamoDB + S3 (zero hardcoded values)    │
├─────────────────────────────────────────────────────────────┤
│  Tenant Router                                               │
│  ├── Derives tenant_id from channel + user identity          │
│  ├── Routes to AgentCore Runtime                             │
│  └── Stateless — all state in AgentCore + S3 + SSM          │
├─────────────────────────────────────────────────────────────┤
│  AgentCore Runtime (Firecracker microVM per tenant)          │
│  ├── workspace_assembler.py → 3-layer SOUL merge from S3    │
│  ├── skill_loader.py → role-filtered skills from S3          │
│  ├── OpenClaw CLI → Bedrock (Nova 2 Lite / Sonnet / Pro)    │
│  ├── Watchdog → memory writeback to S3 every 60s            │
│  └── Usage tracking → DynamoDB write per invocation          │
├─────────────────────────────────────────────────────────────┤
│  AWS Services                                                │
│  ├── DynamoDB — org, agents, bindings, audit, usage          │
│  ├── S3 — SOUL templates, skills, workspaces, knowledge      │
│  ├── SSM — tenant→position mappings, skill API keys          │
│  ├── Bedrock — LLM inference (Nova 2 Lite default)           │
│  └── CloudWatch — agent invocation logs                      │
└─────────────────────────────────────────────────────────────┘
```

## Gateway Architecture: One Bot, All Employees

A single OpenClaw Gateway on EC2 serves as the unified IM connection layer for the entire organization. IT Admin creates one Bot per IM platform (one Discord Bot, one Telegram Bot, one Slack App), and all employees share it.

```
IT Admin (one-time setup):
  Discord  → Create 1 Bot "ACME Agent" → Connect to Gateway
  Telegram → Create 1 Bot @acme_bot    → Connect to Gateway
  Slack    → Create 1 App              → Connect to Gateway
  WhatsApp → Link 1 number             → Connect to Gateway

All employees use the same Bot, but get different Agents:

  Carol DMs @ACME Agent → Gateway → H2 Proxy extracts user_id → Tenant Router
    → AgentCore microVM (Carol's Finance Analyst SOUL) → Bedrock → reply

  Wang Wu DMs @ACME Agent → Gateway → H2 Proxy extracts user_id → Tenant Router
    → AgentCore microVM (Wang Wu's SDE SOUL) → Bedrock → reply
```

The Gateway doesn't do AI inference — it only manages IM connections. When a message arrives, OpenClaw's AWS SDK call to Bedrock is intercepted by the H2 Proxy, which extracts the sender's platform user ID and forwards to the Tenant Router. The Router derives a unique `tenant_id` and invokes AgentCore, which creates an isolated Firecracker microVM with the employee's personalized SOUL.

### Employee Onboarding Flow

When a new employee joins the company and needs their AI agent:

```
Step 1: Employee joins company Discord/Slack/Telegram
        (or IT sends them an invite link)

Step 2: Employee DMs the company Bot for the first time
        Bot replies: "Pairing code: KFDAF3GN"

Step 3: IT Admin opens Admin Console → Bindings → IM User Mappings
        Clicks "Add Mapping":
          Channel: Discord
          Platform User ID: 1460888812426363004 (from pairing message)
          Employee: Carol Zhang (Finance Analyst)
        → System writes SSM mapping + approves pairing

Step 4: Employee sends another message
        → Gateway allows it (pairing approved)
        → H2 Proxy extracts Discord user_id
        → Tenant Router resolves: user_id → emp-carol → pos-fa
        → AgentCore creates microVM with Finance Analyst SOUL
        → Agent responds as "ACME Corp Finance Analyst"

Step 5: From now on, every DM from Carol goes to her personal Agent
        with her SOUL identity, permissions, memory, and skills.
```

Zero configuration for the employee. They just DM the Bot. IT Admin does a one-click approval + binding in the Admin Console.

For employees who don't use IM tools, the Web Portal provides the same experience — login with employee ID, chat with their bound Agent directly in the browser.

## Key Features

| Feature | How It Works |
|---------|-------------|
| **SOUL Injection** | 3-layer merge (Global + Position + Personal) → OpenClaw reads merged SOUL.md at session start |
| **Permission Control** | SOUL.md defines allowed/blocked tools per role. Plan A (pre-execution) + Plan E (post-audit) |
| **Skill Filtering** | 26 skills with `allowedRoles`/`blockedRoles` in manifest. Finance gets excel-gen, SDE gets github-pr |
| **Memory Persistence** | Watchdog syncs workspace to S3 every 60s. Next session loads previous memory |
| **Real-time Usage** | Every invocation writes tokens/cost to DynamoDB. Admin Console shows per-agent breakdown |
| **Manager Scoping** | API-level filtering — managers see only their department's data (BFS sub-department rollup) |
| **Employee Portal** | Browser-based chat with bound agent. No IM tool dependency |
| **Knowledge Base** | Markdown files in S3. Upload via Admin Console, agents read via workspace/knowledge/ |
| **Audit Trail** | Every action logged to DynamoDB. AI Insights scan for anomalies |
| **Export** | Audit CSV export, usage CSV export from Admin Console |

## Security Model

| Layer | Mechanism | Detail |
|-------|-----------|--------|
| **Network** | No open ports | SSM port forwarding or CloudFront (origin restricted to CloudFront managed prefix list `pl-3b927c52`) |
| **Credentials** | Environment variables only | `ADMIN_PASSWORD` and `JWT_SECRET` are never in source code. JWT secret generated via `openssl rand -hex 32` |
| **Compute** | Firecracker microVM isolation | Each agent runs in a separate microVM with its own filesystem, network, and memory space |
| **IAM** | Least privilege | AgentCore role: DynamoDB, S3, SSM, Bedrock only. No admin access, no wildcard policies |
| **Data** | Role-based scoping | Admin: all data. Manager: own department (BFS rollup). Employee: own data only. Enforced at API level |
| **Agent** | SOUL-based permission control | Plan A: pre-execution tool allowlist in SOUL.md. Plan E: post-response audit scan for blocked tool usage |
| **Audit** | Comprehensive logging | Every invocation, tool call, permission denial, config change → DynamoDB. AI Insights anomaly detection |
| **Memory** | Privacy by design | Employee memory files are private. Writeback excludes assembled files to prevent policy override |
| **Knowledge** | Scope-controlled access | Department-scoped knowledge bases. Finance docs invisible to Engineering agents |

## Quick Start

### Prerequisites

- AWS CLI v2.27+ / Node.js 18+ / Python 3.10+ / Docker
- SSM Session Manager Plugin ([install](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html))

### Step 1: Deploy Infrastructure

```bash
cd enterprise
bash deploy-multitenancy.sh <STACK_NAME> <REGION>
# Example: bash deploy-multitenancy.sh openclaw-multitenancy us-east-1
# Creates: EC2 Gateway, ECR, S3, IAM roles, AgentCore Runtime (~10 min)
cd ..   # back to repo root
```

Get outputs:
```bash
STACK_NAME="openclaw-multitenancy"
REGION="us-east-1"

INSTANCE_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' --output text)
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`TenantWorkspaceBucketName`].OutputValue' --output text)
```

### Step 2: Create DynamoDB Table

```bash
aws dynamodb create-table \
  --table-name openclaw-enterprise \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S AttributeName=GSI1SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes '[{"IndexName":"GSI1","KeySchema":[{"AttributeName":"GSI1PK","KeyType":"HASH"},{"AttributeName":"GSI1SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST --region us-east-2
```

### Step 3: Seed Sample Organization

This creates a sample company (ACME Corp) with 20 employees, 20 agents, 10 positions across 7 departments.

```bash
cd enterprise/admin-console/server   # from repo root
pip install boto3 requests
export S3_BUCKET="$S3_BUCKET"

# DynamoDB seeds
python3 seed_dynamodb.py --region us-east-2          # org structure, employees, agents
python3 seed_audit_approvals.py --region us-east-2   # audit log, approval queue
python3 seed_usage.py --region us-east-2             # usage metrics, sessions
python3 seed_routing_conversations.py --region us-east-2  # routing rules, conversations
python3 seed_roles.py --region us-east-2             # RBAC roles
python3 seed_settings.py --region us-east-2          # model + security config

# SSM seeds (same region as AgentCore)
python3 seed_ssm_tenants.py --region us-east-1 --stack $STACK_NAME  # tenant→position mappings

# S3 seeds
python3 seed_skills_final.py                         # 26 skills (auto-detects bucket)
python3 seed_workspaces.py                           # employee workspaces (auto-detects)
python3 seed_all_workspaces.py --bucket "$S3_BUCKET" # remaining workspaces
python3 seed_knowledge_docs.py --bucket "$S3_BUCKET" # 12 knowledge documents
```

### Step 4: Deploy Admin Console

```bash
# Build frontend
cd enterprise/admin-console
npm install
npm run build
cd ../..   # back to repo root

# Package and upload
COPYFILE_DISABLE=1 tar czf /tmp/admin-deploy.tar.gz -C enterprise/admin-console dist server
aws s3 cp /tmp/admin-deploy.tar.gz "s3://${S3_BUCKET}/_deploy/admin-deploy.tar.gz"

# Install on EC2 (via SSM — no SSH needed)
aws ssm send-command --instance-ids $INSTANCE_ID --region $REGION \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":[
    "python3 -m venv /opt/admin-venv",
    "/opt/admin-venv/bin/pip install fastapi uvicorn boto3 requests",
    "aws s3 cp s3://'"$S3_BUCKET"'/_deploy/admin-deploy.tar.gz /tmp/admin-deploy.tar.gz",
    "mkdir -p /opt/admin-console && tar xzf /tmp/admin-deploy.tar.gz -C /opt/admin-console",
    "chown -R ubuntu:ubuntu /opt/admin-console /opt/admin-venv"
  ]}'
```

Create systemd service (replace `<YOUR_PASSWORD>`):
```bash
aws ssm send-command --instance-ids $INSTANCE_ID --region $REGION \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":[
    "printf \"[Unit]\nDescription=OpenClaw Admin Console\nAfter=network.target\n\n[Service]\nType=simple\nUser=ubuntu\nWorkingDirectory=/opt/admin-console/server\nEnvironment=AWS_REGION=us-east-2\nEnvironment=CONSOLE_PORT=8099\nEnvironment=TENANT_ROUTER_URL=http://localhost:8090\nEnvironment=ADMIN_PASSWORD=<YOUR_PASSWORD>\nEnvironment=JWT_SECRET=$(openssl rand -hex 32)\nExecStart=/opt/admin-venv/bin/python main.py\nRestart=always\n\n[Install]\nWantedBy=multi-user.target\n\" > /etc/systemd/system/openclaw-admin.service",
    "systemctl daemon-reload && systemctl enable openclaw-admin && systemctl start openclaw-admin"
  ]}'
```

### Step 5: Access

```bash
aws ssm start-session --target $INSTANCE_ID --region $REGION \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8099"],"localPortNumber":["8199"]}'
# Open http://localhost:8199
```

### Local Development (no AgentCore)

```bash
cd enterprise/admin-console && npm install && npm run dev   # Frontend on :3000

cd enterprise/admin-console/server
pip install -r requirements.txt
export ADMIN_PASSWORD="your-password" JWT_SECRET=$(openssl rand -hex 32) AWS_REGION=us-east-2
python3 main.py                                             # Backend on :8099
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_PASSWORD` | Yes | Login password for all accounts |
| `JWT_SECRET` | Yes | JWT signing secret (`openssl rand -hex 32`) |
| `AWS_REGION` | Yes | DynamoDB region (default: us-east-2) |
| `CONSOLE_PORT` | No | Admin Console port (default: 8099) |
| `TENANT_ROUTER_URL` | No | Tenant Router URL (default: http://localhost:8090) |
| `DYNAMODB_TABLE` | No | DynamoDB table name (default: openclaw-enterprise) |
| `DYNAMODB_REGION` | No | DynamoDB region for agent container (default: us-east-2) |

## Sample Organization

The seed scripts create ACME Corp — a B2B SaaS company with:

| | Count | Details |
|-|-------|---------|
| Departments | 13 | 7 top-level + 6 sub-departments |
| Positions | 11 | SA, SDE, DevOps, QA, AE, PM, FA, HR, CSM, Legal, Executive |
| Employees | 22 | Each with workspace files in S3 |
| Agents | 22 | 20 personal (1:1) + 2 shared (Help Desk, Onboarding) |
| Skills | 26 | 6 global + 20 department-scoped, 3 layers |
| Knowledge Docs | 12 | Company policies, architecture standards, runbooks, etc. |
| SOUL Templates | 11 | 1 global + 10 position-specific |
| RBAC Roles | 3 | Admin (2), Manager (3), Employee (17) |

### Demo Accounts

| Employee ID | Name | Role | What They See |
|-------------|------|------|--------------|
| emp-z3 | Zhang San | Admin | Full Admin Console |
| emp-jiade | JiaDe Wang | Admin | Full Admin Console (Discord-connected, SA full tools) |
| emp-lin | Lin Xiaoyu | Manager | Product department only |
| emp-mike | Mike Johnson | Manager | Sales department only |
| emp-peter | Peter Wu | Manager | Engineering (Executive, Discord-connected, no shell/code) |
| emp-w5 | Wang Wu | Employee | Portal: SDE Agent (full dev tools) |
| emp-carol | Carol Zhang | Employee | Portal: Finance Agent (Excel + SAP only, no shell) |
| emp-emma | Emma Chen | Employee | Portal: CSM Agent |

## What to Test

### 1. SOUL Injection (core differentiator)
Login as Carol (Employee) → Chat → "Who are you?" → **"ACME Corp Finance Analyst"**
Login as Wang Wu (Employee) → Chat → "Who are you?" → **"ACME Corp Software Engineer"**
Same LLM, completely different identities.

### 2. Permission Boundaries
Carol: "Run git status" → **Refused** (Finance role has no shell)
Wang Wu: "Run git status" → **Executed** (SDE role has shell access)
JiaDe (Discord): Full shell/code access (SA role)
Peter (Discord): "Run ls" → **Refused** (Executive role, no shell/code)

### 3. Manager Data Scoping
Login as Lin Xiaoyu (Manager) → Dashboard → **Only Product department data visible**

### 4. Real-time Usage
Send messages in Portal → Usage & Cost page updates with **real token counts from DynamoDB**
By Model tab shows **real model distribution** from DynamoDB usage records

### 5. Memory Persistence
Carol tells agent "Remember: I prefer EBITDA analysis" → Agent writes to memory →
Memory file syncs to S3 → Next session, agent remembers the preference

### 6. LLM Model Management (Settings)
Settings → LLM Provider → **Change default model** (writes to DynamoDB)
**Add position override** (e.g., SA uses Claude Sonnet, Finance uses Nova Pro)
Changes take effect on next agent cold start — no redeployment needed

### 7. IT Admin Assistant
Click the **floating chat bubble** (bottom-right) → Chat with the IT Admin Agent
This agent runs on the Gateway EC2 with full system access (shell, file, browser)
Try: "Check Gateway service status" or "Show recent CloudWatch logs"

### 8. Workspace Explorer
Workspace Manager → Select an agent → **M3 collapsible tree** with folders
Click any .md file → **Rendered markdown** (tables, code blocks, lists)
Toggle Raw/Rendered view for source inspection

## Design System

The Admin Console uses a custom design system inspired by **Material Design 3 Expressive** and **Gemini AI Visual Design**:

- **M3 Tonal Surface System** — 6 surface levels (surface-dim → surface-container-highest) for depth without borders
- **Spring Physics Motion** — Overshoot bounce for modals/cards, scale press for buttons, spring toggle for switches
- **Gemini Gradients** — Pulsing gradient animations for loading states, shimmer effects for skeletons
- **Dark/Light Theme** — Toggle in sidebar bottom, persisted to localStorage, smooth 400ms transition
- **Rounded Shapes** — 20px cards, 28px modals, 16px buttons (M3 large radius)
- **Accessible Status Indicators** — Ping animation for active, pulse for pending, color-coded dots

## Project Structure

```
enterprise/
├── README.md                              # This file
├── ROADMAP.md                             # Product roadmap
├── deploy-multitenancy.sh                 # One-click deployment script
├── clawdbot-bedrock-agentcore-multitenancy.yaml  # CloudFormation template
├── docs/                                  # Design documents
│   ├── prd.md                             # Product requirements
│   ├── architecture.md                    # Technical architecture deep-dive
│   ├── rbac-portal-design.md              # RBAC + Portal design
│   ├── skill-platform-design.md           # Skill architecture
│   └── cold-start-optimization-design.md  # Performance optimization
├── admin-console/                         # React frontend + FastAPI backend
│   ├── src/                               # 24 pages (19 admin + 5 portal)
│   │   ├── components/                    # UI components (M3 design system)
│   │   │   ├── ui.tsx                     # Card, Button, Badge, Modal, Table, Tabs, etc.
│   │   │   ├── Layout.tsx                 # Admin sidebar + top bar + search
│   │   │   ├── PortalLayout.tsx           # Employee portal sidebar
│   │   │   ├── AdminAssistant.tsx         # Floating IT Admin chat bubble
│   │   │   └── ClawForgeLogo.tsx          # Animated logo component
│   │   ├── contexts/                      # React contexts
│   │   │   ├── AuthContext.tsx             # JWT auth + role-based routing
│   │   │   └── ThemeContext.tsx            # Dark/light theme toggle
│   │   └── pages/                         # All page components
│   └── server/                            # FastAPI backend + seed scripts
│       ├── main.py                        # 40+ API endpoints
│       ├── db.py                          # DynamoDB single-table operations
│       ├── s3ops.py                       # S3 file operations
│       ├── auth.py                        # JWT authentication
│       └── seed_*.py                      # 10 seed scripts for sample data
├── agent-container/                       # Docker image for AgentCore
│   ├── Dockerfile                         # Multi-stage ARM64 build
│   ├── entrypoint.sh                      # S3 sync + workspace assembly
│   ├── server.py                          # HTTP server + dynamic model config
│   ├── workspace_assembler.py             # 3-layer SOUL merge
│   └── skill_loader.py                    # Role-filtered skill loading
├── gateway/                               # EC2 Gateway components
│   ├── bedrock_proxy_h2.js                # H2 Proxy — intercepts Bedrock SDK
│   └── tenant_router.py                   # Tenant Router — routes to AgentCore
├── auth-agent/                            # Authorization Agent (approval flow)
└── demo/                                  # Interactive demo
    ├── README.md                          # Demo guide with scenarios
    └── images/                            # Screenshots for README
```

## Cost Estimate

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| EC2 (c7g.large) | ~$52 | Gateway + Tenant Router + Admin Console |
| DynamoDB | ~$1 | Pay-per-request, ~2000 writes/day |
| S3 | < $1 | Workspace files, skills, knowledge docs |
| Bedrock (Nova 2 Lite) | ~$5-15 | ~100 conversations/day |
| AgentCore | Included | Firecracker microVMs, pay per invocation |
| **Total** | **~$60-70/mo** | For 20 agents, ~100 conversations/day |

Compared to ChatGPT Team ($25/user/month × 20 = $500/month), this is **85% cheaper** with full enterprise controls.

## How It Compares

| Capability | ChatGPT Team | Microsoft Copilot | OpenClaw Enterprise |
|-----------|-------------|-------------------|-------------------|
| Per-employee identity control | ❌ Same for all | ❌ Same for all | ✅ 3-layer SOUL per role |
| Tool permission per role | ❌ | ❌ | ✅ Plan A + Plan E |
| Department data scoping | ❌ | Partial | ✅ API-level BFS rollup |
| Memory persistence | ❌ Session only | ❌ | ✅ S3 writeback, cross-session |
| Self-hosted, no data leaves your VPC | ❌ | ❌ | ✅ Bedrock in your account |
| Open source, no vendor lock-in | ❌ | ❌ | ✅ OpenClaw + AWS native |
| Cost for 20 users | $500/mo | $600/mo | ~$65/mo |

---

Built by [wjiad@aws](mailto:wjiad@amazon.com) · [aws-samples](https://github.com/aws-samples) · Contributions welcome
