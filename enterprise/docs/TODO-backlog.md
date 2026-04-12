# OpenClaw Enterprise — TODO Backlog

> Consolidated from all PRD, design, and worklog documents.
> Last updated: 2026-04-13

---

## P0: Infrastructure Blockers (must do first)

### P0.1 Docker Image Rebuild + ECR Push

**What:** 4 PRDs (Monitor, Security, Knowledge, Agent Factory, SOUL Review) all changed agent-container code but the running image is still old.

**Changed files in agent-container:**
- `workspace_assembler.py` — SOUL 3-layer assembly, context block, KB file reference injection, PERSONAL_SOUL.md migration
- `server.py` — `lastInvocationAt` DynamoDB write after each invocation, model-aware pricing dict
- `permissions.py` — `_log_permission_denied()` writes DynamoDB AUDIT# entry, MODEL_PRICING dict

**Affected environments:** ap-northeast-1 (production), us-east-2 (test)

**Source PRDs:** PRD-monitor:346, PRD-soul-review:392, PRD-knowledge:278, PRD-agent-factory:187, worklog-2026-04-12:134

### P0.2 DynamoDB TTL Enable

**What:** Session takeover uses `takeoverTTL` attribute for auto-expiration. Must enable TTL on DynamoDB table.

**Command:**
```bash
aws dynamodb update-time-to-live \
  --table-name openclaw-jiade2 \
  --time-to-live-specification "Enabled=true,AttributeName=takeoverTTL" \
  --region ap-northeast-1
```

**Source:** PRD-monitor:343,350, worklog-2026-04-12:135

### P0.3 Guardrail Binding to Runtimes

**What:** Created 2 Bedrock Guardrails (strict: `elk5damd3rvk`, moderate: `ztr7izsru5qe`) but they're not bound to runtimes. `create-agent-runtime` API doesn't accept guardrail params. Need to either:
1. Update runtime config via `update-agent-runtime` to set guardrailId/guardrailVersion (if API supports it), OR
2. Bind guardrails at agent-container level via SSM parameter per-tenant, OR
3. Bind guardrails in workspace_assembler.py at session start via Bedrock Converse `guardrailConfig`

**Current state:** Guardrails exist in Bedrock console but not applied to any agent invocation.

**Runtimes needing guardrail:**
- `openclaw_jiade2_runtime` (Standard) → moderate guardrail `ztr7izsru5qe` v1
- `openclawJiade2RestrictedRuntime` (Restricted) → strict guardrail `elk5damd3rvk` v1
- Engineering + Executive → no guardrail (by design)

**Source:** User feedback 2026-04-13

### P0.4 EC2 Instance Role IAM Fix

**What:** EC2 instance role missing:
- `bedrock-agentcore:CreateAgentRuntimeEndpoint` — cannot create runtimes from admin console
- `iam:PassRole` — cannot update runtime config from admin console
- `iam:ListRoles` — Security Center Infrastructure tab shows 0 IAM roles

**Fix:** Add these permissions to CloudFormation template's `OpenClawInstanceRole` + update deployed stack.

**Source:** E2E test failures T22.3, prod-setup runtime creation failures

---

## P1: Deployment Verification (after P0)

| # | Task | Source |
|---|------|--------|
| 1.1 | After Docker rebuild: verify workspace_assembler SOUL assembly on each environment | PRD-knowledge:293 |
| 1.2 | Auth middleware live test (login, pairing, API all require JWT) | PRD-knowledge:294 |
| 1.3 | DynamoDB transact_write test (provision_employee_atomic) | PRD-knowledge:295 |
| 1.4 | AgentCore IAM verify: execution role has dynamodb:GetItem+Query | PRD-soul-review:393 |
| 1.5 | SOUL.md KB file reference test with Nova Lite + Sonnet | PRD-soul-review:394 |
| 1.6 | Existing deployment migration: old .personal_soul_backup.md auto-migrated | PRD-soul-review:395 |
| 1.7 | Runtime assignment E2E: Security Center → DynamoDB → Tenant Router | PRD-security:246 |

---

## P2: Frontend Fixes (10 items)

| # | Page | Task | Source |
|---|------|------|--------|
| 2.1 | Organization | Remove Default Channel from create/edit modals | PRD-org:137 |
| 2.2 | Organization | Active Agents stat card fix | PRD-org:138 |
| 2.3 | Organization | SOUL Configured stat card fix | PRD-org:139 |
| 2.4 | Agent Factory | Delete Agent button + confirmation modal | PRD-agent-factory:183 |
| 2.5 | Agent Factory | Refresh Agent button | PRD-agent-factory:184 |
| 2.6 | Agent Factory | SoulEditor 409 Conflict handling | PRD-agent-factory:185 |
| 2.7 | Portal | "My Agent Identity" page (edit PERSONAL_SOUL.md) | PRD-soul-review:396 |
| 2.8 | Knowledge | Search results format adaptation (new API shape) | PRD-knowledge:279 |
| 2.9 | Knowledge | Upload 413 error friendly message | PRD-knowledge:281 |
| 2.10 | Security Center | Runtime card show guardrail + assigned positions | PRD-monitor:355 |

---

## P3: New Modules (not started)

| # | Module | Description | Source |
|---|--------|-------------|--------|
| 3.1 | **Skill Market** | S3-based skills, position assignment flow, API key prereqs. Needs Portal integration. | worklog:130 |
| 3.2 | **Portal / Employee Module** | Employee self-service PRD not written. Needs: My Agent Identity, My Usage, IM pairing, request approval. | worklog:131 |
| 3.3 | **Fargate Always-On IM** | Half-done. Redesign needed: one frontend, different API for always-on vs serverless. | worklog:132 |
| 3.4 | **SOUL Review Engine** | personal_soul_extractor, tool_usage_collector, review_engine, scheduled scan, auto-revert. 8 sub-tasks. | PRD-soul-review:402-409 |
| 3.5 | **Audit Review Engine** | Personal SOUL review, KB upload review, tool usage anomaly, auto-approve/revert thresholds. | PRD-audit:400-404 |
| 3.6 | **IM Security Hardening** | SSM detection→DDB, public IP removal, JWT validation consolidation. | PRD-im:196-198 |

---

## P4: Enhancements (future)

| # | Area | Task | Source |
|---|------|------|--------|
| 4.1 | Infrastructure | CloudFront → ALB → EC2 (stable endpoint, currently IP changes on restart) | PRD-monitor:349 |
| 4.2 | Playground | Multi-turn simulate mode | PRD-playground:222 |
| 4.3 | Playground | SOUL content inline expansion | PRD-playground:223 |
| 4.4 | Playground | A/B comparison (same message, two positions) | PRD-playground:224 |
| 4.5 | Playground | Record test sessions for regression | PRD-playground:225 |
| 4.6 | Usage | Budget enforcement (block agent when exceeded) | PRD-usage:228 |
| 4.7 | Usage | Monthly cost report export (PDF/CSV) | PRD-usage:229 |
| 4.8 | Usage | Model cost comparison tool ("what if") | PRD-usage:230 |
| 4.9 | Usage | Real-time Bedrock Cost Explorer reconciliation | PRD-usage:231 |
| 4.10 | Settings | Admin AI operation audit trail | PRD-settings:330 |
| 4.11 | Settings | Services endpoint dedup (settings vs monitor) | PRD-settings:331 |
| 4.12 | Settings | Org sync retry + error handling | PRD-settings:334 |
| 4.13 | Settings | Password change validate old password | PRD-settings:335 |
| 4.14 | Audit | Scheduled auto-scan (cron 30 min) | PRD-audit:407 |
| 4.15 | Audit | Review Engine batch mode (10 per Bedrock call) | PRD-audit:408 |
| 4.16 | Audit | Compliance report export PDF | PRD-audit:409 |
| 4.17 | Audit | Alert integration with IM channels | PRD-audit:410 |
| 4.18 | Audit | Immutable audit log (S3 Object Lock) | PRD-audit:411 |
| 4.19 | Review Engine | S3 versioning for PERSONAL_SOUL.md | PRD-soul-review:413 |
| 4.20 | Review Engine | Tool usage heatmap visualization | PRD-soul-review:415 |
| 4.21 | Review Engine | Employee notification on auto-revert via IM | PRD-soul-review:416 |
| 4.22 | Knowledge | KB upload → pending_review + injection detection | PRD-knowledge:288-289 |
| 4.23 | Knowledge | KB seed data cleanup (fake counts vs real S3) | PRD-knowledge:284 |
| 4.24 | Security | Permission denied → AI anomaly detection | PRD-security:251 |
| 4.25 | IM Channels | Remove SSM dual-write (after migration verified) | PRD-im:201 |
| 4.26 | IM Channels | DM policy validation/warning in admin UI | PRD-im:202 |
| 4.27 | IM Channels | Expand IM notification to more channels | PRD-im:203 |

---

## Summary

| Priority | Count | Key blocker |
|----------|-------|-------------|
| **P0** | 4 items | Docker rebuild blocks ALL agent-container changes from going live |
| **P1** | 7 items | Post-rebuild verification |
| **P2** | 10 items | Frontend component fixes |
| **P3** | 6 modules | New feature development |
| **P4** | 27 items | Long-term roadmap |
| **Total** | **54 items** | |

---

## Execution Order

```
P0.1 Docker Rebuild + ECR Push
  ├── P0.2 DynamoDB TTL Enable (parallel)
  ├── P0.3 Guardrail Binding (parallel)
  └── P0.4 EC2 Instance Role IAM Fix (parallel)
      │
      v
P1.1-P1.7 Deployment Verification (sequential)
      │
      v
P2.1-P2.10 Frontend Fixes (can batch)
      │
      v
P3.x New Modules (prioritize with user)
```
