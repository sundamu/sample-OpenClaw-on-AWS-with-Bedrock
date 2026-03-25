"""
Seed DynamoDB with enterprise demo data.
Single-table design: PK/SK pattern from PRD §15.

Usage: python seed_dynamodb.py [--region us-east-2] [--table openclaw-enterprise]
"""
import argparse
import json
import time
import boto3

ORG = "ORG#acme"

def seed(table_name: str, region: str):
    ddb = boto3.resource("dynamodb", region_name=region)
    table = ddb.Table(table_name)

    items = []

    # --- Organization meta ---
    items.append({"PK": ORG, "SK": "META", "GSI1PK": "TYPE#org", "GSI1SK": ORG,
        "name": "ACME Corp", "plan": "enterprise", "createdAt": "2026-01-10T00:00:00Z"})

    # --- Departments ---
    depts = [
        ("dept-eng", "Engineering", None, 22), ("dept-eng-platform", "Platform Team", "dept-eng", 5),
        ("dept-eng-backend", "Backend Team", "dept-eng", 8), ("dept-eng-frontend", "Frontend Team", "dept-eng", 5),
        ("dept-eng-qa", "QA Team", "dept-eng", 4), ("dept-sales", "Sales", None, 12),
        ("dept-sales-ent", "Enterprise Sales", "dept-sales", 5), ("dept-sales-smb", "SMB Sales", "dept-sales", 7),
        ("dept-product", "Product", None, 6), ("dept-finance", "Finance", None, 5),
        ("dept-hr", "HR & Admin", None, 4), ("dept-cs", "Customer Success", None, 6),
        ("dept-legal", "Legal & Compliance", None, 3),
    ]
    for did, name, parent, hc in depts:
        items.append({"PK": ORG, "SK": f"DEPT#{did}", "GSI1PK": "TYPE#dept", "GSI1SK": f"DEPT#{did}",
            "id": did, "name": name, "parentId": parent, "headCount": hc, "createdAt": "2026-01-10T00:00:00Z"})

    # --- Positions ---
    positions = [
        ("pos-sa", "Solutions Architect", "dept-eng", "Engineering", ["jina-reader","deep-research","arch-diagram-gen","cost-calculator"], ["web_search","shell","browser","file","code_execution"], 3),
        ("pos-sde", "Software Engineer", "dept-eng", "Engineering", ["jina-reader","deep-research","github-pr","code-review"], ["web_search","shell","browser","file","file_write","code_execution"], 8),
        ("pos-devops", "DevOps Engineer", "dept-eng-platform", "Platform Team", ["jina-reader","deep-research","github-pr"], ["web_search","shell","browser","file","file_write","code_execution"], 3),
        ("pos-qa", "QA Engineer", "dept-eng-qa", "QA Team", ["jina-reader","deep-research","jira-query"], ["web_search","shell","file","code_execution"], 3),
        ("pos-ae", "Account Executive", "dept-sales", "Sales", ["jina-reader","web-search","crm-query"], ["web_search","file"], 6),
        ("pos-pm", "Product Manager", "dept-product", "Product", ["jina-reader","deep-research","jira-query","transcript"], ["web_search","browser","file"], 4),
        ("pos-fa", "Finance Analyst", "dept-finance", "Finance", ["jina-reader","sap-connector","excel-gen"], ["web_search","file"], 3),
        ("pos-hr", "HR Specialist", "dept-hr", "HR & Admin", ["jina-reader","web-search"], ["web_search","file"], 3),
        ("pos-csm", "Customer Success Manager", "dept-cs", "Customer Success", ["jina-reader","web-search","crm-query","slack-bridge"], ["web_search","file","browser"], 4),
        ("pos-legal", "Legal Counsel", "dept-legal", "Legal & Compliance", ["jina-reader","deep-research"], ["web_search","file"], 2),
        ("pos-exec", "Executive", "dept-eng", "Engineering", ["jina-reader","deep-research","web_search"], ["web_search","shell","browser","file","file_write","code_execution"], 1),
    ]
    for pid, name, did, dname, skills, tools, mc in positions:
        items.append({"PK": ORG, "SK": f"POS#{pid}", "GSI1PK": "TYPE#pos", "GSI1SK": f"POS#{pid}",
            "id": pid, "name": name, "departmentId": did, "departmentName": dname,
            "defaultSkills": skills, "toolAllowlist": tools, "memberCount": mc, "createdAt": "2026-01-20T00:00:00Z"})

    # --- Employees ---
    employees = [
        ("emp-z3", "张三", "EMP-001", "pos-sa", "Solutions Architect", "dept-eng", "Engineering", ["telegram","slack"], "agent-sa-z3", "active"),
        ("emp-l4", "李四", "EMP-002", "pos-sa", "Solutions Architect", "dept-eng", "Engineering", ["whatsapp"], "agent-sa-l4", "active"),
        ("emp-chen", "陈伟", "EMP-003", "pos-sa", "Solutions Architect", "dept-eng", "Engineering", ["feishu"], "agent-sa-chen", "active"),
        ("emp-w5", "王五", "EMP-004", "pos-sde", "Software Engineer", "dept-eng-backend", "Backend Team", ["slack"], "agent-sde-w5", "active"),
        ("emp-liu", "刘洋", "EMP-005", "pos-sde", "Software Engineer", "dept-eng-backend", "Backend Team", ["slack"], "agent-sde-liu", "active"),
        ("emp-yang", "杨帆", "EMP-006", "pos-sde", "Software Engineer", "dept-eng-frontend", "Frontend Team", ["slack","discord"], "agent-sde-yang", "active"),
        ("emp-zhao", "赵磊", "EMP-007", "pos-sde", "Software Engineer", "dept-eng-frontend", "Frontend Team", ["slack"], None, "idle"),
        ("emp-sun", "孙浩", "EMP-008", "pos-devops", "DevOps Engineer", "dept-eng-platform", "Platform Team", ["slack","telegram"], "agent-devops-sun", "active"),
        ("emp-wu", "吴昊", "EMP-009", "pos-devops", "DevOps Engineer", "dept-eng-platform", "Platform Team", ["slack"], "agent-devops-wu", "active"),
        ("emp-huang", "黄丽", "EMP-010", "pos-qa", "QA Engineer", "dept-eng-qa", "QA Team", ["slack"], "agent-qa-huang", "active"),
        ("emp-mike", "Mike Johnson", "EMP-011", "pos-ae", "Account Executive", "dept-sales-ent", "Enterprise Sales", ["whatsapp","slack"], "agent-ae-mike", "active"),
        ("emp-sarah", "Sarah Kim", "EMP-012", "pos-ae", "Account Executive", "dept-sales-ent", "Enterprise Sales", ["whatsapp"], "agent-ae-sarah", "active"),
        ("emp-tom", "Tom Wilson", "EMP-013", "pos-ae", "Account Executive", "dept-sales-smb", "SMB Sales", ["slack"], None, "idle"),
        ("emp-lin", "林小雨", "EMP-014", "pos-pm", "Product Manager", "dept-product", "Product", ["feishu","slack"], "agent-pm-lin", "active"),
        ("emp-alex", "Alex Rivera", "EMP-015", "pos-pm", "Product Manager", "dept-product", "Product", ["slack"], "agent-pm-alex", "idle"),
        ("emp-carol", "Carol Zhang", "EMP-016", "pos-fa", "Finance Analyst", "dept-finance", "Finance", ["slack"], "agent-fa-carol", "active"),
        ("emp-david", "David Park", "EMP-017", "pos-fa", "Finance Analyst", "dept-finance", "Finance", ["slack"], "agent-fa-david", "active"),
        ("emp-jenny", "Jenny Liu", "EMP-018", "pos-hr", "HR Specialist", "dept-hr", "HR & Admin", ["feishu","dingtalk"], "agent-hr-jenny", "active"),
        ("emp-emma", "Emma Chen", "EMP-019", "pos-csm", "Customer Success Manager", "dept-cs", "Customer Success", ["slack","whatsapp"], "agent-csm-emma", "active"),
        ("emp-rachel", "Rachel Li", "EMP-021", "pos-legal", "Legal Counsel", "dept-legal", "Legal & Compliance", ["slack"], "agent-legal-rachel", "active"),
        ("emp-jiade", "JiaDe Wang", "EMP-030", "pos-sa", "Solutions Architect", "dept-eng", "Engineering", ["discord","slack"], "agent-sa-jiade", "active"),
        ("emp-peter", "Peter Wu", "EMP-031", "pos-exec", "Executive", "dept-eng", "Engineering", ["discord"], "agent-exec-peter", "active"),
    ]
    for eid, name, eno, pid, pname, did, dname, chs, aid, ast in employees:
        item = {"PK": ORG, "SK": f"EMP#{eid}", "GSI1PK": "TYPE#emp", "GSI1SK": f"EMP#{eid}",
            "id": eid, "name": name, "employeeNo": eno, "positionId": pid, "positionName": pname,
            "departmentId": did, "departmentName": dname, "channels": chs, "agentStatus": ast, "createdAt": "2026-01-20T00:00:00Z"}
        if aid:
            item["agentId"] = aid
        items.append(item)

    # --- Agents ---
    agents = [
        ("agent-sa-z3", "SA Agent - 张三", "emp-z3", "张三", "pos-sa", "Solutions Architect", "active", 4.6, ["jina-reader","deep-research","arch-diagram-gen","cost-calculator"], ["telegram","slack"]),
        ("agent-sa-l4", "SA Agent - 李四", "emp-l4", "李四", "pos-sa", "Solutions Architect", "active", 4.3, ["jina-reader","deep-research","arch-diagram-gen"], ["whatsapp"]),
        ("agent-sa-chen", "SA Agent - 陈伟", "emp-chen", "陈伟", "pos-sa", "Solutions Architect", "active", 4.4, ["jina-reader","deep-research","arch-diagram-gen","cost-calculator"], ["feishu"]),
        ("agent-sde-w5", "SDE Agent - 王五", "emp-w5", "王五", "pos-sde", "Software Engineer", "active", 4.1, ["jina-reader","deep-research","github-pr","code-review"], ["slack"]),
        ("agent-sde-liu", "SDE Agent - 刘洋", "emp-liu", "刘洋", "pos-sde", "Software Engineer", "active", 4.2, ["jina-reader","deep-research","github-pr"], ["slack"]),
        ("agent-sde-yang", "SDE Agent - 杨帆", "emp-yang", "杨帆", "pos-sde", "Software Engineer", "active", 4.5, ["jina-reader","deep-research","github-pr","code-review"], ["slack","discord"]),
        ("agent-devops-sun", "DevOps Agent - 孙浩", "emp-sun", "孙浩", "pos-devops", "DevOps Engineer", "active", 4.7, ["jina-reader","deep-research","github-pr"], ["slack","telegram"]),
        ("agent-devops-wu", "DevOps Agent - 吴昊", "emp-wu", "吴昊", "pos-devops", "DevOps Engineer", "active", 4.0, ["jina-reader","deep-research","github-pr"], ["slack"]),
        ("agent-qa-huang", "QA Agent - 黄丽", "emp-huang", "黄丽", "pos-qa", "QA Engineer", "active", 4.3, ["jina-reader","deep-research","jira-query"], ["slack"]),
        ("agent-ae-mike", "Sales Agent - Mike", "emp-mike", "Mike Johnson", "pos-ae", "Account Executive", "active", 3.9, ["jina-reader","web-search","crm-query"], ["whatsapp","slack"]),
        ("agent-ae-sarah", "Sales Agent - Sarah", "emp-sarah", "Sarah Kim", "pos-ae", "Account Executive", "active", 4.4, ["jina-reader","web-search","crm-query"], ["whatsapp"]),
        ("agent-pm-lin", "PM Agent - 林小雨", "emp-lin", "林小雨", "pos-pm", "Product Manager", "active", 4.5, ["jina-reader","deep-research","jira-query","transcript"], ["feishu","slack"]),
        ("agent-pm-alex", "PM Agent - Alex", "emp-alex", "Alex Rivera", "pos-pm", "Product Manager", "idle", 3.8, ["jina-reader","deep-research","jira-query"], ["slack"]),
        ("agent-fa-carol", "Finance Agent - Carol", "emp-carol", "Carol Zhang", "pos-fa", "Finance Analyst", "active", 4.5, ["jina-reader","sap-connector","excel-gen"], ["slack"]),
        ("agent-fa-david", "Finance Agent - David", "emp-david", "David Park", "pos-fa", "Finance Analyst", "active", 4.2, ["jina-reader","sap-connector"], ["slack"]),
        ("agent-hr-jenny", "HR Agent - Jenny", "emp-jenny", "Jenny Liu", "pos-hr", "HR Specialist", "active", 4.1, ["jina-reader","web-search"], ["feishu","dingtalk"]),
        ("agent-csm-emma", "CSM Agent - Emma", "emp-emma", "Emma Chen", "pos-csm", "Customer Success Manager", "active", 4.6, ["jina-reader","web-search","crm-query","slack-bridge"], ["slack","whatsapp"]),
        ("agent-legal-rachel", "Legal Agent - Rachel", "emp-rachel", "Rachel Li", "pos-legal", "Legal Counsel", "active", 4.8, ["jina-reader","deep-research"], ["slack"]),
        ("agent-sa-jiade", "SA Agent - JiaDe", "emp-jiade", "JiaDe Wang", "pos-sa", "Solutions Architect", "active", None, ["jina-reader","deep-research","arch-diagram-gen","cost-calculator"], ["discord","slack"]),
        ("agent-exec-peter", "Executive Agent - Peter", "emp-peter", "Peter Wu", "pos-exec", "Executive", "active", None, ["jina-reader","deep-research","web_search"], ["discord"]),
        ("agent-helpdesk", "IT Help Desk Agent", None, "(Shared)", "pos-devops", "DevOps Engineer", "active", 4.0, ["jina-reader","web-search","jira-query"], ["discord","slack"]),
        ("agent-onboarding", "Onboarding Assistant", None, "(Shared)", "pos-hr", "HR Specialist", "active", 4.3, ["jina-reader","web-search"], ["feishu","slack"]),
    ]
    for aid, name, eid, ename, pid, pname, status, qs, skills, chs in agents:
        item = {"PK": ORG, "SK": f"AGENT#{aid}", "GSI1PK": "TYPE#agent", "GSI1SK": f"AGENT#{aid}",
            "id": aid, "name": name, "employeeName": ename, "positionId": pid, "positionName": pname,
            "status": status, "qualityScore": str(qs), "skills": skills, "channels": chs,
            "soulVersions": {"global": 3, "position": 1, "personal": 1 if eid else 0},
            "createdAt": "2026-01-25T00:00:00Z", "updatedAt": "2026-03-20T00:00:00Z"}
        if eid:
            item["employeeId"] = eid
        items.append(item)

    # --- Bindings ---
    bindings = [
        ("bind-01", "emp-z3", "张三", "agent-sa-z3", "SA Agent - 张三", "1:1", "telegram", "active"),
        ("bind-02", "emp-z3", "张三", "agent-sa-z3", "SA Agent - 张三", "1:1", "slack", "active"),
        ("bind-03", "emp-l4", "李四", "agent-sa-l4", "SA Agent - 李四", "1:1", "whatsapp", "active"),
        ("bind-05", "emp-w5", "王五", "agent-sde-w5", "SDE Agent - 王五", "1:1", "slack", "active"),
        ("bind-08", "emp-sun", "孙浩", "agent-devops-sun", "DevOps Agent - 孙浩", "1:1", "slack", "active"),
        ("bind-11", "emp-mike", "Mike Johnson", "agent-ae-mike", "Sales Agent - Mike", "1:1", "whatsapp", "active"),
        ("bind-15", "emp-carol", "Carol Zhang", "agent-fa-carol", "Finance Agent - Carol", "1:1", "slack", "active"),
        ("bind-20", "emp-z3", "张三", "agent-helpdesk", "IT Help Desk Agent", "N:1", "discord", "active"),
        ("bind-21", "emp-w5", "王五", "agent-helpdesk", "IT Help Desk Agent", "N:1", "discord", "active"),
        ("bind-27", "emp-z3", "张三", "agent-sde-w5", "SDE Agent - 王五", "1:N", "slack", "active"),
    ]
    for bid, eid, ename, aid, aname, mode, ch, st in bindings:
        items.append({"PK": ORG, "SK": f"BIND#{bid}", "GSI1PK": f"AGENT#{aid}", "GSI1SK": f"BIND#{bid}",
            "id": bid, "employeeId": eid, "employeeName": ename, "agentId": aid, "agentName": aname,
            "mode": mode, "channel": ch, "status": st, "createdAt": "2026-02-01T00:00:00Z"})

    # --- Write all items ---
    print(f"Writing {len(items)} items to {table_name}...")
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=item)
    print(f"Done! {len(items)} items seeded.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", default="openclaw-enterprise")
    parser.add_argument("--region", default="us-east-2")
    args = parser.parse_args()
    seed(args.table, args.region)
