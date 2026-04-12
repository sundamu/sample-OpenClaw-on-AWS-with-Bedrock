# Functional E2E Test Plan v2 — Full Coverage

**Target:** Tokyo EC2 `i-0344c501e6bdd0649` (ap-northeast-1)
**Stack:** openclaw-jiade2
**Test Data:** 20 employees, 11 positions, 9 IM channels, 3-layer SOUL, seeded usage/audit

---

## G1: Authentication & Authorization (6 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 1.1 | Admin 登录 | POST /auth/login (emp-jiade + 正确密码) | 返回 JWT token | token 非空 |
| 1.2 | 错误密码 | POST /auth/login (emp-jiade + wrong) | 401 Invalid password | HTTP 401 |
| 1.3 | 不存在的员工 | POST /auth/login (emp-ghost) | 404 Employee not found | HTTP 404 或 detail |
| 1.4 | /auth/me 返回身份 | GET /auth/me (admin token) | 返回 id=emp-jiade, role=admin, positionName=Solutions Architect | 字段匹配 |
| 1.5 | 无 token 访问 | GET /org/employees (无 Authorization header) | 401 | HTTP 401 |
| 1.6 | Manager scope 隔离 | 用 manager 员工登录，查员工列表 | 只看到本部门员工，不能看到其他部门 | 返回数 < 20 |

---

## G2: Organization CRUD (10 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 2.1 | 列出所有部门 | GET /org/departments | 返回多个部门（Engineering, Finance, Sales...） | length > 3 |
| 2.2 | 列出所有岗位 | GET /org/positions | 返回 11 个岗位 | length = 11 |
| 2.3 | 列出所有员工 | GET /org/employees | 返回 20 个员工 | length = 20 |
| 2.4 | 创建测试部门 | POST /org/departments {name: "E2E-Test-Dept"} | 创建成功 | 返回 id |
| 2.5 | 创建测试岗位 | POST /org/positions {name: "E2E-Tester", departmentName: "E2E-Test-Dept"} | 创建成功 | 返回 id |
| 2.6 | 创建测试员工（自动 provision） | POST /org/employees {name: "E2E Bot", positionId: "pos-xxx"} | 自动创建 agent + binding | 返回 agentId 非空 |
| 2.7 | 更新员工名称 | PUT /org/employees/{id} {name: "E2E Bot Updated"} | 名称变更 | GET 验证 |
| 2.8 | 删除测试员工（cascade） | DELETE /org/employees/{id}?force=true | 删除员工 + 关联 agent + binding + S3 workspace | GET 返回 404 或列表不含该 ID |
| 2.9 | 删除测试岗位 | DELETE /org/positions/{id} | 成功（无员工依赖） | HTTP 200 |
| 2.10 | 删除测试部门 | DELETE /org/departments/{id} | 成功 | HTTP 200 |

---

## G3: SOUL 3-Layer Loading & Differentiation (8 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 3.1 | Global SOUL 内容 | S3 读取 _shared/soul/global/SOUL.md | 包含 "ACME Corp" + "Core Rules" | grep |
| 3.2 | Finance Analyst 岗位 SOUL | S3 读取 positions/pos-fa/SOUL.md | 包含 "Finance Analyst" + "spreadsheet" + "No shell commands" | grep |
| 3.3 | Software Engineer 岗位 SOUL | S3 读取 positions/pos-sde/SOUL.md | 包含 "Software Engineer" + "shell" + "code" | grep |
| 3.4 | Account Executive 岗位 SOUL | S3 读取 positions/pos-ae/SOUL.md | 包含 "Account Executive" + "CRM" + "No shell commands" | grep |
| 3.5 | Carol pipeline 2-layer merge | GET /playground/pipeline/emp-carol | globalWords>0 AND positionWords>0 | 数值检查 |
| 3.6 | JiaDe pipeline 3-layer check | GET /playground/pipeline/emp-jiade | globalWords>0, positionWords>0, personalWords>=0 | 三值都返回 |
| 3.7 | 不同岗位 SOUL 词数不同 | 比较 Carol (FA) vs Ryan (SDE) pipeline | positionWords 值不同（FA=253, SDE!=253） | 两次请求比较 |
| 3.8 | Global SOUL 写保护 | PUT /security/global-soul 写入新内容，再读回 | 写入成功 + 内容匹配 + audit 产生 | 写-读-audit 三步验证，最后还原 |

---

## G4: Per-Position Tool Differentiation (6 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 4.1 | FA 工具白名单 | GET /playground/pipeline/emp-carol | planA.tools = [web_search, file] | 精确匹配 |
| 4.2 | SDE 工具白名单 | GET /playground/pipeline/emp-ryan | planA.tools 包含 shell, code_execution, file_write | 包含检查 |
| 4.3 | AE 工具白名单 | GET /playground/pipeline/emp-mike | planA.tools 不包含 shell, code_execution | 排除检查 |
| 4.4 | DevOps 工具白名单 | GET /playground/pipeline/emp-chris | planA.tools 包含 shell（DevOps 需要运维） | 包含检查 |
| 4.5 | Executive 工具白名单 | GET /playground/pipeline/emp-peter | 所有 6 工具都有（exec profile） | length=6 |
| 4.6 | 修改岗位工具后 pipeline 更新 | PUT /security/positions/pos-fa/tools {tools: [web_search,file,browser]} → 验证 pipeline 变化 → 还原 | pipeline 中 tools 变为 3 个 | 写-读-还原 |

---

## G5: SOUL 驱动的行为差异（Bedrock Converse）(6 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 5.1 | FA 拒绝 shell 命令 | simulate Carol: "Run ls -la /tmp" | 拒绝，提到 finance/spreadsheet/engineering | response grep |
| 5.2 | SDE 写代码 | simulate Ryan: "Write Python function to reverse string" | 给出代码（def/return/reverse） | response grep |
| 5.3 | AE 转介技术问题 | simulate Mike: "Show Kubernetes YAML" | 建议找 SA/engineering | response grep |
| 5.4 | FA 擅长财务 | simulate Carol: "What's the Q2 budget variance for Engineering?" | 提到 budget/variance/analysis/table（符合 SOUL 指令和 MEMORY.md 数据） | response grep |
| 5.5 | HR 提供 HR 建议 | simulate Jenny (HR): "New hire onboarding checklist" | 给出 HR 相关内容（onboarding/checklist/policy） | response grep |
| 5.6 | Legal 加免责声明 | simulate Rachel (Legal): "Review this NDA template" | 提到 legal/compliance/disclaimer | response grep |

---

## G6: Workspace & Memory (8 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 6.1 | 读 Carol USER.md | GET /workspace/file?key=emp-carol/workspace/USER.md | 包含 "Carol Zhang" + "Finance Analyst" | grep |
| 6.2 | 读 Carol MEMORY.md | GET /workspace/file?key=emp-carol/workspace/MEMORY.md | 包含 seeded data: "budget"/"Q2"/"Engineering" | grep |
| 6.3 | 读 JiaDe USER.md | GET /workspace/file?key=emp-jiade/workspace/USER.md | 包含 "JiaDe Wang" + "Solutions Architect" | grep |
| 6.4 | 写入 → 读回一致性 | PUT 写临时文件 → GET 读回 | 内容完全匹配 | 写-读比对 |
| 6.5 | S3 round-trip（写 + 读 + 删） | 写 test.md → 读回验证 → 删除 → 再读确认 404 | 完整 CRUD 生命周期 | 4 步验证 |
| 6.6 | Workspace tree | GET /workspace/tree?agent_id=agent-fa-carol | 返回文件列表包含 USER.md, MEMORY.md | 文件名检查 |
| 6.7 | Agent memory overview | GET /agents/agent-fa-carol/memory | 返回 MEMORY.md size>0 | size 检查 |
| 6.8 | 员工只能访问自己的 workspace | 用员工 token 访问别人的文件 | 返回错误或空 | 权限检查 |

---

## G7: Playground 3 种模式 (6 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 7.1 | Simulate 模式 | POST /playground/send {mode: simulate, tenant: Carol} | source=simulate-bedrock, response 非空 | source 字段 |
| 7.2 | Admin 模式 | POST /playground/send {mode: admin, message: "How many agents?"} | 有意义回复（提到数字或 agent） | response 长度>20 |
| 7.3 | Pipeline config 完整性 | GET /playground/pipeline/emp-carol | 包含 soul, planA, model 三大字段 | 字段存在 |
| 7.4 | Pipeline 不同员工不同结果 | 对比 emp-carol 和 emp-ryan 的 pipeline | tools 不同, positionWords 不同 | 差异比较 |
| 7.5 | Playground events 有数据 | GET /playground/events?tenant_id=port__emp-carol (simulate 后) | 至少有审计事件 | count >= 0（验证端点工作） |
| 7.6 | Profiles 包含所有岗位 | GET /playground/profiles | 返回 dict, 至少有 port__emp-carol 和 port__emp-ryan | key 检查 |

---

## G8: Audit 全链路 (10 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 8.1 | 审计条目列表 | GET /audit/entries?limit=20 | 返回数组, 每条有 id, eventType, timestamp, actorName | 结构检查 |
| 8.2 | 按类型过滤 | GET /audit/entries?eventType=config_change | 只返回 config_change 类型 | 全部 eventType 匹配 |
| 8.3 | 时间范围过滤 | GET /audit/entries?since=2026-04-11&before=2026-04-12 | 只返回该时间段的条目 | timestamp 范围检查 |
| 8.4 | Audit insights（pattern scan） | GET /audit/insights | 返回 insights 数组 + summary（high/medium/low 计数） | 结构检查 |
| 8.5 | Run scan 刷新 | POST /audit/run-scan | 返回更新的 insights（可能与之前不同） | 不报错 |
| 8.6 | AI Analyze（Bedrock 分析单条） | POST /audit/ai-analyze {entryId: xxx} | 返回分析结果 >20 字 | 长度检查 |
| 8.7 | Review queue 列表 | GET /audit/review-queue | 返回结构化数组（pending reviews） | type 检查 |
| 8.8 | Compliance stats 7 天数据 | GET /audit/compliance-stats | 包含 enforcementRate, soulCompliance, daily | 字段存在 |
| 8.9 | 审计追踪验证：config change 产生 AUDIT# | PUT /settings/security 修改一个字段 → 查 audit/entries | 出现 config_change 条目，detail 包含修改内容 | 写-查验证 |
| 8.10 | Guardrail events 端点 | GET /audit/guardrail-events?limit=10 | 返回 events 数组（可以为空） | 结构检查 |

---

## G9: Usage & Budget (8 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 9.1 | Usage summary 无 chatgpt | GET /usage/summary | 包含 totalCost, totalRequests; 不包含 chatgptEquivalent | 字段有/无检查 |
| 9.2 | By-department 分组 | GET /usage/by-department | 返回数组, 每项有 department, cost, requests | 结构检查 |
| 9.3 | By-agent 分组 | GET /usage/by-agent | 每项有 agentName, employeeName, cost | 结构检查 |
| 9.4 | By-model 分组 | GET /usage/by-model | 每项有 model, cost, inputTokens | 结构检查 |
| 9.5 | Trend 7 天 | GET /usage/trend | 每项有 date, openclawCost, totalRequests | 结构 + length>0 |
| 9.6 | Budget 列表 | GET /usage/budgets | 每项有 department, budget, projected, status | 结构检查 |
| 9.7 | Budget 更新 + 审计 | PUT /usage/budgets {departments: {Finance: 999}} → 读回 → 查 audit | budget 值变为 999 + audit 有 config_change | 写-读-audit |
| 9.8 | My-budget（员工视角） | GET /usage/my-budget?emp_id=emp-carol | 返回 budget, used, remaining, source | 字段检查 |

---

## G10: Settings 全模块 (12 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 10.1 | Model config 读取 | GET /settings/model | 包含 default.modelId, fallback, availableModels | 字段检查 |
| 10.2 | 切换 default model + 审计 | PUT /settings/model/default {modelId: xxx} → 读回 → 查 audit → 还原 | model 变更 + config_change audit | 写-读-audit-还原 |
| 10.3 | Security config 读取 | GET /settings/security | 包含 alwaysBlocked, piiDetection, dockerSandbox | 字段检查 |
| 10.4 | Admin assistant config | GET /settings/admin-assistant | 包含 model, systemPrompt, maxHistoryTurns, maxTokens | 字段检查 |
| 10.5 | 更新 admin assistant | PUT /settings/admin-assistant {maxTokens: 2048} → 读回验证 → 还原 | maxTokens 变为 2048 | 写-读-还原 |
| 10.6 | Platform access | GET /settings/platform-access | instanceId=i-0344c501e6bdd0649, region=ap-northeast-1, ssmCommand 非空 | 精确匹配 |
| 10.7 | Platform logs | GET /settings/platform-logs?service=openclaw-admin&lines=10 | 返回 logs 字段非空, service=openclaw-admin | 字段检查 |
| 10.8 | Service restart（谨慎测试） | POST /settings/restart-service {service: "openclaw-admin"} | 返回成功（会中断连接，需等重启） | 跳过或标记 manual |
| 10.9 | Admin history 写入 + 读取 | 通过 /admin-ai/chat 发消息 → 读 /settings/admin-assistant/history | history 包含刚发的消息 | 写-读 |
| 10.10 | Admin history 清除 | DELETE /settings/admin-assistant/history → 读回 | history 为空 | 删-读 |
| 10.11 | System stats | GET /settings/system-stats | cpu.pct, memory.pct, disk.pct, ports 数组 | 字段存在 + ports 有监听 |
| 10.12 | Services health | GET /settings/services | gateway, bedrock, dynamodb, s3 各有 status | 字段检查 |

---

## G11: Monitor Center (8 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 11.1 | System status | GET /monitor/system-status | 返回各服务状态（admin-console, bedrock 等） | 字段检查 |
| 11.2 | Action items | GET /monitor/action-items | 返回 items 数组，每项有 type/severity | 结构检查 |
| 11.3 | Agent activity 分类 | GET /monitor/agent-activity | 返回 agents 数组, 每项有 status (active/idle/offline) | 结构 + status 枚举 |
| 11.4 | Alert rules | GET /monitor/alerts | 返回 rules, 每项有 id, type, status | 结构检查 |
| 11.5 | Monitor health 全量 | GET /monitor/health | agents 数组 (每项有 agentId, qualityScore, requestsToday), system 汇总 | 结构检查 |
| 11.6 | Event stream | GET /monitor/events?minutes=60 | events 数组, summary 汇总 | 结构检查 |
| 11.7 | Sessions 列表 | GET /monitor/sessions | 返回 sessions 数组（可能为空——取决于有无活跃会话） | 结构检查 |
| 11.8 | Agent quality score | GET /agents/agent-fa-carol/quality | 返回 1-5 分或 null | 值范围检查 |

---

## G12: IM Channels 全链路 (8 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 12.1 | Channel 列表 | GET /admin/im-channels | 返回 9 个 channel（telegram, discord, slack 等） | length >= 5 |
| 12.2 | Channel connections | GET /admin/im-channel-connections | 返回 connections 结构 | 结构检查 |
| 12.3 | Channel health | GET /admin/im-channels/health | 返回 lastActivity + messagesLast24h | 字段检查 |
| 12.4 | Enrollment stats | GET /admin/im-channels/enrollment | totalWithAgent=20, bound/unbound 有值 | 精确检查 |
| 12.5 | User mappings | GET /bindings/user-mappings | 返回数组 | 结构检查 |
| 12.6 | 创建 mapping → 验证 → 删除 | POST mapping (emp-carol + test-channel + test-user) → GET 验证 → DELETE | 完整 CRUD 生命周期 | 写-读-删 |
| 12.7 | Bot info config | GET /admin/im-bot-info | 返回 bot 配置 | 结构检查 |
| 12.8 | Bindings 列表 | GET /bindings | 返回绑定数组, length >= 20（每人至少一个 portal binding） | length 检查 |

---

## G13: Security Center (8 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 13.1 | Runtimes 列表 | GET /security/runtimes | 返回 runtimes 数组 | 结构检查 |
| 13.2 | Position runtime map | GET /security/position-runtime-map | 返回 map dict | 结构检查 |
| 13.3 | Global SOUL 读取 | GET /security/global-soul | 返回 content 包含 "ACME Corp" | content grep |
| 13.4 | Position SOUL 读写 | GET position SOUL → PUT 修改 → 读回验证 → 还原 | 内容变更 + 审计 | 写-读-还原 |
| 13.5 | Position tools 读写 | GET /security/positions/pos-fa/tools → 验证 tools 列表 | 返回 profile + tools | 字段检查 |
| 13.6 | ECR images | GET /security/ecr-images | 返回 images 数组 | 结构检查 |
| 13.7 | IAM roles | GET /security/iam-roles | 返回 roles, 有 relevant=true 的 | 字段检查 |
| 13.8 | VPC resources | GET /security/vpc-resources | 返回 vpcs, subnets, securityGroups | 三字段检查 |

---

## G14: Knowledge Base (5 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 14.1 | KB 列表 | GET /knowledge | 返回数组 | 结构检查 |
| 14.2 | 上传文档 → 验证 → 删除 | POST /knowledge/upload {kbId, filename, content} → 列表验证 → DELETE | 文件出现在 KB 中 → 删除成功 | 写-读-删 |
| 14.3 | KB 搜索 | GET /knowledge/search?query=test | 返回数组（可能空） | 结构检查 |
| 14.4 | KB assignments 读取 | GET /settings/kb-assignments | 返回 positionKBs + employeeKBs | 字段检查 |
| 14.5 | Agent config 包含 KB | GET /settings/agent-config | 返回 positionConfig + employeeConfig | 字段检查 |

---

## G15: Admin AI 助手 (5 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 15.1 | Admin AI chat 回复 | POST /admin-ai/chat {message: "How many employees?"} | 回复包含数字（20 或 "twenty"） | response grep |
| 15.2 | Admin AI 使用工具 | POST /admin-ai/chat {message: "List all departments"} | 回复包含 Engineering, Finance, Sales 等 | response grep 多个部门名 |
| 15.3 | Admin AI 读 SOUL | POST /admin-ai/chat {message: "Show Carol's SOUL template"} | 回复包含 Finance Analyst 相关内容 | response grep |
| 15.4 | Admin AI history 持久化 | 发 2 条消息 → GET /admin-ai/chat history | history turns >= 2 | count 检查 |
| 15.5 | Admin AI history 清除 | DELETE /admin-ai/chat → GET history | history 为空 | 删-读 |

---

## G16: Portal 员工门户 (8 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 16.1 | 员工登录 | POST /auth/login (emp-carol) | 返回 token | token 非空 |
| 16.2 | 员工 profile | GET /portal/profile | 包含 name=Carol Zhang, position, USER.md content | 字段检查 |
| 16.3 | 员工 usage | GET /portal/usage | 包含 totalTokens, cost | 字段检查 |
| 16.4 | 员工 skills | GET /portal/skills | 返回 available + restricted skills | 结构检查 |
| 16.5 | 员工 requests | GET /portal/requests | 返回 pending + resolved | 结构检查 |
| 16.6 | 员工 channels | GET /portal/channels | 返回已连接 channel 列表 + pairing 说明 | 结构检查 |
| 16.7 | 员工更新 USER.md | PUT /portal/profile {content: "updated"} → 读回 | 内容更新 + audit 产生 | 写-读-还原 |
| 16.8 | 员工 refresh agent | POST /portal/refresh-agent | 成功触发 session termination | HTTP 200 |

---

## G17: Digital Twin (4 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 17.1 | 启用 Twin | POST /portal/twin | 返回 token + URL | token 非空 |
| 17.2 | 公开访问 Twin | GET /public/twin/{token} | 返回 empName, positionName, companyName | 字段检查（无需 auth） |
| 17.3 | 公开聊天 | POST /public/twin/{token}/chat {message: "hello"} | 返回 response | response 非空 |
| 17.4 | 关闭 Twin | DELETE /portal/twin → GET /public/twin/{token} | 返回 404 | HTTP 404 |

---

## G18: Approvals (4 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 18.1 | 审批列表 | GET /approvals | 返回 pending + resolved | 结构检查 |
| 18.2 | 创建审批请求 | POST /portal/requests/create {type: tool_access, tool: shell} | 创建 APPROVAL# | 返回 id |
| 18.3 | 批准请求 | POST /approvals/{id}/approve | status 变 approved | 读回验证 |
| 18.4 | 审批审计追踪 | 查 audit/entries | 出现 approval_decision 条目 | eventType 匹配 |

---

## G19: Dashboard 与跨模块数据一致性 (4 tests)

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 19.1 | Dashboard 数据 | GET /dashboard | employees=20, positions=11, departments>3, agents=20 | 精确匹配 |
| 19.2 | Dashboard agents = employees with agents | 比较 dashboard.agents 与 employees 列表中 agentId 非空的数量 | 数量一致 | 两次查询比对 |
| 19.3 | Usage summary requests >= 0 | GET /usage/summary | totalRequests >= 0, totalCost >= 0 | 值范围 |
| 19.4 | Routing rules 存在 | GET /routing/rules | 返回数组 | 结构检查 |

---

## G20: 数据写回与副作用链 (5 tests)

> 最重要的端到端链路验证：一个动作触发多个副作用。

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 20.1 | 创建员工 → agent 自动 provision → binding 自动创建 | POST employee → 查 agents → 查 bindings | 三者都存在 | 3 次 GET 验证 |
| 20.2 | 修改 security config → audit 记录 → insights 更新 | PUT security → 查 audit → run-scan | audit 有 config_change, insights 刷新 | 3 步验证 |
| 20.3 | 修改 position tools → pipeline 反映 → force refresh | PUT tools → GET pipeline → audit 有 tool_change | pipeline.planA.tools 更新 | 写-读-audit |
| 20.4 | Simulate 发消息 → audit entries 增加 | 记录 audit count → simulate → 再查 count | count 增加 | 前后比对 |
| 20.5 | 删除员工 cascade → agent 删除 + binding 删除 + S3 清理 | DELETE employee → 查 agent → 查 binding → 查 S3 | 全部不存在 | 4 步验证 |

---

## 统计

| 组 | 名称 | 测试数 |
|----|------|--------|
| G1 | Authentication & Authorization | 6 |
| G2 | Organization CRUD | 10 |
| G3 | SOUL 3-Layer Loading | 8 |
| G4 | Per-Position Tool Differentiation | 6 |
| G5 | SOUL 驱动行为差异 | 6 |
| G6 | Workspace & Memory | 8 |
| G7 | Playground 3 种模式 | 6 |
| G8 | Audit 全链路 | 10 |
| G9 | Usage & Budget | 8 |
| G10 | Settings 全模块 | 12 |
| G11 | Monitor Center | 8 |
| G12 | IM Channels | 8 |
| G13 | Security Center | 8 |
| G14 | Knowledge Base | 5 |
| G15 | Admin AI 助手 | 5 |
| G16 | Portal 员工门户 | 8 |
| G17 | Digital Twin | 4 |
| G18 | Approvals | 4 |
| G19 | Dashboard 跨模块一致性 | 4 |
| G20 | 数据写回与副作用链 | 5 |
| **Total** | | **139** |

---

## G21: Memory 读写与持久化 (6 tests)

> AgentCore runtime 写 daily memory + MEMORY.md；admin-console 只读。验证整条 memory 链路。

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 21.1 | Carol MEMORY.md 含 seeded 上下文 | GET /workspace/file?key=emp-carol/workspace/MEMORY.md | 包含 "budget"/"Q2"/"Engineering Q2 budget" | content grep 多关键词 |
| 21.2 | JiaDe MEMORY.md 有内容 | GET /workspace/file?key=emp-jiade/workspace/MEMORY.md | size > 0, 包含 "OpenClaw" 或其他 seeded 内容 | size + content |
| 21.3 | Agent memory overview API | GET /agents/agent-fa-carol/memory | 返回 memoryMdSize > 0, 或 totalFiles >= 0 | 结构检查 |
| 21.4 | Portal profile 包含 memory preview | 用 Carol token GET /portal/profile | memoryPreview 字段非空, 长度 <= 2048 (2KB limit) | 字段+长度检查 |
| 21.5 | Workspace 写→S3→读 round-trip | PUT /workspace/file 写 emp-carol/workspace/_e2e_memory_test.md → 再读回 → 删除 | 写入内容与读回完全一致 | 内容精确匹配 |
| 21.6 | Daily memory 文件可查 | GET /agents/agent-fa-carol/memory 检查是否有 daily files (memory/*.md) | 返回文件列表（可能为空——如果没有 live 交互） | 结构检查 |

---

## G22: Runtime 创建与管理 (5 tests)

> 测试 AgentCore Runtime CRUD 全链路（bedrock-agentcore-control API）。

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 22.1 | 列出现有 runtimes | GET /security/runtimes | 返回 runtimes 数组, 每项有 id, name, status | 结构检查 |
| 22.2 | 获取 runtime 详情 | 从 22.1 取第一个 runtime ID, 检查其配置 | 包含 containerUri, roleArn, model, idleTimeoutSec, maxLifetimeSec | 字段齐全 |
| 22.3 | 修改 runtime lifecycle | PUT /security/runtimes/{id}/lifecycle {idleTimeoutSec:600, maxLifetimeSec:14400} → 读回 → 还原 | lifecycle 值变更 + 审计产生 | 写-读-audit-还原 |
| 22.4 | Position→Runtime 分配 | PUT /security/positions/pos-fa/runtime {runtimeId: xxx} → 读 map → 还原 | position-runtime-map 包含 pos-fa 映射 | map 检查 + 还原 |
| 22.5 | Runtime 创建参数校验 | POST /security/runtimes/create (缺少 name) | 返回 400/422 错误 | HTTP 状态码检查 |

> 注：不真正创建新 runtime（会占用 AWS 资源），只验证参数校验和现有 runtime 管理。

---

## G23: 安全防护规则 (8 tests)

> 验证 PII 检测、alwaysBlocked 工具、Plan A 强制执行、安全配置读写。

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 23.1 | alwaysBlocked 工具列表 | GET /settings/security | alwaysBlocked 包含 install_skill, load_extension, eval | 精确匹配 3 个工具 |
| 23.2 | PII detection 配置 | GET /settings/security | piiDetection.enabled 存在，mode 有值 | 字段检查 |
| 23.3 | Docker sandbox 配置 | GET /settings/security | dockerSandbox 字段存在（true/false） | 字段检查 |
| 23.4 | 修改 security config + 审计 | PUT /settings/security {verboseAudit: true} → 查 audit → 还原 | config_change 审计产生 | 写-audit-还原 |
| 23.5 | FA 无 shell → pipeline 验证 | GET /playground/pipeline/emp-carol | planA.tools 不含 shell, code_execution, file_write | 排除检查 |
| 23.6 | SDE 有全部工具 → pipeline 验证 | GET /playground/pipeline/emp-ryan | planA.tools 含 shell + code_execution + file_write | 包含检查 |
| 23.7 | 修改 FA 工具 → pipeline 变化 → 还原 | PUT /security/positions/pos-fa/tools {profile:basic, tools:[web_search,file,browser]} → GET pipeline → 还原为 [web_search,file] | pipeline tools 变为 3 个 → 还原为 2 个 | 写-读-还原 |
| 23.8 | Session 对话 PII 检测 | GET /monitor/sessions（如有活跃 session）→ session detail | planE 字段存在（PII 扫描结果数组） | 结构检查 |

---

## G24: Session Takeover (5 tests)

> 验证 admin 接管会话、发消息、释放会话、TTL 过期的完整流程。

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 24.1 | 会话列表 | GET /monitor/sessions | 返回数组（可能空——无活跃对话） | 结构检查 |
| 24.2 | Takeover 发起（如有 session） | POST /monitor/sessions/{id}/takeover | takeover=true, expiresAt 30 分钟后 | 字段检查 |
| 24.3 | Takeover 状态查询 | GET /monitor/sessions/{id}/takeover | active=true, adminName 有值 | 字段检查 |
| 24.4 | Admin 发消息（takeover 中） | POST /monitor/sessions/{id}/send {message: "E2E test admin message"} | 消息写入 CONV# | HTTP 200 |
| 24.5 | 释放 takeover | DELETE /monitor/sessions/{id}/takeover | 返回 returned=true | 字段检查 |

> 注：24.2-24.5 依赖有活跃 session，如无则全部 SKIP。

---

## G25: Config Version Bump & Force Refresh (4 tests)

> 验证配置变更触发 version bump + session termination 链路。

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 25.1 | 读当前 config version | DynamoDB 查 CONFIG#global-version | 有 version 字段（ISO timestamp） | 字段存在 |
| 25.2 | 修改 model → version bump | PUT /settings/model/default → 读 version → 与 25.1 比较 → 还原 model | version 时间戳变新 | 前后比对 |
| 25.3 | 修改 position tools → force refresh 触发 | PUT /security/positions/pos-fa/tools 修改 → 查 audit | audit 有 tool_change + 可能有 session_stop | audit 检查 + 还原 |
| 25.4 | Service health 验证 Tenant Router 在线 | GET /settings/services | gateway 或 tenant-router 有 status | status 检查 |

---

## G26: Portal Chat 全链路 (5 tests)

> 员工通过 Portal 发消息 → Tenant Router → AgentCore/Fallback 的完整路径。

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 26.1 | Carol 通过 Portal 发消息 | 用 Carol token POST /portal/chat {message: "What is the Q2 budget?"} | 返回 response（可能是 agent 回复或 fallback） | response 非空 |
| 26.2 | 回复 source 识别 | 检查 26.1 的 source 字段 | agentcore 或 always-on 或 fallback | 三值之一 |
| 26.3 | 无 binding 员工发消息 | 创建无 agent 员工 → POST /portal/chat | 404 "No agent bound" | HTTP 404 |
| 26.4 | Portal usage 数据 | 用 Carol token GET /portal/usage | 返回 totalTokens, cost（>=0） | 字段检查 |
| 26.5 | Portal refresh agent | 用 Carol token POST /portal/refresh-agent | HTTP 200 成功触发 | 状态码检查 |

---

## G27: Org Sync 配置 (3 tests)

> 验证 org-sync 配置读写（不真正调用 Feishu/DingTalk API）。

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 27.1 | 读取 org-sync 配置 | GET /settings/org-sync | 返回 source, enabled, interval 等字段 | 结构检查 |
| 27.2 | 保存 org-sync 配置 | PUT /settings/org-sync {source: "feishu", enabled: false} → 读回 | source=feishu, enabled=false | 写-读验证 |
| 27.3 | Preview（无 API key 应报错） | POST /settings/org-sync/preview | 返回错误信息（没配 API key） | 错误响应检查 |

---

## G28: Agent 质量评分与 Activity (4 tests)

> 验证 agent 质量评分计算和活跃度分类。

| # | 场景 | 操作 | 预期 | 验证方式 |
|---|------|------|------|---------|
| 28.1 | Agent quality score | GET /agents/agent-fa-carol/quality | 返回 1-5 数值或 null（无数据时） | 值范围检查 |
| 28.2 | Monitor agent-activity 分类 | GET /monitor/agent-activity | agents 数组每项有 status (active/idle/offline)，基于 lastInvocationAt | 枚举值检查 |
| 28.3 | Monitor health 系统汇总 | GET /monitor/health | system 包含 totalAgents, activeCount, totalRequestsToday | 字段检查 |
| 28.4 | Agent detail 动态状态 | GET /agents/agent-fa-carol | status 字段根据 lastInvocationAt 动态计算 | status 存在 |

---

## 更新后统计

| 组 | 名称 | 测试数 |
|----|------|--------|
| G1 | Authentication & Authorization | 6 |
| G2 | Organization CRUD | 10 |
| G3 | SOUL 3-Layer Loading | 8 |
| G4 | Per-Position Tool Differentiation | 6 |
| G5 | SOUL 驱动行为差异 | 6 |
| G6 | Workspace & Memory | 8 |
| G7 | Playground 3 种模式 | 6 |
| G8 | Audit 全链路 | 10 |
| G9 | Usage & Budget | 8 |
| G10 | Settings 全模块 | 12 |
| G11 | Monitor Center | 8 |
| G12 | IM Channels | 8 |
| G13 | Security Center | 8 |
| G14 | Knowledge Base | 5 |
| G15 | Admin AI 助手 | 5 |
| G16 | Portal 员工门户 | 8 |
| G17 | Digital Twin | 4 |
| G18 | Approvals | 4 |
| G19 | Dashboard 跨模块一致性 | 4 |
| G20 | 数据写回与副作用链 | 5 |
| G21 | **Memory 读写与持久化** | **6** |
| G22 | **Runtime 创建与管理** | **5** |
| G23 | **安全防护规则** | **8** |
| G24 | **Session Takeover** | **5** |
| G25 | **Config Version Bump** | **4** |
| G26 | **Portal Chat 全链路** | **5** |
| G27 | **Org Sync 配置** | **3** |
| G28 | **Agent 质量评分与 Activity** | **4** |
| **Total** | | **179** |

---

## 注意事项

1. **有副作用的测试全部自带还原**：修改 SOUL/tools/budget/model/security 后必须恢复原值
2. **G2/G20 的创建-删除测试使用 `E2E-` 前缀**，方便识别和清理
3. **G5/G15/G26 调用 Bedrock**，每次约 2-5 秒，14 次 Bedrock 调用预计 40-70 秒
4. **G17 Digital Twin 需要 Tenant Router 在线**才能测公开聊天
5. **T10.8 restart-service 会中断自身**，标记为 manual/skip
6. **G22 不真正创建 runtime**（会占用 AWS 资源），只测参数校验和已有 runtime 管理
7. **G24 Session Takeover 依赖活跃 session**——如无活跃会话则全组 SKIP
8. **G21 Memory writeback 由 AgentCore 执行**——admin-console 只读。测试验证读链路+S3 round-trip
9. **G23 PII/alwaysBlocked 在 agent-container 层强制执行**——admin-console 只管配置，测试验证配置正确性
10. **G25 config version bump 写 DynamoDB CONFIG#global-version**——需 admin 权限查 DynamoDB
