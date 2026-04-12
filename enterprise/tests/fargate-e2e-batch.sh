#!/bin/bash
# Fargate E2E Test Batch — runs on EC2 via SSM
# Invokes 50+ calls across 4 tiers, logs results

S=10.0.1.251  # standard
R=10.0.1.219  # restricted
E=10.0.1.217  # engineering
X=10.0.1.28   # executive

PASS=0; FAIL=0; TOTAL=0
LOG=/tmp/fargate-e2e-results.txt
> "$LOG"

invoke() {
  local tier="$1" ip="$2" emp="$3" msg="$4"
  local sid="emp__${emp}__fg_$(date +%s)"
  TOTAL=$((TOTAL+1))
  RESP=$(curl -sf -X POST "http://${ip}:8080/invocations" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$sid\",\"message\":\"$msg\"}" \
    --max-time 180 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$RESP" ]; then
    FAIL=$((FAIL+1))
    echo "[FAIL] #$TOTAL $tier/$emp — curl failed or empty" | tee -a "$LOG"
    return
  fi
  STATUS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null)
  MODEL=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model','?'))" 2>/dev/null)
  RTEXT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response','')[:120])" 2>/dev/null)
  if [ "$STATUS" = "success" ]; then
    PASS=$((PASS+1))
    echo "[PASS] #$TOTAL $tier/$emp model=$MODEL" | tee -a "$LOG"
  elif [ "$STATUS" = "guardrail_blocked" ]; then
    PASS=$((PASS+1))
    echo "[PASS] #$TOTAL $tier/$emp GUARDRAIL_BLOCKED (expected)" | tee -a "$LOG"
  else
    FAIL=$((FAIL+1))
    echo "[FAIL] #$TOTAL $tier/$emp status=$STATUS resp=${RTEXT:0:80}" | tee -a "$LOG"
  fi
}

echo "=== Fargate E2E Test — $(date) ===" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# G1: Basic Chat (12 calls — 3 per tier)
echo "=== G1: Basic Conversation ===" | tee -a "$LOG"
invoke standard   $S emp-carol   "Hello, who am I? One sentence."
invoke standard   $S emp-mike    "What is my job title? Brief."
invoke standard   $S emp-pm01    "What department am I in?"
invoke restricted $R emp-fa01    "Hello, tell me my department."
invoke restricted $R emp-legal01 "What can I help with?"
invoke restricted $R emp-fa02    "What is my name?"
invoke engineering $E emp-ryan    "Hi, what tools do I have?"
invoke engineering $E emp-devops01 "What is my role?"
invoke engineering $E emp-qa01    "Tell me about my position."
invoke executive  $X emp-w5      "What is my name and role?"
invoke executive  $X emp-jiade   "Hello, who am I?"
invoke executive  $X emp-sa01    "What department do I belong to?"

# G2: Identity Recognition (8 calls)
echo "" | tee -a "$LOG"
echo "=== G2: Employee Identity ===" | tee -a "$LOG"
invoke standard   $S emp-carol   "My full name is Carol Zhang, right?"
invoke standard   $S emp-csm01   "What company do I work for?"
invoke restricted $R emp-legal01 "Am I in the Legal department?"
invoke restricted $R emp-fa01    "What position do I hold?"
invoke engineering $E emp-ryan    "Am I a Software Engineer?"
invoke engineering $E emp-sde02   "What is my employee ID?"
invoke executive  $X emp-w5      "What is my full title at ACME?"
invoke executive  $X emp-jiade   "Tell me about my responsibilities."

# G3: Tool Awareness (8 calls)
echo "" | tee -a "$LOG"
echo "=== G3: Tool Awareness ===" | tee -a "$LOG"
invoke engineering $E emp-ryan    "Can you use the shell tool? Answer yes or no."
invoke engineering $E emp-devops01 "List all tools you can use."
invoke restricted $R emp-fa01    "Can you run shell commands? Answer yes or no."
invoke restricted $R emp-legal01 "Do you have access to code_execution? Yes or no."
invoke standard   $S emp-carol   "Can you write files? Answer yes or no."
invoke standard   $S emp-mike    "What tools are blocked for me?"
invoke executive  $X emp-w5      "Can you use the browser tool? Yes or no."
invoke executive  $X emp-jiade   "List your available tools."

# G4: Different Conversations (8 calls)
echo "" | tee -a "$LOG"
echo "=== G4: Various Scenarios ===" | tee -a "$LOG"
invoke standard   $S emp-carol   "Write a brief email to my team about Q2 budget review."
invoke restricted $R emp-fa01    "Summarize what financial analysts typically focus on."
invoke engineering $E emp-ryan    "Explain Docker containers in 2 sentences."
invoke engineering $E emp-qa01    "What is test-driven development?"
invoke standard   $S emp-pm01    "Create a 3-item project checklist."
invoke executive  $X emp-w5      "Give me a summary of cloud computing trends."
invoke restricted $R emp-legal01 "What should I consider for data privacy compliance?"
invoke standard   $S emp-csm01   "Write a brief customer follow-up message."

# G5: Memory (6 calls)
echo "" | tee -a "$LOG"
echo "=== G5: Memory Test ===" | tee -a "$LOG"
invoke engineering $E emp-ryan    "Remember this: my favorite programming language is Rust."
invoke engineering $E emp-ryan    "What is my favorite programming language?"
invoke standard   $S emp-carol   "Remember: I prefer using spreadsheets for analysis."
invoke standard   $S emp-carol   "What do I prefer using for analysis?"
invoke executive  $X emp-w5      "Remember: my current project is Fargate migration."
invoke executive  $X emp-w5      "What project am I working on?"

# G6: Concurrent (3 calls launched simultaneously)
echo "" | tee -a "$LOG"
echo "=== G6: Concurrent Requests ===" | tee -a "$LOG"
invoke standard   $S emp-carol   "Quick question: what is 2+2?" &
invoke standard   $S emp-mike    "Quick: what day of the week is it?" &
invoke standard   $S emp-pm01    "Quick: name one AWS service." &
wait

# G7: Additional coverage (5 calls)
echo "" | tee -a "$LOG"
echo "=== G7: Additional Coverage ===" | tee -a "$LOG"
invoke restricted $R emp-fa02    "Explain budgeting best practices briefly."
invoke engineering $E emp-sde02   "What is CI/CD in one sentence?"
invoke executive  $X emp-sa01    "Describe AWS Well-Architected Framework briefly."
invoke standard   $S emp-hr01    "What should an onboarding checklist include?"
invoke restricted $R emp-legal01 "What are key GDPR requirements?"

echo "" | tee -a "$LOG"
echo "========================================" | tee -a "$LOG"
echo "TOTAL=$TOTAL PASS=$PASS FAIL=$FAIL" | tee -a "$LOG"
echo "========================================" | tee -a "$LOG"
cat "$LOG"
