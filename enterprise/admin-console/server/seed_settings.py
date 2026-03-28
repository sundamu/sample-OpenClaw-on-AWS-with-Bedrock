"""Seed DynamoDB with settings (model config, security policy)."""
import argparse
import json
import boto3

ORG = "ORG#acme"

def seed(table_name: str, region: str):
    ddb = boto3.resource("dynamodb", region_name=region)
    table = ddb.Table(table_name)
    items = []

    # Model config
    items.append({"PK": ORG, "SK": "CONFIG#model", "GSI1PK": "TYPE#config", "GSI1SK": "CONFIG#model",
        "default": {"modelId": "global.amazon.nova-2-lite-v1:0", "modelName": "Amazon Nova 2 Lite", "inputRate": "0.30", "outputRate": "2.50"},
        "fallback": {"modelId": "us.amazon.nova-pro-v1:0", "modelName": "Amazon Nova Pro", "inputRate": "0.80", "outputRate": "3.20"},
        "positionOverrides": {
            "pos-exec":  {"modelId": "global.anthropic.claude-sonnet-4-6", "modelName": "Claude Sonnet 4.6", "inputRate": "3.00", "outputRate": "15.00", "reason": "Executive tier — highest capability"},
            "pos-sa":    {"modelId": "global.anthropic.claude-sonnet-4-5-20250929-v1:0", "modelName": "Claude Sonnet 4.5", "inputRate": "3.00", "outputRate": "15.00", "reason": "Deep reasoning for architecture reviews"},
            "pos-legal": {"modelId": "us.amazon.nova-pro-v1:0", "modelName": "Amazon Nova Pro", "inputRate": "0.80", "outputRate": "3.20", "reason": "Balanced capability for legal analysis"},
        },
        "availableModels": [
            {"modelId": "global.amazon.nova-2-lite-v1:0", "modelName": "Amazon Nova 2 Lite", "inputRate": "0.30", "outputRate": "2.50", "enabled": True},
            {"modelId": "us.amazon.nova-pro-v1:0", "modelName": "Amazon Nova Pro", "inputRate": "0.80", "outputRate": "3.20", "enabled": True},
            {"modelId": "global.anthropic.claude-sonnet-4-5-20250929-v1:0", "modelName": "Claude Sonnet 4.5", "inputRate": "3.00", "outputRate": "15.00", "enabled": True},
            {"modelId": "global.anthropic.claude-opus-4-6-v1", "modelName": "Claude Opus 4.6", "inputRate": "15.00", "outputRate": "75.00", "enabled": False},
            {"modelId": "us.deepseek.r1-v1:0", "modelName": "DeepSeek R1", "inputRate": "0.55", "outputRate": "2.19", "enabled": False},
            {"modelId": "moonshotai.kimi-k2.5", "modelName": "Kimi K2.5", "inputRate": "0.60", "outputRate": "3.00", "enabled": False},
        ],
    })

    # Security config
    items.append({"PK": ORG, "SK": "CONFIG#security", "GSI1PK": "TYPE#config", "GSI1SK": "CONFIG#security",
        "alwaysBlocked": ["install_skill", "load_extension", "eval", "rm -rf /", "chmod 777"],
        "piiDetection": {"enabled": True, "mode": "redact"},
        "dataSovereignty": {"enabled": True, "region": "us-east-2"},
        "conversationRetention": {"days": 180},
        "dockerSandbox": True,
        "fastPathRouting": True,
        "verboseAudit": False,
    })

    # KB assignments — which knowledge bases each position receives by default.
    # All positions get company policies + onboarding; role-specific KBs are layered on top.
    # Admins can adjust these from Knowledge Base → Assignments tab in the Admin Console.
    items.append({"PK": ORG, "SK": "CONFIG#kb-assignments", "GSI1PK": "TYPE#config", "GSI1SK": "CONFIG#kb-assignments",
        "positionKBs": {
            "pos-sa":     ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-cases", "kb-arch"],
            "pos-sde":    ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-arch", "kb-runbooks"],
            "pos-devops": ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-runbooks"],
            "pos-qa":     ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-arch"],
            "pos-ae":     ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-cases"],
            "pos-pm":     ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-product"],
            "pos-fa":     ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-finance"],
            "pos-hr":     ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-hr"],
            "pos-csm":    ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-customer", "kb-cases"],
            "pos-legal":  ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-legal"],
            "pos-exec":   ["kb-policies", "kb-onboarding", "kb-org-directory", "kb-finance", "kb-product"],
            "pos-admin":  ["kb-policies", "kb-onboarding", "kb-org-directory"],
        },
        "employeeKBs": {},
    })

    print(f"Writing {len(items)} config items...")
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=item)
    print("Done!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", default="openclaw-enterprise")
    parser.add_argument("--region", default="us-east-2")
    args = parser.parse_args()
    seed(args.table, args.region)
