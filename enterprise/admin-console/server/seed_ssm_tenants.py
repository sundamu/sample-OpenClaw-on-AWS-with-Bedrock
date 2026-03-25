"""Seed SSM Parameter Store with tenant→position mappings.
These are read by workspace_assembler.py at microVM startup."""
import argparse
import boto3

STACK = "openclaw-prod"

TENANTS = {
    # tenant_id → position_id
    # Personal agents: tenant_id = employee_id
    "emp-z3": "pos-sa",
    "emp-l4": "pos-sa",
    "emp-chen": "pos-sa",
    "emp-w5": "pos-sde",
    "emp-liu": "pos-sde",
    "emp-yang": "pos-sde",
    "emp-sun": "pos-devops",
    "emp-wu": "pos-devops",
    "emp-huang": "pos-qa",
    "emp-mike": "pos-ae",
    "emp-sarah": "pos-ae",
    "emp-lin": "pos-pm",
    "emp-alex": "pos-pm",
    "emp-carol": "pos-fa",
    "emp-david": "pos-fa",
    "emp-jenny": "pos-hr",
    "emp-emma": "pos-csm",
    "emp-rachel": "pos-legal",
    "emp-jiade": "pos-sa",
    "emp-peter": "pos-exec",
    # Shared agents
    "agent-helpdesk": "pos-devops",
    "agent-onboarding": "pos-hr",
}

def seed(region, stack):
    ssm = boto3.client("ssm", region_name=region)
    count = 0
    for tid, pos in TENANTS.items():
        ssm.put_parameter(
            Name=f"/openclaw/{stack}/tenants/{tid}/position",
            Value=pos,
            Type="String",
            Overwrite=True,
        )
        count += 1
        print(f"  {tid} -> {pos}")
    print(f"\nDone! {count} tenant→position mappings in SSM ({region})")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--region", default="us-east-2")
    p.add_argument("--stack", default="openclaw-prod")
    a = p.parse_args()
    seed(a.region, a.stack)
