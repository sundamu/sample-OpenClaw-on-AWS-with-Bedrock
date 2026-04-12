"""Seed skill catalog to S3. Only skills with real tool.js implementations."""
import json, boto3, os

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

def get_bucket():
    bucket = os.environ.get("S3_BUCKET", "")
    if bucket:
        return bucket
    account = boto3.client("sts", region_name=AWS_REGION).get_caller_identity()["Account"]
    return f"openclaw-tenants-{account}"

SKILLS = [
    # ── Zero Config (no API key needed) ──
    {
        "name": "excel-gen", "version": "1.0.0",
        "description": "Generate Excel spreadsheets with formulas, charts, and multiple sheets. Output saved to workspace/output/.",
        "author": "ACME IT", "layer": 2, "category": "data", "scope": "department",
        "requires": {"env": [], "tools": ["file_write"]},
        "permissions": {"allowedRoles": ["finance", "management", "hr"], "blockedRoles": []},
        "setupGuide": "setup-guide.md",
    },
    {
        "name": "aws-nova-canvas", "version": "1.0.0",
        "description": "Generate and edit images using Amazon Nova Canvas via Bedrock. Text-to-image, variations, background removal.",
        "author": "ACME IT", "layer": 2, "category": "creative", "scope": "department",
        "requires": {"env": [], "tools": ["file_write"]},
        "permissions": {"allowedRoles": ["sales", "csm", "product", "management"], "blockedRoles": []},
        "awsService": "Amazon Bedrock (Nova Canvas)",
        "setupGuide": "setup-guide.md",
    },
    {
        "name": "aws-s3-docs", "version": "1.0.0",
        "description": "Save, retrieve, list, and share documents via S3. Markdown-to-PDF, pre-signed URLs for secure sharing.",
        "author": "ACME IT", "layer": 2, "category": "productivity", "scope": "department",
        "requires": {"env": [], "tools": ["file_write"]},
        "permissions": {"allowedRoles": ["finance", "legal", "management"], "blockedRoles": []},
        "awsService": "Amazon S3",
        "setupGuide": "setup-guide.md",
    },
    {
        "name": "aws-transcribe-notes", "version": "1.0.0",
        "description": "Transcribe meeting recordings via Amazon Transcribe, then generate structured notes with action items.",
        "author": "ACME IT", "layer": 2, "category": "productivity", "scope": "department",
        "requires": {"env": [], "tools": ["file_write"]},
        "permissions": {"allowedRoles": ["hr", "product", "management"], "blockedRoles": []},
        "awsService": "Amazon Transcribe",
        "setupGuide": "setup-guide.md",
    },
    # ── Platform Key Required ──
    {
        "name": "aws-bedrock-kb-search", "version": "1.0.0",
        "description": "Search enterprise knowledge bases via Amazon Bedrock Knowledge Bases (RAG). Semantic search with source attribution.",
        "author": "ACME IT", "layer": 2, "category": "information", "scope": "department",
        "requires": {"env": ["BEDROCK_KB_ID"], "tools": []},
        "permissions": {"allowedRoles": ["legal", "management"], "blockedRoles": []},
        "awsService": "Amazon Bedrock Knowledge Bases",
        "setupGuide": "setup-guide.md",
    },
]

def seed():
    s3 = boto3.client("s3", region_name=AWS_REGION)
    bucket = get_bucket()
    for skill in SKILLS:
        key = f"_shared/skills/{skill['name']}/skill.json"
        s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(skill, indent=2).encode("utf-8"), ContentType="application/json")
        roles = skill["permissions"]["allowedRoles"]
        scope = "ALL" if "*" in roles else ", ".join(roles)
        env_count = len(skill["requires"].get("env", []))
        key_status = f"needs {env_count} key(s)" if env_count else "zero-config"
        print(f"  {skill['name']:25s} → {scope:30s} [{key_status}]")
    print(f"\nDone! {len(SKILLS)} skills.")

if __name__ == "__main__":
    seed()
