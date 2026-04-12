# Plan: Fargate 取代 AgentCore — 顶层设计思考

> 状态: 思考中（不是最终计划）
> 核心问题: **Fargate 容器里跑的是原生 OpenClaw。如果没有管控层，用户直接去跑 OpenClaw 就行了。我们平台的价值是什么？平台的每个管控能力在 Fargate 下怎么实现？**

---

## 第一部分：平台的价值 — 我们在 OpenClaw 之上加了什么

OpenClaw 是一个开源的个人 AI 助手。一个人用它很好。但企业不能让 500 个员工各自跑 OpenClaw — 没有管控、没有审计、没有成本控制、没有安全边界。

**我们的平台在 OpenClaw 之上加了这些管控层：**

| 管控维度 | 平台提供什么 | 如果没有平台 |
|---------|-----------|-----------|
| **身份管控 (SOUL)** | Admin 定义 3 层 SOUL（全局规则 + 职位角色 + 个人人设），每个员工的 agent 只能看到自己该看的 | 员工可以随意修改 agent 的 system prompt |
| **工具权限 (Plan A)** | 每个职位一套工具白名单（FA 不能用 shell，SDE 可以）| 所有人拥有所有工具 |
| **安全防线 (Guardrail)** | Bedrock Guardrail 拦截敏感话题和 PII 泄露 | 无拦截 |
| **IAM 隔离 (L3)** | 不同职位的 agent 有不同的 AWS 权限（Restricted 只读，Executive 广泛）| 所有 agent 共享一个 IAM role |
| **调用审计** | 每次调用写 AUDIT#（谁、什么时间、问了什么、用了什么工具）| 无审计 |
| **用量追踪** | 每次调用写 USAGE#（token 数、成本、模型）| 无成本可见性 |
| **会话管理** | Admin 可以看到所有员工的会话，可以接管(takeover) | 无可见性 |
| **组织管理** | 员工自动匹配职位 → 自动获得对应的 SOUL + 权限 + 模型 | 手动配置每个人 |
| **IM 绑定** | 员工通过 Portal 绑定 Telegram/Discord，Admin 控制谁能用 | 任何人连上就能用 |
| **Skills 管控** | Admin 审批员工提交的 skill，安全扫描后才上线 | 员工自己装任何 skill |
| **Knowledge 管控** | Admin 控制哪些知识库给哪些职位 | 无知识隔离 |
| **Memory 安全** | 防 memory poisoning（注入攻击检测）| 无防护 |

---

## 第二部分：当前这些管控在 AgentCore 模式下怎么实现

### 2.1 管控注入点

管控不是在 OpenClaw 外面加的，是**注入到 OpenClaw 内部**的：

```
microVM 启动
  │
  v
entrypoint.sh
  ├── 注入 openclaw.json（模型配置、Gateway 设置）
  ├── S3 下载 workspace → 包含 Admin 写的 SOUL.md
  └── workspace_assembler.py
      ├── 合并 3 层 SOUL → 写入 SOUL.md（OpenClaw 读这个作为 system prompt）
      ├── 注入 Plan A 工具白名单（写入 SOUL.md context block）
      ├── 注入 IDENTITY.md（员工身份）
      ├── 注入 CHANNELS.md（IM 通道，用于主动推送）
      ├── 注入 knowledge/ 文件（知识库内容）
      └── 注入 AGENTS.md, TOOLS.md（agent 行为定义）
  │
  v
server.py（在 OpenClaw 之上的包装层）
  ├── 接收 /invocations → 调用 openclaw agent CLI
  ├── Guardrail 检查（INPUT/OUTPUT）
  ├── Plan E 审计（响应中是否出现被禁工具）
  ├── 写 DynamoDB: USAGE#, AUDIT#, SESSION#, CONV#
  ├── Memory 同步（fire-and-forget S3 sync）
  └── config_version 轮询（5 分钟检查 Admin 是否改了配置）
  │
  v
skill_loader.py
  ├── 按职位加载 S3 上的 Layer 2 skills
  ├── 权限过滤（不该有的 skill 不加载）
  └── API key 注入（SSM SecureString）
```

**关键洞察：我们的管控是通过"在 OpenClaw 启动前/调用时注入配置和拦截"实现的，不是通过修改 OpenClaw 源码。**

这意味着：
- **server.py 是管控的核心** — 它包装了 openclaw CLI，在调用前后加入了审计、guardrail、权限检查
- **workspace_assembler.py 是配置注入的核心** — 它决定了 OpenClaw 看到什么 SOUL、什么工具、什么知识
- **entrypoint.sh 是启动编排的核心** — 它确保所有配置注入完成后 OpenClaw 才启动

### 2.2 Admin 的管控手段

| Admin 操作 | 怎么传达到 agent |
|-----------|---------------|
| 改 Global SOUL | S3 更新 → bump config_version → microVM 轮询检测 → 清缓存 → 下次调用重新组装 |
| 改 Position SOUL | 同上 |
| 改工具白名单 | DynamoDB POS#.toolAllowlist → 下次冷启动 permissions.py 读取 |
| 改模型 | DynamoDB CONFIG#model → server.py 冷启动时读取 |
| 改 Guardrail | 环境变量 GUARDRAIL_ID → 需要 runtime update（杀所有 session）|
| 改 KB 分配 | DynamoDB CONFIG#kb-assignments → stop_employee_session → 冷启动重新组装 |
| 紧急接管 session | DynamoDB SESSION#.takeover → server.py 检测到后跳过 agent 调用 |
| 刷新 agent | stop_employee_session → 杀 microVM → 下次调用冷启动 |

---

## 第三部分：Fargate 下这些管控怎么实现

### 3.1 不变的部分

| 管控 | 为什么不变 |
|------|----------|
| **server.py** | 在 Fargate 容器内运行，代码完全一样。Guardrail、审计、usage 写入、Plan E 全部保留。 |
| **workspace_assembler.py** | 冷启动组装逻辑不变。SOUL、Plan A、IDENTITY、knowledge 注入方式不变。 |
| **skill_loader.py** | 按职位加载 skill 的逻辑不变。 |
| **entrypoint.sh** | EFS mode 已实现。启动流程基本不变（S3 bootstrap → 组装 → Gateway 启动 → server.py 启动）。 |
| **DynamoDB 可观测性** | USAGE#, AUDIT#, SESSION#, CONV# 全部在 server.py 内写入，与计算平台无关。 |
| **Guardrail** | GUARDRAIL_ID 环境变量 → server.py _apply_guardrail()。不变。 |
| **Plan A** | permissions.py 读 DynamoDB POS#.toolAllowlist → 注入 SOUL.md context block。不变。 |

### 3.2 需要重新设计的部分

| 管控 | AgentCore 实现 | Fargate 需要怎么做 | 难度 |
|------|--------------|-----------------|------|
| **Config 传达** | bump config_version → 5 分钟轮询 → 清缓存 | **同样方式可行** — server.py 的 config_version 轮询在 Fargate 内一样工作 | 低 |
| **强制刷新** | stop_employee_session → 杀 microVM | **ECS StopTask or force-new-deployment** — 但这会杀所有员工的 session，不只是一个 | **中** — 需要更精细的刷新（不杀容器，只清 _assembled_tenants 缓存）|
| **模型/Guardrail 变更** | runtime update → 杀所有 session | **ECS 更新 Task Definition + force-new-deployment** — rolling update，不中断 | **中** |
| **IM 连接管控** | EC2 Gateway 统一接入，Admin 控制绑定 | **容器内 Gateway 直连 IM** — Admin 怎么控制谁能连？怎么断开？ | **高** |
| **Session 接管 (takeover)** | DynamoDB SESSION#.takeover → server.py 检测 | **同样方式** — server.py 每次调用检查 takeover 字段。但 IM 直连模式下，消息不经过 server.py... | **高** |
| **IM 绑定验证** | H2 Proxy checkImBinding → 未绑定的拒绝 | **谁来验证？** 如果容器直连 IM，消息直接到 Gateway，不经过绑定验证... | **高** |
| **IM 自助配对** | H2 Proxy 拦截 /start TOKEN → BIND | **容器内 Gateway 怎么实现配对流？** | **高** |

### 3.3 核心难题：IM 直连 vs 管控

**这是 Fargate 架构的根本矛盾：**

如果容器内的 OpenClaw Gateway 直连 IM 平台：
- 好处：HEARTBEAT 工作、主动推送、工具永远可用、无冷启动
- 坏处：**消息不经过我们的管控层（H2 Proxy）**

当前 H2 Proxy 做了这些管控：
1. IM 绑定验证（未绑定的 IM 账号被拒绝）
2. IM 自助配对（/start TOKEN → BIND 确认）
3. 冷启动优化（cold→fast-path）
4. Admin 会话旁路

如果容器直连 IM，这些管控在哪里执行？

**可能的方案：**

**方案 A：在 OpenClaw 的 plugin/hook 机制中注入管控**
- OpenClaw 可能有 pre-message hook — 在处理消息前调用我们的验证逻辑
- 需要研究 OpenClaw 的 plugin API

**方案 B：在 server.py 层拦截**
- 所有 IM 消息最终都经过 Bedrock Converse 调用
- 在 openclaw.json 中把 baseUrl 指向 server.py 内部的一个代理
- server.py 在代理层做绑定验证、审计
- 这基本就是 H2 Proxy 的思路，只不过跑在容器内

**方案 C：保留一个轻量的"管控代理"在 EC2 或单独容器**
- 不是完整的 H2 Proxy，只做绑定验证和配对
- 容器内 Gateway 的 baseUrl 指向这个代理
- 代理转发到真正的 Bedrock

**方案 D：在 OpenClaw Gateway 层面配置 allowFrom**
- OpenClaw 已有 allowFrom 机制（只允许特定 IM 用户）
- workspace_assembler.py 根据 DynamoDB 绑定数据生成 allowFrom 配置
- 容器启动时注入 → 只有已绑定的员工才能发消息
- **这是最自然的方案** — 利用 OpenClaw 自己的权限机制

---

## 第四部分：我需要在写最终计划前搞清楚的事

1. **OpenClaw 的 allowFrom 机制** — 它能做到什么程度的 IM 用户过滤？动态更新还是只在启动时读？
2. **OpenClaw 的 plugin/hook API** — 是否有 pre-message 钩子可以注入我们的逻辑？
3. **一个 bot token 多容器的问题** — 4 个 tier 容器能否共用一个 bot？需要看 OpenClaw Gateway 用的是 webhook 还是 long-polling
4. **HEARTBEAT 的实现** — 它是 Gateway 进程内定时触发的还是 cron？需要持久连接还是可以按需发？
5. **容器内 Gateway 直连 IM 后，Admin 怎么断开一个员工的 IM** — 是动态更新 allowFrom 还是重启容器
6. **Portal chat 怎么路由到 Fargate** — Portal 不走 IM，走 HTTP。当前是 Playground send → Tenant Router → AgentCore。需要改为直接调 Fargate 容器。
7. **每个 PRD 的"force refresh"** — 7+ 个模块用 stop_employee_session()。Fargate 下这个操作的替代方案是什么？不能每次改个配置就杀掉整个容器。

### 这些问题我的初步判断

对于 #1-#5（IM 相关）：**Phase 2。本次先不做 IM 直连。** 通过 Portal chat + H2 Proxy 路由验证 Fargate 核心功能（SOUL、权限、Guardrail、审计、存储）。IM 直连需要更深入研究 OpenClaw 的 allowFrom 和 hook 机制。

对于 #6：**本次必须做。** Portal chat → Fargate 是验证管控层在 Fargate 下工作的最小路径。

对于 #7：**本次必须设计。** Fargate 下的 "refresh" 可以是：
- 清 server.py 的 _assembled_tenants 缓存（不杀容器，只让下次调用重新组装 workspace）
- 通过一个 HTTP endpoint（如 /admin/refresh?emp_id=xxx）触发容器内的缓存清除
- 这比杀 microVM 更优雅

---

## 第五部分：下一步

**我不会现在就开始写代码。** 我需要：

1. 研究 OpenClaw 的 allowFrom、plugin hook、IM 连接模式
2. 为每个 PRD 的管控点写一个 "Fargate 下怎么实现" 的映射表
3. 设计 server.py 的 `/admin/refresh` endpoint（容器内刷新，不杀容器）
4. 设计 Portal chat → Fargate 路由的具体实现
5. 然后才写最终的实现计划和测试用例

**你觉得这个思考方向对吗？还是你认为 IM 直连必须在 Phase 1？**

---

## 第六部分：详细执行计划（获批后的 4 小时工作）

### 6.0 总体分工

| 阶段 | 时间 | 9 步法对应 | 交付物 |
|------|------|----------|--------|
| A. 研究 OpenClaw 机制 | 30 min | Step 2 (分析现有代码) | 补充到本文档第四部分 |
| B. 12 PRD 管控映射表 | 30 min | Step 1 (PRD) + Step 3 (设计) | 补充到本文档第三部分 |
| C. 设计文档 | 30 min | Step 3 (设计文档) | enterprise/docs/design-fargate-phase1.md |
| D. 讨论确认 | — | Step 4 (与用户讨论) | 你审批后继续 |
| E. 编写测试用例 | 20 min | Step 5 (测试先行) | enterprise/tests/test-fargate-e2e.sh |
| F. 实现代码 | 60 min | Step 6 (实现) | 修改 6-8 个文件 |
| G. Docker rebuild + 部署 | 30 min | Step 6 (实现) | ECR push + ECS services |
| H. 端到端测试 (50+ 调用) | 40 min | Step 7 (测试 + 回归) | enterprise/docs/fargate-test-results.md |
| I. 文档更新 + 等待提交 | 10 min | Step 8-9 (UI guide + 等待) | worklog, TODO, memory |

### 6.1 阶段 A：研究 OpenClaw 机制 (30 min)

**目的：** 搞清楚第四部分列出的 7 个开放问题。

**具体操作：**

```bash
# 1. 查 OpenClaw allowFrom 配置结构
# SSH 到 EC2，查看当前 Discord allowFrom 文件
aws ssm start-session --target i-054cb53703d2ba33c --region us-east-2
cat /home/ubuntu/.openclaw/credentials/discord-default-allowFrom.json

# 2. 查 OpenClaw Gateway 的 IM 连接模式
# 看 Gateway 日志，确认是 webhook 还是 long-polling
sudo journalctl -u openclaw-gateway --since "1 hour ago" | grep -i "telegram\|discord\|webhook\|polling"

# 3. 查 openclaw CLI 帮助
/home/ubuntu/.nvm/versions/node/*/bin/openclaw --help
/home/ubuntu/.nvm/versions/node/*/bin/openclaw gateway --help
/home/ubuntu/.nvm/versions/node/*/bin/openclaw channels --help

# 4. 查 OpenClaw 的 hook/plugin 机制
find /home/ubuntu/.openclaw -name "*.json" -o -name "*.js" | head -20
cat /home/ubuntu/.openclaw/openclaw.json | python3 -m json.tool

# 5. 读 OpenClaw npm 包源码中的 IM 连接代码
find /home/ubuntu/.nvm/versions/node/*/lib/node_modules/openclaw -name "*telegram*" -o -name "*discord*" -o -name "*channel*" 2>/dev/null | head -20
```

**输出：** 更新本文档第四部分的 7 个问题答案。

### 6.2 阶段 B：12 PRD 管控映射表 (30 min)

**目的：** 逐个 PRD 列出"Admin 管控点 → AgentCore 实现 → Fargate 实现"。

**具体操作：** 对照 agent 报告的 12 PRD 摘要，写映射表。格式：

```markdown
### PRD-security-center
| 管控点 | AgentCore 实现 | Fargate 实现 | 改动量 |
|--------|--------------|-------------|--------|
| Runtime 分配 | DDB CONFIG#routing → Tenant Router → AgentCore API | DDB POS#.fargateTier → 路由到 ECS 容器 | 中 |
| 工具白名单变更 | bump_config_version → 5min 轮询 | 同（server.py 轮询不变）| 无 |
| 强制刷新 | stop_employee_session → 杀 microVM | POST /admin/refresh → 清 _assembled_tenants | 小 |
```

**输出：** 补充到本文档第三部分。

### 6.3 阶段 C：设计文档 (30 min)

**目的：** 写 file-by-file 的改动计划，before/after code。

**文件：** `enterprise/docs/design-fargate-phase1.md`

**结构：**
1. 每个需要改的文件：改什么、为什么、before/after 代码片段
2. 新增文件：内容和用途
3. 不改的文件：为什么不需要改
4. 依赖关系图：哪个改动依赖哪个

**必须覆盖的文件改动：**

| 文件 | 改动描述 |
|------|---------|
| `agent-container/server.py` | 新增 `/admin/refresh` endpoint — 清 `_assembled_tenants[emp_id]`，不杀容器 |
| `agent-container/entrypoint.sh` | 已有 FARGATE_TIER SSM 注册，确认 EFS mode 完整 |
| `gateway/bedrock_proxy_h2.js` | `routeRequest()` 增加 Fargate 路径：查 DDB POS#.deployMode → 直接 POST 到容器 |
| `gateway/tenant_router.py` | 已有 Fargate tier 路由，确认兼容 |
| `admin-console/server/routers/security.py` | 已有 deploy-mode + tier API，确认完整 |
| `admin-console/server/routers/playground.py` | `playground_send()` live 模式增加 Fargate 路径 |
| `admin-console/server/shared.py` | `stop_employee_session()` 增加 Fargate 模式（调容器 /admin/refresh 而非杀 microVM）|
| `deploy.sh` | 已有 Step 4.5，确认 4 tier task definition 正确 |

### 6.4 阶段 D：讨论确认

**目的：** 你审批设计文档后再写代码。

**如果你不在线：** 我按设计文档执行，但不提交。

### 6.5 阶段 E：编写测试用例 (20 min)

**目的：** 测试先行。写一个可执行的 bash 脚本，50+ 真实调用。

**文件：** `enterprise/tests/test-fargate-e2e.sh`

**测试脚本结构：**

```bash
#!/bin/bash
# Fargate E2E Test Suite — 50+ 真实调用
# 环境: us-east-2, stack=openclaw-e2e-test
# 前提: 4 个 tier 的 Fargate service 已启动 (desiredCount=1)

set -euo pipefail

# ── 配置 ──────────────────────────────────────────
REGION="us-east-2"
STACK="openclaw-e2e-test"
EC2_ID="i-054cb53703d2ba33c"
DDB_TABLE="openclaw-e2e-test"
ADMIN_URL="http://localhost:8099"  # 通过 SSM port-forward

# 参考生产配置的 4 个 tier
# Standard:    Nova 2 Lite + moderate guardrail
# Restricted:  DeepSeek R1 + strict guardrail
# Engineering: Sonnet 4.5 + no guardrail
# Executive:   Sonnet 4.6 + no guardrail

PASS=0; FAIL=0; TOTAL=0

test_it() {
  local name="$1"; local expected="$2"; local actual="$3"
  TOTAL=$((TOTAL+1))
  if echo "$actual" | grep -q "$expected"; then
    echo "  [PASS] $name"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $name — expected '$expected', got '${actual:0:200}'"
    FAIL=$((FAIL+1))
  fi
}

# ── 辅助函数 ──────────────────────────────────────
# 通过 EC2 SSM 调用 Fargate 容器
invoke_fargate() {
  local tier_ip="$1"
  local session_id="$2"
  local message="$3"
  aws ssm send-command \
    --instance-ids "$EC2_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=[\"curl -sf -X POST http://${tier_ip}:8080/invocations -H 'Content-Type: application/json' -d '{\\\"sessionId\\\": \\\"${session_id}\\\", \\\"message\\\": \\\"${message}\\\"}' --max-time 120\"]" \
    --timeout-seconds 180 \
    --region "$REGION" \
    --query 'Command.CommandId' --output text
}

wait_result() {
  local cmd_id="$1"
  sleep 60
  aws ssm get-command-invocation \
    --command-id "$cmd_id" \
    --instance-id "$EC2_ID" \
    --query 'StandardOutputContent' --output text \
    --region "$REGION"
}

# ── G1: 基础对话 (4 tier × 3 = 12 调用) ─────────
echo "=== G1: Basic Conversation ==="
# 每个 tier 发 3 条消息，验证:
# - 回复非空
# - model 字段正确
# - DDB USAGE# 有记录
for tier in standard restricted engineering executive; do
  for i in 1 2 3; do
    # ... 调用 + 验证
  done
done

# ── G2: 员工身份识别 (4 tier × 2 = 8 调用) ──────
echo "=== G2: Employee Identity ==="
# Standard: emp-carol (Finance Analyst) — "What is my name and role?"
# Restricted: emp-legal01 — "Who am I?"
# Engineering: emp-ryan (SDE) — "What department am I in?"
# Executive: emp-w5 (SA) — "What is my position?"

# ── G3: 工具使用 (4 场景 × 2 = 8 调用) ──────────
echo "=== G3: Tool Usage ==="
# Engineering: "Run echo hello in shell" → 预期包含 "hello"
# Restricted: "Run ls in shell" → 预期被 Plan A 拒绝
# Executive: "Search the web for AWS re:Invent 2026" → 预期有搜索结果
# Standard: "Write hello to test.txt" → 预期 file_write 成功

# ── G4: Guardrail (4 场景 × 2 = 8 调用) ─────────
echo "=== G4: Guardrail ==="
# Restricted (strict): 发送敏感内容 → 预期被拦截 (guardrail_blocked)
# Standard (moderate): 发送 PII 内容 → 预期被过滤
# Engineering (none): 同样内容 → 预期正常回复
# Executive (none): 同样内容 → 预期正常回复

# ── G5: Memory 持久化 (2 员工 × 3 = 6 调用) ─────
echo "=== G5: Memory Persistence ==="
# emp-w5: "Remember my favorite color is blue" → 回复
# emp-w5: "What is my favorite color?" → 预期回答 blue
# emp-ryan: "My project deadline is June 15" → 回复
# emp-ryan: "When is my deadline?" → 预期回答 June 15
# 验证 EFS: /mnt/efs/emp-w5/workspace/memory/ 有文件

# ── G6: 并发请求 (3 调用同时) ────────────────────
echo "=== G6: Concurrent Requests ==="
# 同一个 tier 同时发 3 个不同员工的请求
# 验证全部返回成功（ThreadingMixIn 工作正常）

# ── G7: DynamoDB 痕迹 (查询验证) ────────────────
echo "=== G7: DynamoDB Trace Verification ==="
# 查 USAGE#{date} — 至少 4 个不同 model 的记录
# 查 AUDIT# — agent_invocation + guardrail_block + permission_denied
# 查 SESSION# — 50+ 条记录

# ── G8: 容器重启恢复 (2 调用) ────────────────────
echo "=== G8: Container Restart Recovery ==="
# 停止 executive tier → 重启 → 发送请求
# 验证 workspace 从 EFS 恢复，memory 完整

# ── 汇总 ──────────────────────────────────────────
echo ""
echo "========================================"
echo "  TOTAL: $TOTAL | PASS: $PASS | FAIL: $FAIL"
echo "========================================"
```

**注意：** 这个脚本的每个 test case 都通过 SSM send-command 在 EC2 上执行 curl 到 Fargate 容器，所以是**真实的端到端测试**，不是 mock。

### 6.6 阶段 F：实现代码 (60 min)

**顺序（有依赖关系）：**

```
1. server.py: 加 /admin/refresh endpoint (5 min)
   ↓ (被 shared.py 依赖)
2. shared.py: stop_employee_session() 增加 Fargate 模式 (10 min)
   ↓ (被所有模块的 force refresh 使用)
3. bedrock_proxy_h2.js: routeRequest() 增加 Fargate 路径 (20 min)
   ↓ (核心路由改动)
4. playground.py: live 模式增加 Fargate 路径 (10 min)
5. deploy.sh: 确认 Step 4.5 tier task definitions (5 min)
6. security.py: 确认 deploy-mode + tier API 完整 (5 min)
7. entrypoint.sh: 确认 FARGATE_TIER 注册 (5 min)
```

**每个文件改完后：**
- Python: `python3 -c "import ast; ast.parse(open('file').read())"`
- Bash: `bash -n file.sh`
- JS: `node --check file.js`

### 6.7 阶段 G：Docker rebuild + 部署 (30 min)

**在 us-east-2 测试环境执行：**

```bash
# 1. 通过 SSM 连到 EC2
aws ssm start-session --target i-054cb53703d2ba33c --region us-east-2

# 2. 拉最新代码
cd /tmp/openclaw-services && git pull origin feature/fargate-first

# 3. 复制修改的文件到正确位置
cp enterprise/agent-container/* ~/agent-container/
cp enterprise/gateway/*.js ~/
cp enterprise/gateway/*.py ~/
# admin-console 文件在 /opt/admin-console/ 下

# 4. Docker build + push
cd ~/agent-container
docker build -t openclaw-agent:latest .
ECR_URI="263168716248.dkr.ecr.us-east-2.amazonaws.com/openclaw-e2e-test-multitenancy-agent"
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin $ECR_URI
docker tag openclaw-agent:latest $ECR_URI:latest
docker push $ECR_URI:latest

# 5. 创建 4 个 tier 的 ECS Service (desiredCount=1)
# 使用 deploy.sh Step 4.5 或手动 aws ecs create-service

# 6. 等待 4 个 task 都 RUNNING
for tier in standard restricted engineering executive; do
  echo -n "$tier: "
  aws ecs describe-services --cluster openclaw-e2e-test-always-on \
    --services "openclaw-e2e-test-tier-$tier" \
    --query 'services[0].runningCount' --output text --region us-east-2
done

# 7. 获取 4 个 task 的 IP
for tier in standard restricted engineering executive; do
  TASK_ARN=$(aws ecs list-tasks --cluster openclaw-e2e-test-always-on \
    --service-name "openclaw-e2e-test-tier-$tier" \
    --query 'taskArns[0]' --output text --region us-east-2)
  IP=$(aws ecs describe-tasks --cluster openclaw-e2e-test-always-on \
    --tasks $TASK_ARN \
    --query 'tasks[0].containers[0].networkInterfaces[0].privateIpv4Address' \
    --output text --region us-east-2)
  echo "$tier: $IP"
  # 写入 SSM
  aws ssm put-parameter \
    --name "/openclaw/openclaw-e2e-test/fargate/tier-$tier/endpoint" \
    --value "http://$IP:8080" --type String --overwrite --region us-east-2
done

# 8. 重启 EC2 上的服务（加载修改后的 H2 Proxy、Tenant Router）
sudo systemctl restart bedrock-proxy-h2
sudo systemctl restart tenant-router
sudo systemctl restart openclaw-admin

# 9. 验证 4 个容器健康
for tier in standard restricted engineering executive; do
  IP=$(aws ssm get-parameter \
    --name "/openclaw/openclaw-e2e-test/fargate/tier-$tier/endpoint" \
    --query 'Parameter.Value' --output text --region us-east-2)
  echo -n "$tier ($IP): "
  curl -sf "$IP/ping" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
done
```

### 6.8 阶段 H：端到端测试 (40 min)

**执行 test-fargate-e2e.sh：**

```bash
# 本地执行（通过 SSM send-command 远程调用）
cd enterprise/tests
bash test-fargate-e2e.sh 2>&1 | tee ../docs/fargate-test-results.md
```

**同时在 Admin Console 前端验证：**

```bash
# SSM port forward 到 Admin Console
aws ssm start-session --target i-054cb53703d2ba33c --region us-east-2 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8099"],"localPortNumber":["8099"]}'

# 浏览器打开 http://localhost:8099
# 检查:
# - Monitor: 是否有 50+ session 记录
# - Audit Log: 是否有 guardrail_block + permission_denied 事件
# - Usage: 是否有 4 个不同 model 的 token 使用量
```

**测试结果记录到 `enterprise/docs/fargate-test-results.md`：**

```markdown
# Fargate Phase 1 E2E 测试结果

## 环境
- Date: 2026-04-14
- Region: us-east-2
- Stack: openclaw-e2e-test
- Docker image: rebuilt with ThreadingMixIn + FARGATE_TIER

## 4 Tier Service 状态
| Tier | Task IP | Status | Model | Guardrail |
|------|---------|--------|-------|-----------|
| standard | 10.0.x.x | RUNNING | Nova 2 Lite | moderate |
| restricted | 10.0.x.x | RUNNING | DeepSeek R1 | strict |
| engineering | 10.0.x.x | RUNNING | Sonnet 4.5 | none |
| executive | 10.0.x.x | RUNNING | Sonnet 4.6 | none |

## 测试结果汇总
| Group | Tests | Pass | Fail | Notes |
|-------|-------|------|------|-------|
| G1 Basic | 12 | ? | ? | |
| G2 Identity | 8 | ? | ? | |
| G3 Tools | 8 | ? | ? | |
| G4 Guardrail | 8 | ? | ? | |
| G5 Memory | 6 | ? | ? | |
| G6 Concurrent | 3 | ? | ? | |
| G7 DDB Trace | 3 | ? | ? | |
| G8 Restart | 2 | ? | ? | |
| **Total** | **50** | **?** | **?** | |

## 每个测试的详细结果
(自动填充)

## DynamoDB 痕迹截图
- USAGE# 记录数: ?
- AUDIT# 记录数: ?
- SESSION# 记录数: ?
- 包含的 model 类型: ?

## 前端截图
- Monitor 页面
- Audit Log 页面
- Usage 页面
```

### 6.9 阶段 I：文档更新 + 等待提交 (10 min)

**更新文件：**
1. `enterprise/docs/worklog-2026-04-14.md` — 追加本次工作
2. `enterprise/docs/TODO-backlog.md` — 标记完成项
3. `memory/project_next_session.md` — 更新下次工作内容

**不提交。** 等你说"提交"。

---

## 第七部分：失败时的应急方案

| 场景 | 应急 |
|------|------|
| Docker build 失败 | 检查 Dockerfile、确认 ARM64 架构。如果 EC2 磁盘满，清理旧镜像。 |
| ECS Service 不启动 | 检查 CloudWatch /ecs/openclaw-e2e-test-always-on 日志。常见问题：IAM role 缺权限、EFS mount 失败。 |
| 容器 /ping 不通 | 检查安全组 sg-0751a85e24561edab 允许 8080 inbound from EC2 SG。 |
| Bedrock 调用失败 | 确认模型在 us-east-2 可用（Nova Lite/DeepSeek/Sonnet 4.5/4.6）。检查 IAM role 有 bedrock:InvokeModel。 |
| 测试环境无 Guardrail | 需要先创建 2 个 Guardrail（strict + moderate）。用 Bedrock Console 或 CLI。 |
| H2 Proxy 改动导致 AgentCore 流量中断 | 改动必须向后兼容。deployMode != "fargate" 的请求走原有路径。 |
| 4 小时不够 | 优先完成 G1-G4（基础 + 身份 + 工具 + Guardrail = 36 调用）。G5-G8 可以下次做。 |
