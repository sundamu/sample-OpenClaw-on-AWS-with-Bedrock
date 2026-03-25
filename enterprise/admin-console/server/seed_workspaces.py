"""Seed S3 with sample workspace files for key employees."""
import boto3, os

AWS_REGION = os.environ.get("AWS_REGION", "us-east-2")

def get_bucket():
    account = boto3.client("sts", region_name=AWS_REGION).get_caller_identity()["Account"]
    return f"openclaw-tenants-{account}"

def put(s3, bucket, key, content):
    s3.put_object(Bucket=bucket, Key=key, Body=content.encode("utf-8"), ContentType="text/markdown")

EMPLOYEES = {
    "emp-z3": {"name": "Zhang San", "role": "Solutions Architect", "dept": "Engineering", "tz": "Asia/Shanghai", "lang": "Chinese preferred, English OK",
        "focus": "Project Phoenix microservice migration", "style": "Concise, code examples over prose. Comparison tables for costs.",
        "memory": "Chose ECS over EKS for Project Phoenix. Recommended HTTP API over REST API. Adopted DynamoDB single-table design.",
        "daily": "Reviewed microservice architecture. Cost estimate $847/mo. Suggested 40% optimization via Graviton + HTTP API."},
    "emp-mike": {"name": "Mike Johnson", "role": "Account Executive", "dept": "Enterprise Sales", "tz": "America/New_York", "lang": "English",
        "focus": "Fortune 500 accounts — TechCorp and Acme Manufacturing deals", "style": "ROI-focused, always prepare battle cards before calls.",
        "memory": "TechCorp deal at Negotiation stage, $250K. Acme Manufacturing at Proposal, $180K. Q2 pipeline target: $1.2M.",
        "daily": "Prepared competitive analysis for TechCorp. Updated CRM pipeline. Scheduled QBR with Acme for next week."},
    "emp-carol": {"name": "Carol Zhang", "role": "Finance Analyst", "dept": "Finance", "tz": "America/Los_Angeles", "lang": "English",
        "focus": "Q2 2026 budget variance reports", "style": "Tables and charts over narrative. Always include variance analysis.",
        "memory": "Engineering Q2 budget: $500K allocated, 37.5% utilized. SaaS license renewal due April 15. Travel budget under-spent.",
        "daily": "Generated Q2 budget variance report for Engineering. Flagged SaaS license renewal. Updated forecast model."},
    "emp-lin": {"name": "Lin Xiaoyu", "role": "Product Manager", "dept": "Product", "tz": "Asia/Shanghai", "lang": "Chinese preferred",
        "focus": "Enterprise console v2 features, user research synthesis", "style": "Data-driven, RICE framework for prioritization.",
        "memory": "Top feature request: department tree drag-and-drop. NPS score: 72. Sprint 12 velocity: 34 points.",
        "daily": "Synthesized 5 user interviews. Key finding: admins want bulk agent provisioning. Updated roadmap in Notion."},
    "emp-emma": {"name": "Emma Chen", "role": "Customer Success Manager", "dept": "Customer Success", "tz": "America/New_York", "lang": "English",
        "focus": "Enterprise accounts QBR preparation", "style": "Health score driven, proactive outreach for at-risk accounts.",
        "memory": "TechCorp health score: 85 (green). DataFlow Inc: 62 (yellow, declining usage). QBR deck template updated.",
        "daily": "Prepared QBR deck for TechCorp. Flagged DataFlow as at-risk. Scheduled check-in call for Friday."},
    "emp-rachel": {"name": "Rachel Li", "role": "Legal Counsel", "dept": "Legal & Compliance", "tz": "America/New_York", "lang": "English",
        "focus": "GDPR compliance review, vendor contract templates", "style": "Cite specific regulations. Always add legal disclaimer.",
        "memory": "Updated DPA template for GDPR Article 28. Vendor contract review backlog: 3 pending. SOC 2 audit scheduled May.",
        "daily": "Reviewed 2 vendor contracts. Flagged missing data processing addendum in CloudVendor agreement."},
    "emp-jiade": {"name": "JiaDe Wang", "role": "Solutions Architect", "dept": "Engineering", "tz": "Asia/Shanghai", "lang": "Chinese preferred, English OK",
        "focus": "OpenClaw Enterprise on AgentCore — multi-tenant digital workforce platform", "style": "Technical, concise. Architecture diagrams and cost comparisons.",
        "memory": "Leading OpenClaw Enterprise project. Gateway architecture with H2 Proxy + Tenant Router. 22 employees, 22 agents deployed. Discord Bot connected.",
        "daily": "Deployed v21 Docker image with stderr JSON fix. Added JiaDe and Peter to DynamoDB. Verified SOUL injection working for both accounts."},
    "emp-peter": {"name": "Peter Wu", "role": "Executive", "dept": "Engineering", "tz": "Asia/Hong_Kong", "lang": "Chinese preferred, English OK",
        "focus": "Strategic planning, team management, technology evaluation", "style": "High-level, strategic. Focus on business impact and ROI.",
        "memory": "Evaluating OpenClaw Enterprise for team adoption. Interested in cost savings vs ChatGPT Team. Concerned about cold start latency.",
        "daily": "Tested Discord Bot integration. Verified role-based access control — no finance/HR data access as Executive role."},
}

def seed():
    s3 = boto3.client("s3", region_name=AWS_REGION)
    bucket = get_bucket()
    count = 0

    for emp_id, e in EMPLOYEES.items():
        prefix = f"{emp_id}/workspace"

        # IDENTITY.md
        put(s3, bucket, f"{prefix}/IDENTITY.md", f"""# Agent Identity

- **Name:** {e['name']}'s AI Assistant
- **Role:** {e['role']} Digital Employee
- **Department:** {e['dept']}
- **Vibe:** Professional, knowledgeable, {e['style'].split('.')[0].lower()}
""")

        # USER.md
        put(s3, bucket, f"{prefix}/USER.md", f"""# User Profile — {e['name']}

- **Name:** {e['name']}
- **Role:** {e['role']}
- **Department:** {e['dept']}
- **Timezone:** {e['tz']}
- **Language:** {e['lang']}
- **Communication style:** {e['style']}
- **Current focus:** {e['focus']}
""")

        # MEMORY.md
        put(s3, bucket, f"{prefix}/MEMORY.md", f"""# Agent Memory — {e['name']}

## Key Context
{e['memory']}

## Learned Preferences
- {e['style']}
""")

        # Daily memory
        put(s3, bucket, f"{prefix}/memory/2026-03-20.md", f"""# March 20, 2026

## Session Summary
{e['daily']}
""")

        count += 1
        print(f"  {emp_id} ({e['name']}): IDENTITY.md, USER.md, MEMORY.md, memory/2026-03-20.md")

    print(f"\nDone! {count} employee workspaces seeded.")

if __name__ == "__main__":
    seed()
