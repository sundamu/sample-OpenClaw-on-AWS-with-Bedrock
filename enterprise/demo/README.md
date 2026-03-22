# OpenClaw Enterprise — Demo Guide

Explore the platform without deploying. This folder contains a standalone static demo and guided walkthroughs.

## Quick Start

```bash
# Open the interactive demo (no server needed)
open enterprise/demo/index.html
# or: python3 -m http.server 8080 -d enterprise/demo && open http://localhost:8080
```

## What's in the Demo

The static demo (`index.html`) is a self-contained single-file application that mirrors the real Admin Console + Employee Portal. It uses mock data to simulate a fully populated ACME Corp deployment.

### Pages You Can Explore

| Page | What It Shows | Key Insight |
|------|--------------|-------------|
| Dashboard | 6 KPI cards, conversation trend, agent health, channel distribution | Real-time org-wide visibility |
| Organization | 7 departments, 13 sub-departments in tree view | Hierarchical org management |
| Positions | 10 roles (SA, SDE, DevOps, QA, AE, PM, FA, HR, CSM, Legal) | Position-based agent templates |
| Employees | 20 employees with activity metrics, channel status | Per-employee agent binding |
| Agent Factory | 20 agents (18 personal + 2 shared), status, quality scores | Centralized agent lifecycle |
| SOUL Editor | Three-layer editor: Global (locked) → Position → Personal | Core differentiator — identity injection |
| Workspace | File tree with S3 read/write, version history | Full workspace visibility |
| Skill Platform | 26 skills with role-based permissions, API Key Vault | Governed skill marketplace |
| Knowledge Base | 12 Markdown documents, scope-controlled access | File-first knowledge management |
| Bindings & Routing | Employee↔Agent bindings, routing rules | Multi-channel message routing |
| Monitor | Live sessions, agent health metrics, alert rules | Real-time operational awareness |
| Audit Center | AI Insights, event timeline, security alerts | Compliance and anomaly detection |
| Usage & Cost | Per-department, per-agent, per-model breakdown | Cost governance at every level |
| Approvals | Pending/resolved approval queue | Human-in-the-loop for sensitive ops |
| Settings | LLM model config, security policies, service status | Centralized platform configuration |
| Employee Portal | Chat interface, profile editor, personal usage | What employees actually see |

### Demo Scenarios to Try

**Scenario 1: SOUL Injection (2 min)**
1. Open Agent Factory → click any agent
2. Open SOUL Editor → see three layers: Global (locked by IT), Position (dept admin), Personal (employee)
3. Notice: Global layer has "CRITICAL IDENTITY OVERRIDE" — this is what makes Carol say "I'm a Finance Analyst" instead of "I'm an AI assistant"

**Scenario 2: Permission Boundaries (2 min)**
1. Open Skill Platform → filter by "Engineering" scope
2. Notice: `shell`, `github-pr`, `code-execution` are allowed for SDE but blocked for Finance
3. Open Audit Center → AI Insights tab → see "Repeated shell access attempts from Intern role"

**Scenario 3: Manager Data Scoping (1 min)**
1. Login as "Lin Xiaoyu" (Manager) — only Product department data visible
2. Switch to "Zhang San" (Admin) — full org data visible
3. This is API-level enforcement, not just UI hiding

**Scenario 4: Employee Self-Service (2 min)**
1. Switch to Employee Portal (login as emp-carol)
2. Chat with Finance Agent — markdown rendering, tool call indicators
3. Open My Profile — edit USER.md preferences
4. Open My Usage — see personal token consumption

**Scenario 5: Cost Governance (1 min)**
1. Open Usage & Cost → Department tab → see per-dept breakdown
2. Switch to Budget tab → see budget vs actual with warning thresholds
3. Compare: 20 agents at ~$65/mo vs ChatGPT Team at $500/mo

## Mock Data Summary

| Entity | Count | Source |
|--------|-------|--------|
| Departments | 13 | 7 top-level + 6 sub-departments |
| Positions | 10 | SA, SDE, DevOps, QA, AE, PM, FA, HR, CSM, Legal |
| Employees | 20 | Mixed Chinese/English names, 3 roles |
| Agents | 20 | 18 personal (1:1) + 2 shared (Help Desk, Onboarding) |
| Skills | 26 | 6 global + 20 department-scoped |
| Knowledge Docs | 12 | Policies, architecture, runbooks, case studies |
| Audit Entries | 20 | Config changes, invocations, denials |
| Usage Records | 140 | 20 agents × 7 days |
| Sessions | 8 | Active conversations with turn counts |

## Relationship to Production

| Aspect | Demo (this folder) | Production (admin-console/) |
|--------|-------------------|---------------------------|
| Data source | Embedded JSON mock | DynamoDB + S3 |
| Agent chat | Simulated responses | Real Bedrock via AgentCore |
| SOUL editing | Read-only preview | Real S3 read/write |
| Authentication | Role switcher buttons | JWT with password |
| Deployment | `open index.html` | CloudFormation + EC2 |

## Files

```
demo/
├── README.md      # This file
└── index.html     # Self-contained static demo (single file, no dependencies)
```
