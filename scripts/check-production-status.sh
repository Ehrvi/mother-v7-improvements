#!/bin/bash

###############################################################################
# MOTHER v14 - Production Status Check (No gcloud required)
# 
# Purpose: Check production deployment health using HTTP endpoints
# Usage: ./scripts/check-production-status.sh
###############################################################################

set -e

# Configuration
SERVICE_URL="https://mother-interface-233196174701.australia-southeast1.run.app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}MOTHER v14 - Production Status Check${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${CYAN}Service URL: $SERVICE_URL${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to check if service is reachable
check_reachability() {
  echo -e "${YELLOW}🌐 Checking service reachability...${NC}"
  
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL" || echo "000")
  
  if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "301" ] || [ "$HTTP_CODE" == "302" ]; then
    echo -e "${GREEN}✅ Service is reachable (HTTP $HTTP_CODE)${NC}"
    return 0
  else
    echo -e "${RED}❌ Service unreachable (HTTP $HTTP_CODE)${NC}"
    return 1
  fi
}

# Function to check simple health endpoint
check_simple_health() {
  echo -e "\n${YELLOW}🏥 Simple health check (/api/trpc/health.check)...${NC}"
  
  RESPONSE=$(curl -s "${SERVICE_URL}/api/trpc/health.check" 2>&1)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/trpc/health.check")
  
  echo -e "${CYAN}HTTP Status: $HTTP_CODE${NC}"
  
  if echo "$RESPONSE" | grep -q '"healthy":true' || echo "$RESPONSE" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✅ Health check PASSED${NC}"
    echo -e "${CYAN}Response:${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    return 0
  else
    echo -e "${RED}❌ Health check FAILED${NC}"
    echo -e "${CYAN}Response:${NC}"
    echo "$RESPONSE"
    return 1
  fi
}

# Function to check detailed health endpoint
check_detailed_health() {
  echo -e "\n${YELLOW}🔍 Detailed health check (/api/trpc/health.detailed)...${NC}"
  
  RESPONSE=$(curl -s "${SERVICE_URL}/api/trpc/health.detailed" 2>&1)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/trpc/health.detailed")
  
  echo -e "${CYAN}HTTP Status: $HTTP_CODE${NC}"
  
  if echo "$RESPONSE" | grep -q '"healthy":true' || echo "$RESPONSE" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✅ Detailed health check PASSED${NC}"
    echo -e "${CYAN}Response:${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    
    # Extract specific metrics
    echo -e "\n${CYAN}📊 System Metrics:${NC}"
    echo "$RESPONSE" | jq -r '
      if .result then
        "  Database: " + (.result.data.database.status // "unknown") + "\n" +
        "  Memory: " + (.result.data.system.memory.usedMB | tostring) + "MB / " + (.result.data.system.memory.totalMB | tostring) + "MB\n" +
        "  Uptime: " + (.result.data.system.uptime | tostring) + "s"
      else
        "  Metrics not available in response format"
      end
    ' 2>/dev/null || echo "  Could not parse metrics"
    
    return 0
  else
    echo -e "${RED}❌ Detailed health check FAILED${NC}"
    echo -e "${CYAN}Response:${NC}"
    echo "$RESPONSE"
    return 1
  fi
}

# Function to test MOTHER API endpoint
test_mother_api() {
  echo -e "\n${YELLOW}🤖 Testing MOTHER API endpoint...${NC}"
  
  # This is a simple connectivity test - actual queries require authentication
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/trpc/mother.query")
  
  echo -e "${CYAN}HTTP Status: $HTTP_CODE${NC}"
  
  if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "400" ] || [ "$HTTP_CODE" == "401" ]; then
    echo -e "${GREEN}✅ MOTHER API endpoint is responding${NC}"
    echo -e "${CYAN}Note: 400/401 is expected without authentication${NC}"
    return 0
  else
    echo -e "${RED}❌ MOTHER API endpoint not responding correctly${NC}"
    return 1
  fi
}

# Function to check response time
check_response_time() {
  echo -e "\n${YELLOW}⏱️  Checking response time...${NC}"
  
  START_TIME=$(date +%s%N)
  curl -s -o /dev/null "${SERVICE_URL}/api/trpc/health.check"
  END_TIME=$(date +%s%N)
  
  DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))
  
  echo -e "${CYAN}Response time: ${DURATION_MS}ms${NC}"
  
  if [ "$DURATION_MS" -lt 1000 ]; then
    echo -e "${GREEN}✅ Response time is excellent (<1s)${NC}"
  elif [ "$DURATION_MS" -lt 3000 ]; then
    echo -e "${YELLOW}⚠️  Response time is acceptable (1-3s)${NC}"
  else
    echo -e "${RED}❌ Response time is slow (>3s)${NC}"
  fi
}

# Function to generate summary
generate_summary() {
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}📋 Summary${NC}"
  echo -e "${BLUE}========================================${NC}"
  
  TOTAL_CHECKS=5
  PASSED_CHECKS=$1
  
  echo -e "${CYAN}Checks passed: $PASSED_CHECKS/$TOTAL_CHECKS${NC}"
  
  if [ "$PASSED_CHECKS" -eq "$TOTAL_CHECKS" ]; then
    echo -e "${GREEN}✅ All systems operational${NC}"
    echo -e "${GREEN}🎉 MOTHER v14 is healthy and running in production${NC}"
  elif [ "$PASSED_CHECKS" -ge 3 ]; then
    echo -e "${YELLOW}⚠️  Some checks failed but service is partially operational${NC}"
  else
    echo -e "${RED}❌ Critical issues detected - service may be down${NC}"
  fi
  
  echo -e "\n${CYAN}Production URL: $SERVICE_URL${NC}"
  echo -e "${CYAN}Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
  echo -e "${BLUE}========================================${NC}"
}

# Main execution
main() {
  PASSED=0
  
  check_reachability && ((PASSED++)) || true
  check_simple_health && ((PASSED++)) || true
  check_detailed_health && ((PASSED++)) || true
  test_mother_api && ((PASSED++)) || true
  check_response_time && ((PASSED++)) || true
  
  generate_summary $PASSED
  
  # Exit with appropriate code
  if [ "$PASSED" -ge 3 ]; then
    exit 0
  else
    exit 1
  fi
}

# Run main function
main
