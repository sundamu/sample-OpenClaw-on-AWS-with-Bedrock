# Work Log — 2026-04-13 Full Session

> Duration: ~12 hours (two major phases)
> Environments: Production (ap-northeast-1 openclaw-jiade2), Test (us-east-2 openclaw-e2e-test)

---

## Phase A: Frontend Rewrites + E2E Testing (earlier session)

### Completed
- 6 frontend pages rewritten: Monitor, AuditLog, Usage, Playground, Settings, SecurityCenter
- useApi.ts: 8 new hooks added, 3 endpoints fixed
- Frontend build: 0 TypeScript errors
- Deployed to production (ap-northeast-1) + test (us-east-2)
- 179-test E2E suite: 163 pass / 7 fail / 2 skip on test env
- Fixed 2 real bugs: Float→Decimal in db.py, transact_write TypeSerializer

### Bug Fixes
- `db.py _put_item()`: Added `_sanitize_floats()` — Python float → Decimal for DynamoDB
- `db.py transact_write()`: Added `TypeSerializer` — resource format → DynamoDB JSON format
- `AuditLog.tsx`: Fixed NaN% in Compliance — enforcementRate is object not number
- `SecurityCenter.tsx`: Dynamic AWS region URLs (was hardcoded us-east-1)

---

## Phase B: Tools & Skills + Production Data + Architecture Fixes

### Tools & Skills Module (Phase 1-3)

**Phase 1 — Make skills work:**
- Rewrote `skill_loader.py`: DynamoDB role lookup (was broken SSM path)
- Fixed `agents.py` assign/unassign: added audit + bump_config_version + force refresh
- Added `PUT /skills/keys/{skill}/{env}` endpoint
- Modified `excel-gen/tool.js` + `aws-nova-canvas/tool.js`: output to workspace/output/
- Added `_enforce_workspace_budget()` in workspace_assembler.py (100MB limit)
- Modified `entrypoint.sh`: clean output/ on session restore, exclude output/ from cold start sync
- Rewrote `seed_skills_final.py`: 26 → 5 real skills
- Uploaded 5 tool.js files to S3
- Cleaned 21 manifest-only skills from S3
- Assigned 5 seed skills to positions
- 18 unit tests, 164/164 regression pass

**Phase 2 — Unified "Tools & Skills" page:**
- New `ToolsSkills/index.tsx`: card grid + Tools/Skills/Under Review/API Keys tabs
- New `ToolsSkills/Detail.tsx`: detail page with Description/Configuration/Details tabs
- MCP Registry-style card design (title link, 4-line description, team/org, tag badges)
- Route: `/skills/:itemId` for detail pages
- Sidebar renamed "Skill Market" → "Tools & Skills"
- 6 built-in tools as first-class items alongside skills

**Phase 3 — Employee submission + review flow:**
- New endpoints: POST /portal/skills/submit, POST /portal/skills/{id}/request
- Admin endpoints: GET /tools-skills/pending, POST /tools-skills/{id}/review
- POST /tools-skills/{id}/approve-install (writes EMP#.personalSkills)
- GET /tools-skills/{id}/code (code viewer for review)
- skill_loader.py: added `load_personal_skills()` from EMP#.personalSkills
- New hooks: usePendingSkills, useSubmitSkill, useRequestSkill, useReviewSkill, useSkillCode, useApproveSkillInstall
- Under Review tab with approve/reject/review code buttons

### Production Environment Setup

**Infrastructure created:**
- 3 new IAM execution roles (restricted, engineering, executive)
- 2 Bedrock Guardrails (strict: elk5damd3rvk, moderate: ztr7izsru5qe)
- 3 new AgentCore Runtimes + updated Standard runtime
- 7 position→runtime assignments
- Guardrails bound via GUARDRAIL_ID environment variable
- EC2 instance role: added AgentCore CRUD + PassRole + ListRoles + Guardrail permissions
- DynamoDB TTL enabled for session takeover

**4-Tier Runtime Architecture:**

| Runtime | Model | IAM Role | Guardrail | Idle | Max | Positions |
|---------|-------|----------|-----------|------|-----|-----------|
| Standard | MiniMax M2.5 | Full (agentcore-execution) | Moderate (PII) | 15m | 8h | AE,CSM,HR,PM |
| Restricted | DeepSeek V3.2 | Read-only DDB/S3 | Strict (topic deny+PII) | 10m | 4h | FA,Legal |
| Engineering | Claude Sonnet 4.5 | Full + DDB delete | None | 30m | 8h | SDE,DevOps,QA |
| Executive | Claude Sonnet 4.6 | Broadest (ECR+SSM) | None | 60m | 8h | Exec,SA |

**Data Generation:**
- 40+ real Bedrock Converse conversations across all tiers
- 4 AgentCore live portal chat sessions
- Usage data seeded: 7 days × 20 agents
- Audit entries: 173+ (invocation, tool_execution, permission_denied, guardrail_block, config_change)
- Compliance: 86.1% enforcement rate, 24 blocked events
- Sessions: 10 realistic sessions with role-appropriate messages
- Bindings: 20 portal bindings
- Knowledge bases: 11 (seeded DynamoDB metadata)

**Docker Image Rebuild:**
- Rebuilt on production EC2, pushed to ECR
- Contains: updated workspace_assembler, skill_loader, server.py, permissions.py
- All 4 runtimes updated to use new image

### Critical Bugs Found & Fixed

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Model "on-demand throughput not supported" | Model ID missing `global.` prefix | Changed to `global.anthropic.claude-sonnet-4-6` |
| Agent doesn't know employee identity | Docker image was old (April 9), workspace_assembler never rebuilt | Docker rebuild + ECR push + runtime update |
| Playground 502 error on complex tasks | server.py single-thread HTTPServer — healthcheck blocks agent request | Code changed to ThreadingMixIn (needs next Docker rebuild) |
| Tenant Router request blocking | Single-thread HTTPServer — healthcheck BrokenPipeError blocks requests | Changed to ThreadingMixIn, deployed immediately |
| Compliance shows NaN% | enforcementRate is object {rate, total, blocked}, frontend treated as number | Fixed frontend to handle both formats |
| Infrastructure IAM Roles = 0 | EC2 instance role missing iam:ListRoles | Added inline policy |
| Agent cold-starting interruptions | Runtime update clears all sessions; model changes need force refresh | Added "Force Refresh All Sessions" button to Playground |

### deploy.sh Fixes
- Added ADMIN_PASSWORD to /etc/openclaw/env (was only in SSM)
- Added seed_knowledge.py to Step 6 seeding
- Changed default model from Nova Lite to Claude Sonnet 4.5
- CloudFormation template: added AgentCore CRUD + PassRole + ListRoles + Guardrail permissions

---

## Architecture Issues Discovered

### Critical — Affect User Experience
1. **server.py single-thread** — microVM healthcheck blocks agent requests → 502 on complex tasks (code fixed, needs Docker rebuild)
2. **Gateway startup timeout** — OpenClaw Gateway needs >30s to start in microVM → tools unavailable during cold start
3. **Cold start latency** — 25 seconds for new microVM, no good loading UI
4. **Session invalidation on runtime update** — Changing model/guardrail/env vars clears ALL sessions

### Important — Operational
5. **No ALB** — CloudFront → EC2 public IP, IP changes on restart
6. **Health check noise** — GET / → 404 + BrokenPipeError floods logs
7. **H2 Proxy single-thread** — Node.js event loop, could block on slow Bedrock responses

### Logged for Next Session
- Full AgentCore problem analysis document
- Fargate architecture design as alternative
- deploy.sh: create 3 differentiated runtimes by default
- Monitor time range selector (Today/7d/30d)
- Playground: VM logs, session duration, tool call visualization
