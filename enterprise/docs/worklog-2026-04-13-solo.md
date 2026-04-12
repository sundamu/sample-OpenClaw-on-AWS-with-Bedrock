# Work Log — 2026-04-13 Solo Session (4 hours)

> Test environment: us-east-2, i-054cb53703d2ba33c, stack: openclaw-e2e-test
> Production: ap-northeast-1, i-0344c501e6bdd0649, stack: openclaw-jiade2

---

## Completed Items

### P0.1: Docker Image Rebuild + ECR Push — DONE
- Packaged agent-container source → S3
- SSM triggered Docker build on test EC2 (ARM64 Graviton)
- Build + push to ECR completed successfully
- New image: `263168716248.dkr.ecr.us-east-2.amazonaws.com/openclaw-e2e-test-multitenancy-agent:latest`
- **Issue found:** `/etc/openclaw/env` missing `ADMIN_PASSWORD` — had to manually add it. This is a deploy.sh bug: password goes to SSM but not to env file.

### P0.2: DynamoDB TTL Enable — DONE
- `aws dynamodb update-time-to-live --table-name openclaw-e2e-test --time-to-live-specification "Enabled=true,AttributeName=takeoverTTL"`
- Verified: `{"Enabled":true,"AttributeName":"takeoverTTL"}`

### P0.3: Guardrail Creation — DONE (test env)
- STRICT guardrail: `elma1c9few8v` v1 (topic denial: CodeExecution+SystemAdmin + PII: SSN/CC/AWS keys block + content filter)
- MODERATE guardrail: `imamuficks68` v1 (PII only: SSN/CC/AWS keys block + content filter, no topic denial)
- Both published to v1, status=READY
- **Issue: Guardrail binding to runtimes** — `create-agent-runtime` API does NOT accept guardrail params. Need to bind at workspace_assembler level or via SSM config. Recorded as separate TODO.

### P0.3 (production): Guardrails — DONE
- STRICT: `elk5damd3rvk` v1
- MODERATE: `ztr7izsru5qe` v1

### P0.4: EC2 Instance Role IAM Fix — DONE (test env)
- Added inline policy `AgentCoreManagementPolicy` to `openclaw-e2e-test-OpenClawInstanceRole-T0AZR3iL1xmg`
- Permissions: `bedrock-agentcore:Create/Update/Delete/Get/ListAgentRuntimes`, `iam:PassRole`, `iam:ListRoles`, `bedrock:*Guardrail*`

### IAM Execution Roles — DONE (test env)
Created 3 differentiated roles:
| Role | DynamoDB | S3 | SSM | Bedrock | Extra |
|------|----------|----|----|---------|-------|
| `restricted-execution-role` | Read-only (GetItem, Query, BatchGetItem) | Read-only (GetObject, ListBucket) | Read-only (GetParameter) | InvokeModel + ApplyGuardrail | — |
| `engineering-execution-role` | Full (+ DeleteItem) | Full (+ PutObject, DeleteObject) | Full (Get + Put) | InvokeModel | — |
| `executive-execution-role` | Full (+ Scan) | Full | Broad (GetParametersByPath + /openclaw/*) | InvokeModel + ListFoundationModels | ECR Describe |

### Runtimes — DONE (test env)
4 runtimes all READY:
| Runtime | IAM Role | Idle | Max Life | Positions |
|---------|----------|------|----------|-----------|
| `openclaw_e2e_test_runtime` (Standard) | agentcore-execution-role (full) | 5m | 1h | AE, CSM, HR, PM |
| `e2eTestRestrictedRuntime` | restricted (read-only) | 10m | 4h | FA, Legal |
| `e2eTestEngineeringRuntime` | engineering (full+delete) | 30m | 8h | SDE, DevOps, QA |
| `e2eTestExecutiveRuntime` | executive (broadest) | 60m | 8h | Exec, SA |

### Position→Runtime Assignment — DONE
7 positions assigned to non-default runtimes.

### P1.2: Auth Middleware — DONE
- No token → 401 ✓
- Employee login (Carol) → token ✓
- /auth/me as Carol → correct name + role ✓
- Portal profile as Carol → OK ✓

### P1.3: Atomic Provision — DONE
- Created test employee → agent + binding auto-provisioned ✓
- Agent exists in /agents ✓
- Binding exists in /bindings ✓
- **Issue:** Agent existence check in /agents list may return False if agent ID format changed. Needs investigation.

### P1.5: SOUL 3-Layer Pipeline — DONE
Verified 4 employees across tiers:
| Employee | Global | Position | Personal | Tools |
|----------|--------|----------|----------|-------|
| emp-carol (FA) | 204w | 253w | 0w | web_search, file |
| emp-ryan (SDE) | 204w | 188w | 0w | 6 tools (full) |
| emp-jiade (SA) | 204w | 219w | 0w | 6 tools (full) |
| emp-peter (Exec) | 204w | 248w | 0w | 6 tools (full) |

### Real Conversations — 20/20 PASS
All 20 conversations across 4 tiers successful. 131,205 total chars generated.
Role-appropriate content verified:
- Finance: cost/saving/ROI context ✓
- Legal: GDPR/compliance/article context ✓
- SDE: code blocks with def/class/import ✓
- AE/CSM: business/customer/email context ✓
- SA: architecture/region/VPC context ✓
- Exec: board/strategic/revenue context ✓

### Knowledge Bases — DONE
11 KBs seeded to DynamoDB, API returns all 11.

### Latest Frontend + Backend — DEPLOYED to test env
- Frontend dist (6 rewritten pages) deployed
- Backend server (7 rewritten modules) deployed
- Service restarted and active

---

## Data Verification Summary (test env)

| Metric | Value |
|--------|-------|
| Employees | 21 (20 seed + 1 provision test) |
| Agents | 20 |
| Positions | 11 |
| Runtimes | 4 (all READY) |
| Position→Runtime | 7 assigned |
| Knowledge Bases | 11 |
| Audit entries | 6 (agent_invocation:4, config_change:2) |
| Monitor events | 6 in last 60 min |
| Compliance | enforcement rate 100% (6/6, 0 blocked) |
| Insights | 1 finding (low severity) |
| Quality score (Carol) | 4.5/5.0 |

---

## Issues Found

1. **deploy.sh: ADMIN_PASSWORD not in env file** — SSM stores it but `/etc/openclaw/env` doesn't have it. `main.py` reads from `os.environ` which loads from EnvironmentFile. Fix: deploy.sh Step 7 should add `ADMIN_PASSWORD` to the env file.

2. **Guardrail cannot bind to runtime via API** — `create-agent-runtime` and `update-agent-runtime` don't accept guardrailId/guardrailVersion params. Need to implement at workspace_assembler level (read guardrail config from DynamoDB/SSM, pass to Bedrock Converse `guardrailConfig`).

3. **Production IAM: iam:PassRole missing** — EC2 instance role in production (openclaw-jiade2) cannot create/update runtimes. Need same IAM fix as test env.

---

## Remaining TODO

### P2: Frontend Fixes (10 items)
- [ ] 2.1 Organization: Remove Default Channel from modals
- [ ] 2.2 Organization: Active Agents stat fix
- [ ] 2.3 Organization: SOUL Configured stat fix
- [ ] 2.4 Agent Factory: Delete Agent button + modal
- [ ] 2.5 Agent Factory: Refresh Agent button
- [ ] 2.6 Agent Factory: SoulEditor 409 Conflict
- [ ] 2.7 Portal: My Agent Identity page
- [ ] 2.8 Knowledge: Search results format
- [ ] 2.9 Knowledge: Upload 413 error message
- [ ] 2.10 Security Center: Runtime card show guardrail + positions

### Deploy.sh Fixes
- [x] Add ADMIN_PASSWORD to /etc/openclaw/env in Step 7 — DONE (line 500)
- [x] Add seed_knowledge.py to Step 6 seeding — DONE (before seed_knowledge_docs.py)
- [ ] Add AgentCoreManagementPolicy to CloudFormation template instance role

### Frontend P2 Fixes
- [x] P2.4 Agent Factory: Delete Agent button + confirmation modal — DONE
- [x] P2.10 Security Center: Runtime card shows assigned positions — DONE
- [x] P2.1 Default Channel: Already removed (Positions.tsx)
- [x] P2.5 Refresh Agent: Already done (AgentDetail.tsx)
- [x] P2.8 KB search: Already compatible (r.name || r.doc)
- [x] P2.9 Upload 413: Already done ("too large" message)

### E2E Test Script Fixes
- [x] S3_BUCKET + REGION read from /etc/openclaw/env (portable across envs)
- [x] T16.2 portal profile: nested under employee.name
- [x] T17.3 twin chat: reply vs response field
- 163/176 pass, 11 fail (5 are seed data gaps, 4 are assertion bugs, 2 are real bugs)

### Real Bugs Found & Fixed
- 10.2: **Float→Decimal in DynamoDB** — db.py `_put_item` now calls `_sanitize_floats()` to convert Python floats to `Decimal`. Model switch now works. [FIXED]
- 20.1: **transact_write serialization** — `transact_write()` used low-level DynamoDB client but passed high-level resource format items. Added `TypeSerializer` conversion. Auto-provision now works atomically. [FIXED]
- Both fixes verified on test env: 10.2 PASS + 20.1 PASS

### CloudFormation Template Fix
- [x] Added AgentCore CRUD permissions to OpenClawInstanceRole (Create/Update/Delete/List)
- [x] Added iam:PassRole for bedrock-agentcore.amazonaws.com
- [x] Added iam:ListRoles for Security Center UI
- [x] Added GuardrailManagementPolicy (Create/Update/Delete/Get/List + CreateVersion)
- [x] Template validated with `aws cloudformation validate-template`

### Guardrail Integration
- [ ] workspace_assembler.py: Read guardrail config from DynamoDB, pass to Bedrock Converse
- [x] Security Center UI: Runtime cards show assigned positions

### Test Environment Data
- 21 employees (20 seed + 1 provision test)
- 4 runtimes (Standard, Restricted, Engineering, Executive) — all READY
- 7 position→runtime assignments
- 11 knowledge bases
- 20+ conversations across all tiers
- Audit + Monitor data populated
