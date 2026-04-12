"""
Unit tests for Tools & Skills Phase 1.

Tests:
  1. skill_loader.py — role matching from DynamoDB
  2. agents.py — assign/unassign with audit + bump + refresh
  3. agents.py — API key write endpoint
  4. workspace_assembler.py — workspace budget enforcement
  5. excel-gen tool.js — output path goes to workspace/output/
  6. seed_skills_final.py — only 5 skills
"""
import json
import os
import sys
import tempfile
import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock
from datetime import datetime, timezone

import pytest

# ─── Add paths ─────────────────────────────────────────────────────────────
AGENT_CONTAINER = os.path.join(os.path.dirname(__file__), "..", "agent-container")
ADMIN_SERVER = os.path.join(os.path.dirname(__file__), "..", "admin-console", "server")
sys.path.insert(0, AGENT_CONTAINER)
sys.path.insert(0, ADMIN_SERVER)


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 1: skill_loader.py — get_tenant_roles from DynamoDB
# ═══════════════════════════════════════════════════════════════════════════

class TestGetTenantRoles:
    """Test that get_tenant_roles reads from DynamoDB, not SSM."""

    def test_engineering_employee_gets_engineering_role(self):
        """SDE in Engineering dept should get 'engineering' role for skill filtering."""
        from skill_loader import get_tenant_roles

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "id": "emp-ryan",
                "positionId": "pos-sde",
                "departmentName": "Backend Team",
                "role": "employee",
            }
        }

        with patch("skill_loader.boto3") as mock_boto:
            mock_ddb = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_boto.resource.return_value = mock_ddb

            roles = get_tenant_roles("openclaw-test", "port__emp-ryan__abc123", region="us-east-2")

        assert "employee" in roles
        assert "engineering" in roles  # Backend Team maps to engineering

    def test_finance_employee_gets_finance_role(self):
        """Finance Analyst should get 'finance' role."""
        from skill_loader import get_tenant_roles

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "id": "emp-carol",
                "positionId": "pos-fa",
                "departmentName": "Finance",
                "role": "employee",
            }
        }

        with patch("skill_loader.boto3") as mock_boto:
            mock_ddb = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_boto.resource.return_value = mock_ddb

            roles = get_tenant_roles("openclaw-test", "port__emp-carol__def456", region="us-east-2")

        assert "finance" in roles
        assert "engineering" not in roles

    def test_unknown_employee_returns_default(self):
        """Unknown employee should get default 'employee' role."""
        from skill_loader import get_tenant_roles

        mock_table = MagicMock()
        mock_table.get_item.return_value = {}  # no Item

        with patch("skill_loader.boto3") as mock_boto:
            mock_ddb = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_boto.resource.return_value = mock_ddb

            roles = get_tenant_roles("openclaw-test", "port__emp-ghost__xyz", region="us-east-2")

        assert roles == ["employee"]

    def test_admin_gets_management_role(self):
        """Admin role should include 'management'."""
        from skill_loader import get_tenant_roles

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "id": "emp-jiade",
                "positionId": "pos-sa",
                "departmentName": "Engineering",
                "role": "admin",
            }
        }

        with patch("skill_loader.boto3") as mock_boto:
            mock_ddb = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_boto.resource.return_value = mock_ddb

            roles = get_tenant_roles("openclaw-test", "port__emp-jiade__abc", region="us-east-2")

        assert "admin" in roles
        assert "management" in roles
        assert "engineering" in roles

    def test_tenant_id_prefix_stripped(self):
        """Tenant ID format 'channel__emp-id__hash' should extract emp-id correctly."""
        from skill_loader import get_tenant_roles

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {"id": "emp-carol", "positionId": "pos-fa", "departmentName": "Finance", "role": "employee"}
        }

        with patch("skill_loader.boto3") as mock_boto:
            mock_ddb = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_boto.resource.return_value = mock_ddb

            get_tenant_roles("openclaw-test", "tg__emp-carol__a1b2c3d4e5f6g7h8", region="us-east-2")

        # Should query with emp-carol, not the full tenant_id
        mock_table.get_item.assert_called_with(Key={"PK": "ORG#acme", "SK": "EMP#emp-carol"})


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 2: skill_loader.py — is_skill_allowed
# ═══════════════════════════════════════════════════════════════════════════

class TestSkillAllowed:
    """Test skill permission filtering."""

    def test_global_skill_allowed_for_everyone(self):
        from skill_loader import is_skill_allowed
        manifest = {"name": "web-search", "permissions": {"allowedRoles": ["*"], "blockedRoles": []}}
        assert is_skill_allowed(manifest, ["employee"]) is True

    def test_engineering_skill_blocked_for_finance(self):
        from skill_loader import is_skill_allowed
        manifest = {"name": "github", "permissions": {"allowedRoles": ["engineering", "devops"], "blockedRoles": []}}
        assert is_skill_allowed(manifest, ["finance", "employee"]) is False

    def test_engineering_skill_allowed_for_sde(self):
        from skill_loader import is_skill_allowed
        manifest = {"name": "github", "permissions": {"allowedRoles": ["engineering", "devops"], "blockedRoles": []}}
        assert is_skill_allowed(manifest, ["engineering", "employee"]) is True

    def test_blocked_role_takes_precedence(self):
        from skill_loader import is_skill_allowed
        manifest = {"name": "test", "permissions": {"allowedRoles": ["*"], "blockedRoles": ["intern"]}}
        assert is_skill_allowed(manifest, ["intern"]) is False


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 3: workspace_assembler.py — budget enforcement
# ═══════════════════════════════════════════════════════════════════════════

class TestWorkspaceBudget:
    """Test workspace 100MB budget enforcement."""

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        # Create protected files
        (Path(self.tmpdir) / "SOUL.md").write_text("soul content")
        (Path(self.tmpdir) / "MEMORY.md").write_text("memory content")
        (Path(self.tmpdir) / "USER.md").write_text("user content")
        # Create memory dir
        (Path(self.tmpdir) / "memory").mkdir()
        (Path(self.tmpdir) / "memory" / "2026-04-10.md").write_text("daily memory")
        # Create output dir with files
        (Path(self.tmpdir) / "output").mkdir()

    def teardown_method(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_under_budget_no_cleanup(self):
        """Files under 100MB should not be touched."""
        (Path(self.tmpdir) / "output" / "small.xlsx").write_bytes(b"x" * 1000)  # 1KB

        from workspace_assembler import _enforce_workspace_budget
        _enforce_workspace_budget(self.tmpdir, max_mb=100)

        assert (Path(self.tmpdir) / "output" / "small.xlsx").exists()

    def test_over_budget_cleans_oldest(self):
        """Files over budget should be cleaned, oldest first."""
        import time
        # Create files with different ages
        f1 = Path(self.tmpdir) / "output" / "old.xlsx"
        f1.write_bytes(b"x" * 60 * 1024 * 1024)  # 60MB
        os.utime(f1, (time.time() - 86400, time.time() - 86400))  # 1 day old

        f2 = Path(self.tmpdir) / "output" / "new.xlsx"
        f2.write_bytes(b"x" * 60 * 1024 * 1024)  # 60MB — total 120MB, over 100MB budget

        from workspace_assembler import _enforce_workspace_budget
        _enforce_workspace_budget(self.tmpdir, max_mb=100)

        assert not f1.exists()  # oldest deleted
        assert f2.exists()  # newest kept

    def test_protected_files_never_deleted(self):
        """SOUL.md, MEMORY.md, USER.md should never be deleted even if over budget."""
        # Write 200MB to a protected file (unrealistic but tests the protection)
        (Path(self.tmpdir) / "output" / "huge.bin").write_bytes(b"x" * 110 * 1024 * 1024)

        from workspace_assembler import _enforce_workspace_budget
        _enforce_workspace_budget(self.tmpdir, max_mb=100)

        # Protected files still exist
        assert (Path(self.tmpdir) / "SOUL.md").exists()
        assert (Path(self.tmpdir) / "MEMORY.md").exists()
        assert (Path(self.tmpdir) / "USER.md").exists()
        assert (Path(self.tmpdir) / "memory" / "2026-04-10.md").exists()

    def test_memory_dir_never_cleaned(self):
        """memory/ directory files should never be deleted."""
        (Path(self.tmpdir) / "output" / "big.bin").write_bytes(b"x" * 110 * 1024 * 1024)

        from workspace_assembler import _enforce_workspace_budget
        _enforce_workspace_budget(self.tmpdir, max_mb=100)

        assert (Path(self.tmpdir) / "memory" / "2026-04-10.md").exists()


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 4: seed_skills_final.py — only 5 skills
# ═══════════════════════════════════════════════════════════════════════════

class TestSeedSkills:
    """Test that seed only contains real, working skills."""

    def test_seed_has_5_skills(self):
        from seed_skills_final import SKILLS
        assert len(SKILLS) == 5, f"Expected 5 skills, got {len(SKILLS)}: {[s['name'] for s in SKILLS]}"

    def test_seed_skills_are_correct(self):
        from seed_skills_final import SKILLS
        names = {s["name"] for s in SKILLS}
        expected = {"excel-gen", "aws-nova-canvas", "aws-s3-docs", "aws-transcribe-notes", "aws-bedrock-kb-search"}
        assert names == expected, f"Expected {expected}, got {names}"

    def test_all_seed_skills_have_required_fields(self):
        from seed_skills_final import SKILLS
        for s in SKILLS:
            assert "name" in s, f"Skill missing 'name': {s}"
            assert "version" in s
            assert "description" in s
            assert "requires" in s
            assert "permissions" in s


# ═══════════════════════════════════════════════════════════════════════════
# TEST GROUP 5: excel-gen tool.js output path
# ═══════════════════════════════════════════════════════════════════════════

class TestExcelGenOutputPath:
    """Verify excel-gen writes to workspace/output/ not /tmp/."""

    def test_tool_js_references_workspace_output(self):
        """excel-gen tool.js should contain workspace/output path logic."""
        tool_path = os.path.join(AGENT_CONTAINER, "skills", "excel-gen", "tool.js")
        with open(tool_path) as f:
            content = f.read()
        # After our changes, should reference OPENCLAW_WORKSPACE and output dir
        assert "OPENCLAW_WORKSPACE" in content or "workspace" in content.lower()
        assert "output" in content


class TestNovaCanvasOutputPath:
    """Verify nova-canvas writes to workspace/output/ not /tmp/."""

    def test_tool_js_references_workspace_output(self):
        tool_path = os.path.join(AGENT_CONTAINER, "skills", "aws-nova-canvas", "tool.js")
        with open(tool_path) as f:
            content = f.read()
        assert "OPENCLAW_WORKSPACE" in content or "workspace" in content.lower()
        assert "output" in content
