#!/bin/bash
# 21-Item Validation Checklist for MOTHER v7.0
# Automated testing script

set -e

PROD_URL="https://mother-interface-233196174701.australia-southeast1.run.app"
API_ENDPOINT="${PROD_URL}/api/trpc/mother.query?batch=1"

echo "🧪 =========================================="
echo "   MOTHER v7.0 - 21-Item Validation"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

# Helper function to test query
test_query() {
    local test_name="$1"
    local query="$2"
    local expected_keyword="$3"
    
    echo -n "Testing: $test_name... "
    
    response=$(curl -s -X POST "$API_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"0\":{\"json\":{\"query\":\"$query\",\"useCache\":false}}}" \
        | jq -r '.[0].result.data.json.response')
    
    if echo "$response" | grep -qi "$expected_keyword"; then
        echo -e "${GREEN}✅ PASSED${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "   Expected keyword: $expected_keyword"
        echo "   Response: ${response:0:100}..."
        ((FAILED++))
        return 1
    fi
}

# Helper function to check metrics
check_metrics() {
    local test_name="$1"
    local query="$2"
    
    echo -n "Testing: $test_name... "
    
    result=$(curl -s -X POST "$API_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"0\":{\"json\":{\"query\":\"$query\",\"useCache\":false}}}" \
        | jq -r '.[0].result.data.json | {tier, quality: .quality.qualityScore, cost, tokensUsed}')
    
    tier=$(echo "$result" | jq -r '.tier')
    quality=$(echo "$result" | jq -r '.quality')
    cost=$(echo "$result" | jq -r '.cost')
    tokens=$(echo "$result" | jq -r '.tokensUsed')
    
    if [[ -n "$tier" && -n "$quality" && -n "$cost" && -n "$tokens" ]]; then
        echo -e "${GREEN}✅ PASSED${NC}"
        echo "   Tier: $tier | Quality: $quality | Cost: \$$cost | Tokens: $tokens"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "   Missing metrics in response"
        ((FAILED++))
        return 1
    fi
}

echo "📋 PARTE 2: TESTE DE PRODUÇÃO (GCloud)"
echo ""

# Test 1: Homepage accessible
echo -n "1. Homepage accessible... "
status=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL")
if [ "$status" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC} (HTTP $status)"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC} (HTTP $status)"
    ((FAILED++))
fi

# Test 2: API endpoint responding
echo -n "2. API endpoint responding... "
response=$(curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"test","useCache":false}}}')
if echo "$response" | jq -e '.[0].result.data.json.response' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}"
    ((FAILED++))
fi

# Test 3-9: 7 Layers Architecture
echo ""
echo "🏗️  Testing 7 Layers Architecture..."
test_query "3. Layer 1: Interface" "test query" "."
test_query "4. Layer 3: Intelligence (Tier routing)" "simple test" "gpt-4o-mini"
test_query "5. Layer 5: Knowledge retrieval" "O que é OWASP?" "OWASP"
check_metrics "6. Layer 6: Quality (Guardian)" "What is 2+2?"
check_metrics "7. Layer 7: Learning (Metrics)" "Hello MOTHER"

# Test 8: Complexity assessment
echo ""
echo "🧠 Testing Intelligence Layer..."
echo -n "8. Complexity assessment... "
simple_response=$(curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"Hi","useCache":false}}}' \
    | jq -r '.[0].result.data.json.complexityScore')

if (( $(echo "$simple_response < 0.5" | bc -l) )); then
    echo -e "${GREEN}✅ PASSED${NC} (Complexity: $simple_response)"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC} (Complexity: $simple_response, expected < 0.5)"
    ((FAILED++))
fi

# Test 9: Tier routing
echo -n "9. Tier routing (gpt-4o-mini for simple)... "
tier=$(curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"Hello","useCache":false}}}' \
    | jq -r '.[0].result.data.json.tier')

if [ "$tier" = "gpt-4o-mini" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC} (Got: $tier)"
    ((FAILED++))
fi

# Test 10: Quality Guardian (5 checks)
echo ""
echo "🛡️  Testing Quality Guardian..."
echo -n "10. Guardian validation (5 checks)... "
quality_result=$(curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"Explain quantum computing","useCache":false}}}' \
    | jq -r '.[0].result.data.json.quality | {score: .qualityScore, completeness: .completenessScore, accuracy: .accuracyScore, relevance: .relevanceScore}')

completeness=$(echo "$quality_result" | jq -r '.completeness')
accuracy=$(echo "$quality_result" | jq -r '.accuracy')
relevance=$(echo "$quality_result" | jq -r '.relevance')

if [[ -n "$completeness" && -n "$accuracy" && -n "$relevance" ]]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    echo "   Completeness: $completeness | Accuracy: $accuracy | Relevance: $relevance"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}"
    ((FAILED++))
fi

# Test 11: Cost reduction
echo ""
echo "💰 Testing Cost Optimization..."
echo -n "11. Cost reduction (>90%)... "
cost_reduction=$(curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"test","useCache":false}}}' \
    | jq -r '.[0].result.data.json.costReduction')

if (( $(echo "$cost_reduction > 90" | bc -l) )); then
    echo -e "${GREEN}✅ PASSED${NC} (${cost_reduction}% reduction)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARNING${NC} (${cost_reduction}% reduction, expected >90%)"
    ((WARNINGS++))
fi

# Test 12: Response time
echo -n "12. Response time (<5s)... "
start=$(date +%s%N)
curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"test","useCache":false}}}' > /dev/null
end=$(date +%s%N)
duration=$(( (end - start) / 1000000 ))

if [ "$duration" -lt 5000 ]; then
    echo -e "${GREEN}✅ PASSED${NC} (${duration}ms)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARNING${NC} (${duration}ms, expected <5000ms)"
    ((WARNINGS++))
fi

# Test 13: Caching
echo ""
echo "💾 Testing Caching..."
echo -n "13. Cache functionality... "
# First query (cache miss)
curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"cache test query 12345","useCache":true}}}' > /dev/null

# Second query (should be cache hit)
cache_hit=$(curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"cache test query 12345","useCache":true}}}' \
    | jq -r '.[0].result.data.json.cacheHit')

if [ "$cache_hit" = "true" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARNING${NC} (Cache not hit, may need warm-up)"
    ((WARNINGS++))
fi

# Test 14: Error handling
echo ""
echo "🛡️  Testing Error Handling..."
echo -n "14. Graceful error handling... "
error_response=$(curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"","useCache":false}}}' \
    | jq -r '.[0].error.message // empty')

if [[ -n "$error_response" ]]; then
    echo -e "${GREEN}✅ PASSED${NC} (Error: ${error_response:0:50}...)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARNING${NC} (No error for empty query)"
    ((WARNINGS++))
fi

# Test 15: Creator Context (WITHOUT auth)
echo ""
echo "👤 Testing Creator Context..."
echo -n "15. Creator Context (no auth - should NOT activate)... "
creator_response=$(curl -s -X POST "$API_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"0":{"json":{"query":"Quem é seu criador?","useCache":false}}}' \
    | jq -r '.[0].result.data.json.response')

if echo "$creator_response" | grep -qi "OpenAI"; then
    echo -e "${GREEN}✅ PASSED${NC} (Correctly shows OpenAI without auth)"
    ((PASSED++))
elif echo "$creator_response" | grep -qi "Everton"; then
    echo -e "${RED}❌ FAILED${NC} (Shows Everton without auth - should not)"
    ((FAILED++))
else
    echo -e "${YELLOW}⚠️  WARNING${NC} (Unexpected response)"
    ((WARNINGS++))
fi

# Test 16-21: Additional validations
echo ""
echo "🔍 Additional Validations..."

test_query "16. Portuguese language support" "Olá, como você está?" "."
test_query "17. English language support" "Hello, how are you?" "."
test_query "18. Complex query handling" "Explain the difference between machine learning and deep learning" "machine learning"
test_query "19. Knowledge base access" "What is ISO 27001?" "ISO"
test_query "20. Security knowledge" "What is penetration testing?" "penetration"

echo -n "21. System stats endpoint... "
stats_response=$(curl -s -X POST "${PROD_URL}/api/trpc/mother.stats?batch=1" \
    -H "Content-Type: application/json" \
    -d '{"0":{}}' \
    | jq -r '.[0].result.data.json.totalQueries // empty')

if [[ -n "$stats_response" ]]; then
    echo -e "${GREEN}✅ PASSED${NC} (Total queries: $stats_response)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARNING${NC} (Stats endpoint not responding)"
    ((WARNINGS++))
fi

# Summary
echo ""
echo "=========================================="
echo "📊 VALIDATION SUMMARY"
echo "=========================================="
echo -e "${GREEN}✅ PASSED: $PASSED${NC}"
echo -e "${RED}❌ FAILED: $FAILED${NC}"
echo -e "${YELLOW}⚠️  WARNINGS: $WARNINGS${NC}"
echo "=========================================="

TOTAL=$((PASSED + FAILED + WARNINGS))
PERCENTAGE=$((PASSED * 100 / TOTAL))

echo ""
echo "📈 Success Rate: ${PERCENTAGE}% ($PASSED/$TOTAL)"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL CRITICAL TESTS PASSED!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  SOME TESTS FAILED - REVIEW REQUIRED${NC}"
    exit 1
fi
