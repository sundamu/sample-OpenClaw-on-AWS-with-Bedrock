#!/bin/bash
S=10.0.1.251; R=10.0.1.219; E=10.0.1.217; X=10.0.1.28
PASS=0; FAIL=0; TOTAL=0

invoke() {
  local tier="$1" ip="$2" emp="$3" msg="$4"
  TOTAL=$((TOTAL+1))
  RESP=$(curl -sf -X POST "http://${ip}:8080/invocations" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"emp__${emp}__fg2\",\"message\":\"${msg}\"}" \
    --max-time 180 2>/dev/null)
  if echo "$RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);exit(0 if d.get('status')=='success' else 1)" 2>/dev/null; then
    PASS=$((PASS+1)); echo "[PASS] #$TOTAL $tier/$emp"
  else
    FAIL=$((FAIL+1)); echo "[FAIL] #$TOTAL $tier/$emp"
  fi
}

echo "=== BATCH 2: 10 more calls + refresh test ==="

# Test /admin/refresh endpoint
echo "--- Testing /admin/refresh ---"
curl -sf -X POST "http://$S:8080/admin/refresh" -H "Content-Type: application/json" -d '{"emp_id":"emp-carol"}' --max-time 10
echo
curl -sf -X POST "http://$E:8080/admin/refresh" -H "Content-Type: application/json" -d '{"emp_id":"emp-ryan"}' --max-time 10
echo
echo "--- /admin/refresh OK ---"

invoke standard   $S emp-ae01    "What is my sales territory?"
invoke standard   $S emp-ae02    "Describe my typical workday."
invoke restricted $R emp-fa01    "What compliance rules should I follow?"
invoke restricted $R emp-fa02    "Explain double-entry accounting briefly."
invoke engineering $E emp-ryan    "What is a Lambda function?"
invoke engineering $E emp-devops01 "Explain infrastructure as code."
invoke executive  $X emp-w5      "Summarize cloud architecture principles."
invoke executive  $X emp-jiade   "What makes a good technical design?"
invoke standard   $S emp-carol   "Generate a brief meeting agenda."
invoke executive  $X emp-sa01    "List 3 AWS services for AI."

echo
echo "BATCH2: PASS=$PASS FAIL=$FAIL TOTAL=$TOTAL"
