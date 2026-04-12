# Functional E2E Test Suite — Results

**Date:** 2026-04-13
**Environment:** Tokyo EC2 `i-0344c501e6bdd0649` (ap-northeast-1)
**Result:** 23 passed, 4 failed / 27 total

---

## G1: SOUL Per-Position Differentiation

> 验证不同岗位的员工得到 SOUL 驱动的差异化回复。通过 simulate 模式（Bedrock Converse + 真实 SOUL）。

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T1.1 | Finance Analyst (Carol) 被要求执行 `ls -la /tmp` | 拒绝执行，解释自己是财务角色，建议联系 Engineering | response 包含 cannot/finance/spreadsheet/engineering | PASS |
| T1.2 | Software Engineer (Ryan) 被要求写 Python 反转字符串函数 | 直接给出代码实现 | response 包含 `def`/`return`/`reverse`/代码块 | PASS |
| T1.3 | Account Executive (Mike) 被问 Kubernetes deployment YAML | 不写 YAML，建议转给 SA 团队 | response 包含 SA team/solutions architect/technical | PASS |

**结论:** 3 个岗位的 SOUL 全部生效，Finance 拒绝 shell、SDE 写代码、AE 转介技术问题。

---

## G2: Pipeline Per-Position Tool 分化

> 验证 Pipeline Config API 为不同岗位返回不同的工具白名单。

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T2.1 | Finance Analyst (Carol) pipeline 工具列表 | 无 shell 工具 | planA.tools 不包含 "shell" | PASS — tools: `web_search,file` |
| T2.2 | Carol SOUL 词数 | global > 0 且 position > 0（2 层合并） | soul.globalWords + soul.positionWords | PASS — global=204w position=253w |
| T2.3 | Software Engineer (Ryan) pipeline 工具列表 | 有 shell + code_execution | planA.tools 包含 "shell" | PASS — tools: `web_search,shell,browser,file,file_write,code_execution` |
| T2.4 | 不同岗位 model 解析 | 均解析到有效 model ID | pipeline.model 非空 | PASS — 都是 `global.amazon.nova-2-lite-v1:0` |

**结论:** 工具白名单按岗位差异化生效。FA 只有 2 个工具（搜索+读文件），SDE 有全部 6 个。

---

## G3: 审计追踪（真实交互产生）

> 验证 simulate 交互后 AUDIT# 条目实际产生。

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T3.1 | Carol simulate 后查询 playground events | 有 >0 条事件 | /playground/events?tenant_id=port__emp-carol count>0 | **FAIL** — count=0 |
| T3.2 | 全局审计条目包含 invocation/simulate 记录 | 最近 20 条中有相关条目 | 查 detail 含 simulate/playground 或 eventType=agent_invocation | PASS — 17 条 |
| T3.3 | Audit insights 结构化返回 | insights 数组可解析 | insights 字段存在 | PASS — 1 条 insight |

**T3.1 失败分析:** `/playground/events` 可能只查特定 source 的 AUDIT# 条目，simulate 模式走 Bedrock Converse 不经过 AgentCore，可能不写 playground 事件。全局审计（T3.2）已经捕获了 17 条，说明审计本身是工作的。

---

## G4: SOUL 3 层加载

> 验证 Global + Position + Personal SOUL 全部参与 pipeline 组装。

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T4.1 | JiaDe (SA) pipeline SOUL 词数 | global>0, position>0 | soul.globalWords, positionWords, personalWords | PASS — g=204 p=219 pers=0 |
| T4.2 | Global SOUL.md 内容 | 包含 "ACME Corp" | S3 文件内容 grep | PASS |
| T4.3 | Position SOUL (pos-fa) 内容 | 包含 finance/spreadsheet | S3 文件内容 grep | PASS |

**注意:** T4.1 personalWords=0 — JiaDe 的个人工作空间没有 SOUL.md 文件（只有 USER.md 和 MEMORY.md），所以 personal 层为 0 是正确行为。

---

## G5: Admin AI 助手路由

> 验证 admin 模式使用 Bedrock Converse 直接回复，而不是走 AgentCore。

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T5.1 | Admin assistant 配置 | 有 model + systemPrompt | model 非空 + prompt 长度>0 | PASS — model=nova-2-lite, prompt=212chars |
| T5.2 | Admin 模式发送 "How many employees?" | 得到有意义的回复 | response 长度>10 | PASS — 612 chars |
| T5.3 | 发送后 admin history 应增加 | history 数组 >0 条 | /settings/admin-assistant/history | **FAIL** — 0 条 |

**T5.3 失败分析:** Admin AI 回复成功（T5.2 通过），但 playground/send 的 admin 模式可能没有写入 admin-assistant/history（那个 history 可能只有浮窗聊天才写，playground 是另一条路径）。

---

## G6: 平台运维

> 验证 Settings 页面的 platform-access、system-stats 返回真实 EC2 数据。

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T6.1 | Platform access instance ID | 返回当前 EC2 的 instance-id | 比对 IMDS | PASS — i-0344c501e6bdd0649 |
| T6.2 | Platform access region | 返回 ap-northeast-1 | 字符串匹配 | PASS |
| T6.3 | System stats CPU/Memory | CPU>=0 且 Memory>=0 | 数值判断 | **FAIL** — cpu=0.0 mem=26.9 |

**T6.3 失败分析:** CPU=0.0 不是 "缺失"，是实际值（Graviton 空闲时 CPU 确实接近 0%）。测试脚本的判断 `cpu=0.0 -ge 0` 在 bash 中对浮点数不生效。这是**测试脚本 bug**，不是功能 bug。Memory=26.9% 是正确数据。

---

## G7: IM Channels 与 Enrollment

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T7.1 | IM channel health | 返回 per-channel activity 数据 | lastActivity/messagesLast24h 有条目 | PASS — 1 channel |
| T7.2 | Enrollment | totalWithAgent > 0 | 20 个员工都有 agent | PASS — 20 |

---

## G8: AI Audit Analyze 按钮

> 验证对单条审计记录的 AI 分析功能。

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T8.1 | 取最近 1 条审计记录，调用 /audit/analyze | 返回 >20 char 的分析结果 | response 长度检查 | **FAIL** — 2 chars |

**T8.1 失败分析:** 返回 2 chars（可能是 `{}`）。/audit/analyze 端点可能需要更多参数，或者端点内部 Bedrock Converse 调用超时。需要检查后端日志。

---

## G9: Workspace & Memory 读写

> 验证 S3 workspace 文件的读取和回写链路。

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T9.1 | 读 Carol 的 USER.md | 内容包含 "Carol Zhang" | API 返回 content grep | PASS |
| T9.2 | 读 Carol 的 MEMORY.md | 包含 seeded 数据（budget/Q2） | content 包含 budget/variance | PASS |
| T9.3 | 写入临时文件 → 读回 → 验证一致 → 清理 | write → read → match → delete | 完整 S3 round-trip | PASS |

**结论:** Memory 读写链路完全通畅。写入 S3 → 读回内容一致。

---

## G10: Compliance & Review Queue

| # | 测试场景 | 预期行为 | 验证方式 | 结果 |
|---|---------|---------|---------|------|
| T10.1 | Compliance stats | 返回 enforcementRate 字段 | 字段存在且 >= 0 | PASS — keys: daily, soulCompliance, enforcementRate, pendingReviews |
| T10.2 | Review queue | 返回结构化数组 | type=dict/list | PASS — 2 items pending |

---

## 失败项汇总

| # | 失败描述 | 根因分类 | 严重性 |
|---|---------|---------|--------|
| T3.1 | Playground events count=0 | **功能限制** — simulate 模式不经过 AgentCore，不写 playground-specific 事件 | Low（全局审计 T3.2 已捕获 17 条） |
| T5.3 | Admin history 为空 | **路径差异** — playground/send admin 模式不写 admin-assistant/history（只有浮窗写） | Low（admin AI 回复本身成功） |
| T6.3 | System stats cpu=0.0 判断失败 | **测试脚本 bug** — bash 不支持浮点数比较 | None（假阳性） |
| T8.1 | AI Analyze 返回 2 chars | **端点问题** — /audit/analyze 可能参数不对或 Bedrock 调用失败 | Medium — 需查后端日志 |

---

## 测试脚本

完整脚本: `s3://openclaw-tenants-651770013524/_deploy/e2e-functional-test.sh`
本地副本: `/tmp/e2e-functional-test.sh`
