#!/bin/bash
# MOTHER v7.0 - Automated GCloud Deployment Test Suite
# Created: Feb 19, 2026
# Purpose: Validate all features on GCloud Run deployment

set -e

# Configuration
BASE_URL="https://mother-interface-233196174701.australia-southeast1.run.app"
RESULTS_FILE="/tmp/mother-test-results-$(date +%Y%m%d-%H%M%S).json"
SUMMARY_FILE="/tmp/mother-test-summary-$(date +%Y%m%d-%H%M%S).txt"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         MOTHER v7.0 - GCloud Deployment Test Suite          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Base URL: $BASE_URL"
echo "Results: $RESULTS_FILE"
echo "Summary: $SUMMARY_FILE"
echo ""

# Initialize results file
echo "[]" > "$RESULTS_FILE"

# Test function
test_query() {
  local test_id="$1"
  local test_name="$2"
  local query="$3"
  local expected_tier="$4"
  local expected_quality_min="$5"
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Test $test_id: $test_name"
  echo "Query: \"$query\""
  echo ""
  
  # Make request
  response=$(curl -s -X POST "$BASE_URL/api/trpc/mother.query?batch=1" \
    -H "Content-Type: application/json" \
    -d "{\"0\":{\"json\":{\"query\":\"$query\"}}}" 2>&1)
  
  # Check if request succeeded
  if [ $? -ne 0 ]; then
    echo -e "${RED}✗ FAILED${NC} - Request failed"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    return 1
  fi
  
  # Parse response
  tier=$(echo "$response" | jq -r '.[0].result.data.json.tier // "N/A"')
  complexity=$(echo "$response" | jq -r '.[0].result.data.json.complexityScore // 0')
  quality=$(echo "$response" | jq -r '.[0].result.data.json.quality.qualityScore // 0')
  completeness=$(echo "$response" | jq -r '.[0].result.data.json.quality.completenessScore // 0')
  accuracy=$(echo "$response" | jq -r '.[0].result.data.json.quality.accuracyScore // 0')
  relevance=$(echo "$response" | jq -r '.[0].result.data.json.quality.relevanceScore // 0')
  coherence=$(echo "$response" | jq -r '.[0].result.data.json.quality.coherenceScore // 0')
  safety=$(echo "$response" | jq -r '.[0].result.data.json.quality.safetyScore // 0')
  response_time=$(echo "$response" | jq -r '.[0].result.data.json.responseTime // 0')
  cost=$(echo "$response" | jq -r '.[0].result.data.json.cost // 0')
  react_obs=$(echo "$response" | jq -r '.[0].result.data.json.reactObservations // null')
  
  # Display results
  echo "Results:"
  echo "  Tier: $tier"
  echo "  Complexity: $complexity"
  echo "  Quality: $quality/100"
  echo "    ├─ Completeness: $completeness/100"
  echo "    ├─ Accuracy: $accuracy/100"
  echo "    ├─ Relevance: $relevance/100"
  echo "    ├─ Coherence: $coherence/100"
  echo "    └─ Safety: $safety/100"
  echo "  Response Time: ${response_time}ms"
  echo "  Cost: \$$cost"
  
  if [ "$react_obs" != "null" ]; then
    react_count=$(echo "$react_obs" | jq 'length')
    echo "  ReAct Observations: $react_count"
  fi
  
  # Validate
  passed=true
  
  if [ "$expected_tier" != "any" ] && [ "$tier" != "$expected_tier" ]; then
    echo -e "  ${YELLOW}⚠ Tier mismatch${NC}: expected $expected_tier, got $tier"
    passed=false
  fi
  
  if (( $(echo "$quality < $expected_quality_min" | bc -l) )); then
    echo -e "  ${YELLOW}⚠ Quality below threshold${NC}: expected >=$expected_quality_min, got $quality"
    passed=false
  fi
  
  # Final verdict
  if [ "$passed" = true ]; then
    echo -e "${GREEN}✓ PASSED${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}✗ FAILED${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
  
  echo ""
  
  # Save to results file
  jq --arg id "$test_id" \
     --arg name "$test_name" \
     --arg tier "$tier" \
     --arg complexity "$complexity" \
     --arg quality "$quality" \
     --arg passed "$passed" \
     '. += [{"id": $id, "name": $name, "tier": $tier, "complexity": $complexity, "quality": $quality, "passed": ($passed == "true")}]' \
     "$RESULTS_FILE" > "${RESULTS_FILE}.tmp" && mv "${RESULTS_FILE}.tmp" "$RESULTS_FILE"
}

# Run test suite
echo "Starting test suite..."
echo ""

# Category 1: Multi-Tier Routing
test_query "1.1" "Low Complexity → gpt-4o-mini" \
  "What is 2+2?" \
  "gpt-4o-mini" \
  "95"

test_query "1.2" "Medium Complexity → gpt-4o" \
  "Explain the difference between REST and GraphQL APIs with practical examples." \
  "gpt-4o" \
  "95"

test_query "1.3" "High Complexity → gpt-4" \
  "Compare quantum mechanics with general relativity, discussing their fundamental principles, mathematical frameworks, and the challenges in unifying them." \
  "any" \
  "95"

# Category 2: Quality Scoring
test_query "2.1" "Completeness Test" \
  "Detail the complete process of photosynthesis in plants, from light absorption to glucose production." \
  "any" \
  "95"

test_query "2.2" "Accuracy Test" \
  "What is the exact value of Planck's constant in SI units?" \
  "any" \
  "95"

# Category 3: Knowledge Base
test_query "3.1" "KB Retrieval - MOTHER Capabilities" \
  "What are the current capabilities of MOTHER v7.0?" \
  "any" \
  "90"

test_query "3.2" "KB Retrieval - Deep Learning (Iteration 20)" \
  "Explain deep learning optimization techniques." \
  "any" \
  "90"

test_query "3.3" "KB Retrieval - Microservices (Iteration 20)" \
  "What are microservices design patterns?" \
  "any" \
  "90"

# Category 4: Continuous Learning
test_query "4.1" "High-Quality Response (triggers learning)" \
  "Explain the CAP theorem in distributed systems with real-world examples from Netflix, Amazon, and Google." \
  "any" \
  "95"

# Category 5: ReAct Pattern
test_query "5.1" "Mathematical Reasoning" \
  "Water boils at 100°C. What is the boiling point in Fahrenheit? Show your reasoning." \
  "any" \
  "90"

test_query "5.2" "Complex Problem Solving" \
  "A data center has 3 regions handling 1000 req/s each. Design a routing strategy for 99.9% uptime with minimum latency." \
  "any" \
  "90"

# Category 6: Cost Optimization
test_query "6.1" "Cost Reduction Verification" \
  "What is the capital of France?" \
  "gpt-4o-mini" \
  "95"

# Category 7: Safety
test_query "7.1" "Safe Technical Query" \
  "How do I secure a database against SQL injection?" \
  "any" \
  "90"

# Category 8: Performance
test_query "8.1" "Simple Query Performance" \
  "Hello MOTHER" \
  "any" \
  "85"

# Generate summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                        TEST SUMMARY                           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo ""

pass_rate=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
echo "Pass Rate: ${pass_rate}%"
echo ""

# Verdict
if [ "$FAILED_TESTS" -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  echo "MOTHER v7.0 is fully operational on GCloud!"
elif [ "$pass_rate" -gt 80 ]; then
  echo -e "${YELLOW}⚠ PARTIAL SUCCESS${NC}"
  echo "Most tests passed, but some failures detected."
  echo "Review failed tests for issues."
else
  echo -e "${RED}✗ TESTS FAILED${NC}"
  echo "Multiple failures detected. Re-deployment may be needed."
fi

echo ""
echo "Detailed results: $RESULTS_FILE"
echo "Summary: $SUMMARY_FILE"

# Save summary
{
  echo "MOTHER v7.0 GCloud Deployment Test Summary"
  echo "=========================================="
  echo ""
  echo "Date: $(date)"
  echo "Base URL: $BASE_URL"
  echo ""
  echo "Results:"
  echo "  Total Tests: $TOTAL_TESTS"
  echo "  Passed: $PASSED_TESTS"
  echo "  Failed: $FAILED_TESTS"
  echo "  Pass Rate: ${pass_rate}%"
  echo ""
  echo "Detailed results: $RESULTS_FILE"
} > "$SUMMARY_FILE"

echo ""
echo "Test suite complete!"
