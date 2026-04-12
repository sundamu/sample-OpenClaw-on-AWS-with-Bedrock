# Design: Tools & Skills Phase 1 — Make Skills Work

> File-by-file change plan with before/after code.

---

## File 1: `agent-container/skill_loader.py`

### Problem
`get_tenant_roles()` (line 35-46) reads from SSM path that's never written. Returns `["employee"]` for everyone. Department-scoped skills get filtered out.

### Fix
Replace SSM role lookup with DynamoDB position → department → role mapping. Reuse the same pattern as `workspace_assembler.py:get_tenant_position()`.

### Before (line 35-46)
```python
def get_tenant_roles(ssm, stack_name, tenant_id):
    try:
        resp = ssm.get_parameter(Name=f"/openclaw/{stack_name}/tenants/{tenant_id}/roles")
        roles = [r.strip() for r in resp["Parameter"]["Value"].split(",")]
        return roles
    except ClientError:
        return ["employee"]
```

### After
```python
def get_tenant_roles(stack_name, tenant_id, region=None):
    """Get tenant's roles from DynamoDB position/department data.
    Maps: tenant_id → emp_id → positionId → position record → departmentName → role.
    Returns list of role strings for skill permission filtering."""
    ddb_region = region or os.environ.get("DYNAMODB_REGION", os.environ.get("AWS_REGION", "us-east-1"))
    ddb_table = os.environ.get("DYNAMODB_TABLE", os.environ.get("STACK_NAME", "openclaw"))

    # Strip Tenant Router prefix: channel__emp_id__hash → emp_id
    base_id = tenant_id
    parts = base_id.split("__")
    if len(parts) >= 2:
        base_id = parts[1]

    try:
        ddb = boto3.resource("dynamodb", region_name=ddb_region)
        table = ddb.Table(ddb_table)

        # Read employee record
        resp = table.get_item(Key={"PK": "ORG#acme", "SK": f"EMP#{base_id}"})
        emp = resp.get("Item", {})
        if not emp:
            logger.info("Employee %s not found, using default roles", base_id)
            return ["employee"]

        pos_id = emp.get("positionId", "")
        dept_name = emp.get("departmentName", "")
        role = emp.get("role", "employee")

        # Build role list: role name + department name (lowercase) + position-derived aliases
        roles = [role, "employee"]
        if dept_name:
            # Map department name to role aliases used in skill manifests
            dept_lower = dept_name.lower().replace(" & ", "_").replace(" ", "_")
            roles.append(dept_lower)  # e.g. "engineering", "finance", "hr_admin"
            # Common aliases
            DEPT_ALIASES = {
                "engineering": ["engineering", "devops", "qa"],
                "platform team": ["engineering", "devops"],
                "frontend team": ["engineering"],
                "backend team": ["engineering"],
                "qa team": ["engineering", "qa"],
                "enterprise sales": ["sales"],
                "smb sales": ["sales"],
                "customer success": ["csm"],
                "hr & admin": ["hr"],
                "legal & compliance": ["legal"],
                "product": ["product"],
                "finance": ["finance"],
            }
            for alias in DEPT_ALIASES.get(dept_name.lower(), []):
                if alias not in roles:
                    roles.append(alias)

        if role == "admin":
            roles.append("management")

        logger.info("Tenant %s (%s) roles: %s", base_id, dept_name, roles)
        return list(set(roles))
    except Exception as e:
        logger.warning("DynamoDB role resolution failed: %s — using default", e)
        return ["employee"]
```

### Also change `main()` (line 259)
```python
# Before:
roles = get_tenant_roles(ssm, args.stack, args.tenant)

# After:
roles = get_tenant_roles(args.stack, args.tenant, region=args.region)
```

---

## File 2: `agent-container/entrypoint.sh`

### Change 1: Clean output/ on Session Storage restore (before S3 sync, ~line 230)

```bash
# ADD after line 68 (mkdir -p "$WORKSPACE" "$WORKSPACE/memory" "$WORKSPACE/skills")
# and after line 53 (mkdir -p "$EFS_WORKSPACE" ...)

# Clean output/ directory — Session Storage may have restored old output files
# These are already persisted in S3, no need to keep them in workspace
rm -rf "$WORKSPACE/output" 2>/dev/null
mkdir -p "$WORKSPACE/output"
echo "[entrypoint] output/ cleaned (persisted in S3)"
```

### Change 2: Exclude output/ from cold start S3 sync (line 231)

```bash
# Before:
aws s3 sync "${S3_BASE}/workspace/" "$WORKSPACE/" --quiet 2>/dev/null || true

# After:
aws s3 sync "${S3_BASE}/workspace/" "$WORKSPACE/" --exclude "output/*" --quiet 2>/dev/null || true
```

### Change 3: Do NOT exclude output/ from watchdog sync (line 302-309)

No change needed — watchdog already syncs everything except skills/, knowledge/, SOUL.md etc. output/ is NOT in the exclude list, so it gets synced to S3 automatically. This is correct.

---

## File 3: `agent-container/workspace_assembler.py`

### Add `_enforce_workspace_budget()` function

Insert before `assemble_workspace()` (~line 280):

```python
from pathlib import Path

WORKSPACE_MAX_MB = 100
PROTECTED_FILES = {"SOUL.md", "PERSONAL_SOUL.md", "USER.md", "MEMORY.md",
                   "IDENTITY.md", "AGENTS.md", "TOOLS.md", "HEARTBEAT.md",
                   "CHANNELS.md", "SESSION_CONTEXT.md"}
PROTECTED_DIRS = {"memory", "skills", "knowledge"}

def _enforce_workspace_budget(workspace: str, max_mb: int = WORKSPACE_MAX_MB):
    """Clean old user files if workspace exceeds budget.
    Only cleans files in output/ and root workspace — never touches
    system files, memory, skills, or knowledge."""
    ws = Path(workspace)
    user_files = [
        f for f in ws.rglob("*")
        if f.is_file()
        and f.name not in PROTECTED_FILES
        and not any(p in f.relative_to(ws).parts for p in PROTECTED_DIRS)
    ]
    total = sum(f.stat().st_size for f in user_files)
    if total <= max_mb * 1024 * 1024:
        return

    logger.info("Workspace budget exceeded: %dMB / %dMB — cleaning old files",
                total // (1024 * 1024), max_mb)
    # Sort by modification time, delete oldest first
    user_files.sort(key=lambda f: f.stat().st_mtime)
    freed = 0
    deleted = 0
    for f in user_files:
        if total - freed <= max_mb * 1024 * 1024:
            break
        freed += f.stat().st_size
        f.unlink()
        deleted += 1
    logger.info("Workspace cleanup: freed %dKB, deleted %d files", freed // 1024, deleted)
```

### Call it at the end of `assemble_workspace()` (~line 592)

```python
# Add at end of assemble_workspace(), before return:
_enforce_workspace_budget(workspace)
```

---

## File 4: `agent-container/skills/excel-gen/tool.js`

### Change: Output to workspace/output/ instead of /tmp/

```javascript
// Before (line 41):
const outputPath = args.outputPath || path.join(os.tmpdir(), filename);

// After:
const workspace = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
const outputDir = path.join(workspace, 'output');
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = args.outputPath || path.join(outputDir, filename);
```

---

## File 5: `agent-container/skills/aws-nova-canvas/tool.js`

### Change: Output to workspace/output/ instead of /tmp/

```javascript
// Before (line 32):
const outputPath = args.outputPath || path.join(os.tmpdir(), `nova-canvas-${Date.now()}.png`);

// After:
const workspace  = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
const outputDir  = path.join(workspace, 'output');
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = args.outputPath || path.join(outputDir, `nova-canvas-${Date.now()}.png`);
```

---

## File 6: `admin-console/server/routers/agents.py`

### Change 1: assign_skill_to_position (line 489-511)

```python
# Before:
    skills.append(skill_name)
    db.update_position(position_id, {"defaultSkills": skills})
    return {"assigned": True, "positionId": position_id, "skill": skill_name}

# After:
    skills.append(skill_name)
    db.update_position(position_id, {"defaultSkills": skills})
    bump_config_version()
    # Audit
    db.create_audit_entry({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "eventType": "skill_assignment",
        "actorId": user.employee_id, "actorName": user.name,
        "targetType": "position", "targetId": position_id,
        "detail": f"Assigned skill '{skill_name}' to {pos.get('name', position_id)}",
        "status": "success",
    })
    # Force refresh affected employees (background)
    import threading
    emps = [e for e in db.get_employees() if e.get("positionId") == position_id]
    for e in emps:
        threading.Thread(target=stop_employee_session, args=(e["id"],), daemon=True).start()
    return {"assigned": True, "positionId": position_id, "skill": skill_name,
            "agentsAffected": len(emps)}
```

Need to add imports at top of file: `from shared import bump_config_version, stop_employee_session`
Need `user = require_role(...)` return value (already there: line 493).

### Change 2: unassign_skill_from_position (line 514-530)

Same pattern — add bump_config_version + audit + force refresh.

### Change 3: Add API key write endpoint (new, after unassign)

```python
@router.put("/api/v1/skills/keys/{skill_name}/{env_var}")
def set_skill_key(skill_name: str, env_var: str, body: dict, authorization: str = Header(default="")):
    """Configure a platform-level API key for a skill. Stored in SSM SecureString."""
    user = require_role(authorization, roles=["admin"])
    value = body.get("value", "")
    if not value:
        raise HTTPException(400, "value is required")
    stack = os.environ.get("STACK_NAME", "openclaw")
    ssm = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    ssm.put_parameter(
        Name=f"/openclaw/{stack}/skill-keys/{skill_name}/{env_var}",
        Value=value, Type="SecureString", Overwrite=True)
    db.create_audit_entry({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "eventType": "config_change",
        "actorId": user.employee_id, "actorName": user.name,
        "targetType": "skill_key", "targetId": f"{skill_name}/{env_var}",
        "detail": f"Configured API key {env_var} for skill {skill_name}",
        "status": "success",
    })
    return {"configured": True, "skill": skill_name, "envVar": env_var}
```

---

## File 7: `admin-console/server/seed_skills_final.py`

### Change: Reduce from 26 to 5 skills

Only keep skills with real tool.js that will be uploaded to S3:
1. excel-gen
2. aws-nova-canvas
3. aws-s3-docs
4. aws-transcribe-notes
5. aws-bedrock-kb-search

Remove the other 21 manifest-only entries.

---

## File 8: `_shared/soul/global/SOUL.md` (S3)

### Add File Output Policy section

Append to Global SOUL:

```markdown
## File Output Policy

When you generate files (Excel spreadsheets, images, documents, code files):
- Files are automatically saved in your workspace and synced to your employee portal
- You can reference generated files by their path in workspace/output/
- Large or important files should be explicitly saved — tell the employee the filename

When generating files for the employee to download:
1. Create the file in the output directory
2. Confirm to the employee: "I've generated [filename] — you can find it in your workspace under Output"
```

---

## Files to CREATE (S3 upload):

### setup-guide.md for each skill

5 files to write and upload to S3 `_shared/skills/{name}/setup-guide.md`:
- excel-gen/setup-guide.md
- aws-nova-canvas/setup-guide.md
- aws-s3-docs/setup-guide.md
- aws-bedrock-kb-search/setup-guide.md
- aws-transcribe-notes/setup-guide.md (not a seed skill for assignment but has tool.js)

### skill.json for each skill

Update manifests for the 5 skills — add `"setupGuide": "setup-guide.md"` field.

### tool.js upload

Upload from `agent-container/skills/{name}/tool.js` to S3 `_shared/skills/{name}/tool.js` for:
- excel-gen
- aws-nova-canvas
- aws-s3-docs
- aws-bedrock-kb-search
- aws-transcribe-notes

---

## Summary of changes

| File | Type | Lines Changed |
|------|------|--------------|
| skill_loader.py | Modify | ~50 lines (replace get_tenant_roles) |
| entrypoint.sh | Modify | ~5 lines (output/ cleanup + S3 exclude) |
| workspace_assembler.py | Modify | ~35 lines (add budget enforcement) |
| excel-gen/tool.js | Modify | ~4 lines (output path) |
| aws-nova-canvas/tool.js | Modify | ~4 lines (output path) |
| agents.py | Modify | ~40 lines (audit+bump on assign/unassign + key endpoint) |
| seed_skills_final.py | Rewrite | ~60 lines (26 → 5 skills) |
| S3 uploads | Create | 5 tool.js + 5 setup-guide.md + 5 skill.json |
| Global SOUL.md | Modify | ~10 lines (append output policy) |
