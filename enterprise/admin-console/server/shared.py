"""
Shared dependencies for all routers.
Provides auth, config, helpers, and module-level constants.
Import this instead of main.py to avoid circular dependencies.
"""

import os
import time
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import boto3 as _boto3_shared

logger = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────────────────
GATEWAY_REGION = os.environ.get("GATEWAY_REGION", os.environ.get("SSM_REGION", "us-east-1"))
STACK_NAME = os.environ.get("STACK_NAME", "openclaw")
S3_BUCKET_ENV = os.environ.get("S3_BUCKET", "")
DYNAMODB_TABLE = os.environ.get("DYNAMODB_TABLE") or os.environ.get("STACK_NAME", "openclaw")
DYNAMODB_REGION = os.environ.get("DYNAMODB_REGION", os.environ.get("AWS_REGION", "us-east-1"))
CONSOLE_PORT = os.environ.get("CONSOLE_PORT", "8099")
ALWAYS_ON_ECR_IMAGE = os.environ.get("AGENT_ECR_IMAGE", "")


def _resolve_gateway_instance_id() -> str:
    try:
        return os.environ.get("GATEWAY_INSTANCE_ID", "") or (
            _boto3_shared.client("ssm", region_name=GATEWAY_REGION)
            .get_parameter(Name=f"/openclaw/{STACK_NAME}/gateway-instance-id")["Parameter"]["Value"]
        )
    except Exception:
        # Try IMDS
        try:
            import urllib.request
            tok = urllib.request.urlopen(
                urllib.request.Request("http://169.254.169.254/latest/api/token",
                                      method="PUT", headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"}),
                timeout=2).read().decode()
            return urllib.request.urlopen(
                urllib.request.Request("http://169.254.169.254/latest/meta-data/instance-id",
                                      headers={"X-aws-ec2-metadata-token": tok}),
                timeout=2).read().decode()
        except Exception:
            return ""


def _resolve_gateway_account_id() -> str:
    try:
        return _boto3_shared.client("sts", region_name=GATEWAY_REGION).get_caller_identity()["Account"]
    except Exception:
        return ""


GATEWAY_INSTANCE_ID: str = _resolve_gateway_instance_id()
GATEWAY_ACCOUNT_ID: str = _resolve_gateway_account_id()


# ── SSM helper ──────────────────────────────────────────────────────────
def ssm_client():
    return _boto3_shared.client("ssm", region_name=GATEWAY_REGION)


# ── Config version ──────────────────────────────────────────────────────
def bump_config_version() -> None:
    """Write a new CONFIG#global-version to DynamoDB.
    Agent-container/server.py polls this every 5 minutes."""
    try:
        import db
        version = datetime.now(timezone.utc).isoformat()
        ddb = _boto3_shared.resource("dynamodb", region_name=db.AWS_REGION)
        ddb.Table(db.TABLE_NAME).put_item(Item={
            "PK": "ORG#acme", "SK": "CONFIG#global-version",
            "GSI1PK": "TYPE#config", "GSI1SK": "CONFIG#global-version",
            "version": version,
        })
    except Exception as e:
        print(f"[config-version] bump failed (non-fatal): {e}")


# ── StopRuntimeSession helper ──────────────────────────────────────────
def stop_employee_session(emp_id: str) -> dict:
    """Force agent workspace refresh for an employee.

    Two modes based on the employee's position deployMode:
    - Fargate: POST /admin/refresh to the Fargate container (clears workspace cache,
      no container restart needed — next invocation re-assembles workspace).
    - Serverless (AgentCore): POST /stop-session to Tenant Router (kills the microVM,
      next invocation triggers full cold start).
    """
    import requests as _req_stop

    # Check if this employee's position uses Fargate
    try:
        import db as _db_stop
        emp = _db_stop.get_employee(emp_id)
        if emp:
            pos_id = emp.get("positionId", "")
            if pos_id:
                pos = _db_stop.get_position(pos_id)
                if pos and pos.get("deployMode") == "fargate":
                    return _refresh_fargate_agent(emp_id, pos.get("fargateTier", ""))
    except Exception as e:
        logger.warning("[stop-session] Fargate check failed, falling back to AgentCore: %s", e)

    # AgentCore mode: call Tenant Router to kill microVM
    router_url = os.environ.get("TENANT_ROUTER_URL", "http://localhost:8090")
    try:
        r = _req_stop.post(f"{router_url}/stop-session",
                          json={"emp_id": emp_id}, timeout=30)
        return r.json() if r.status_code == 200 else {"error": r.text}
    except Exception as e:
        print(f"[stop-session] Failed for {emp_id}: {e}")
        return {"error": str(e)}


def _refresh_fargate_agent(emp_id: str, tier_name: str = "") -> dict:
    """Refresh a Fargate-hosted agent by calling the container's /admin/refresh endpoint.
    This clears the workspace assembly cache without restarting the container."""
    import requests as _req_fg

    # Resolve tier endpoint from SSM
    if not tier_name:
        tier_name = "standard"
    try:
        endpoint = ssm_client().get_parameter(
            Name=f"/openclaw/{STACK_NAME}/fargate/tier-{tier_name}/endpoint"
        )["Parameter"]["Value"]
    except Exception:
        # Fallback: try per-agent always-on endpoint
        try:
            agent_id = ssm_client().get_parameter(
                Name=f"/openclaw/{STACK_NAME}/tenants/{emp_id}/always-on-agent"
            )["Parameter"]["Value"]
            endpoint = ssm_client().get_parameter(
                Name=f"/openclaw/{STACK_NAME}/always-on/{agent_id}/endpoint"
            )["Parameter"]["Value"]
        except Exception:
            return {"error": f"No Fargate endpoint found for tier {tier_name}"}

    try:
        r = _req_fg.post(f"{endpoint}/admin/refresh",
                        json={"emp_id": emp_id}, timeout=10)
        result = r.json() if r.status_code == 200 else {"error": r.text}
        logger.info("[refresh-fargate] %s → %s: %s", emp_id, endpoint, result)
        return result
    except Exception as e:
        logger.warning("[refresh-fargate] Failed for %s: %s", emp_id, e)
        return {"error": str(e)}


# ── Auth helpers ──────────────────────────────────────────────────────────
# Two layers:
#   1. Middleware (main.py) — enforces auth on all /api/ paths except whitelist.
#      Attaches request.state.user for downstream use.
#   2. These helpers — used by routers for role checks and dept scoping.
#      require_auth() still works as a fallback for endpoints that need to
#      extract the user when not using Depends.

def require_auth(authorization: str):
    """Validate JWT and return UserContext. Raises HTTPException on failure.
    Note: with the auth middleware in place, this is redundant for /api/ paths
    but kept for backward compatibility and non-middleware contexts."""
    from fastapi import HTTPException
    import auth as _authmod
    user = _authmod.get_user_from_request(authorization)
    if not user:
        raise HTTPException(401, "Authentication required")
    return user

def require_role(authorization: str, roles: list = None):
    """Validate JWT + check role. Raises HTTPException on failure."""
    from fastapi import HTTPException
    user = require_auth(authorization)
    allowed = roles or ["admin"]
    if user.role not in allowed:
        raise HTTPException(403, f"Role '{user.role}' not permitted. Required: {allowed}")
    return user

def get_dept_scope(user) -> Optional[set]:
    """For managers: return set of department IDs they can see (BFS sub-departments).
    For admins: None (no filter). For employees: empty set."""
    if user.role == "admin":
        return None
    if user.role == "employee":
        return set()
    # Manager: BFS from their department
    import db as _db_scope
    depts = _db_scope.get_departments()
    dept_id = user.department_id
    ids = {dept_id}
    queue = [dept_id]
    while queue:
        current = queue.pop(0)
        for d in depts:
            if d.get("parentId") == current and d["id"] not in ids:
                ids.add(d["id"])
                queue.append(d["id"])
    return ids


# ── FastAPI Dependencies (Depends) ────────────────────────────────────────
# Use these in router endpoints: def my_endpoint(user = Depends(get_current_user))

def audit_soul_change(user, layer: str, target_id: str, content_len: int, action: str = "edit"):
    """Create audit entry for any SOUL layer change.
    Called by agents.py save_agent_soul, security.py put_global_soul/put_position_soul."""
    import db as _db_audit
    from datetime import datetime as _dt_audit, timezone as _tz_audit
    _db_audit.create_audit_entry({
        "timestamp": _dt_audit.now(_tz_audit.utc).isoformat(),
        "eventType": "soul_change",
        "actorId": user.employee_id,
        "actorName": user.name,
        "targetType": "soul",
        "targetId": target_id,
        "detail": f"SOUL {layer} layer {action}: {target_id} ({content_len} chars)",
        "status": "success",
    })


def get_current_user(request):
    """FastAPI Depends: extract user from request.state (set by auth middleware).
    Returns UserContext or None. Does NOT raise — use for optional auth contexts."""
    return getattr(request.state, "user", None)

def get_dept_filter(request) -> Optional[set]:
    """FastAPI Depends: return department ID set for the current user.
    Admin → None (no filter). Manager → BFS sub-departments. Employee → empty set.
    Usage: def endpoint(scope = Depends(get_dept_filter))"""
    user = getattr(request.state, "user", None)
    if not user:
        return set()
    return get_dept_scope(user)
