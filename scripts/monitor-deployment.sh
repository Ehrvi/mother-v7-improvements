#!/bin/bash

###############################################################################
# MOTHER v14 - Deployment Monitoring Script
# 
# Purpose: Monitor Google Cloud Run deployment status and health
# Usage: ./scripts/monitor-deployment.sh
###############################################################################

set -e

# Configuration
PROJECT_ID="mothers-library-mcp"
SERVICE_NAME="mother-interface"
REGION="australia-southeast1"
SERVICE_URL="https://mother-interface-233196174701.australia-southeast1.run.app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}MOTHER v14 - Deployment Monitor${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to check if gcloud is installed
check_gcloud() {
  if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI not found${NC}"
    echo "Install: https://cloud.google.com/sdk/docs/install"
    exit 1
  fi
  echo -e "${GREEN}✅ gcloud CLI installed${NC}"
}

# Function to get current deployment status
get_deployment_status() {
  echo -e "\n${YELLOW}📦 Checking Cloud Run service status...${NC}"
  
  gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format="table(
      status.conditions[0].type,
      status.conditions[0].status,
      status.latestCreatedRevisionName,
      status.traffic[0].revisionName,
      status.url
    )"
}

# Function to get recent revisions
get_recent_revisions() {
  echo -e "\n${YELLOW}📋 Recent revisions (last 5):${NC}"
  
  gcloud run revisions list \
    --service=$SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --limit=5 \
    --format="table(
      metadata.name,
      status.conditions[0].status:label=READY,
      metadata.creationTimestamp.date('%Y-%m-%d %H:%M:%S'):label=CREATED,
      status.containerStatuses[0].imageDigest.slice(7:19):label=IMAGE
    )"
}

# Function to check health endpoint
check_health() {
  echo -e "\n${YELLOW}🏥 Checking health endpoints...${NC}"
  
  # Simple health check
  echo -e "\n${BLUE}Simple health check (/api/trpc/health.check):${NC}"
  HEALTH_RESPONSE=$(curl -s "${SERVICE_URL}/api/trpc/health.check" || echo "FAILED")
  
  if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Service is healthy${NC}"
    echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"
  else
    echo -e "${RED}❌ Health check failed${NC}"
    echo "$HEALTH_RESPONSE"
  fi
  
  # Detailed health check
  echo -e "\n${BLUE}Detailed health check (/api/trpc/health.detailed):${NC}"
  DETAILED_RESPONSE=$(curl -s "${SERVICE_URL}/api/trpc/health.detailed" || echo "FAILED")
  
  if echo "$DETAILED_RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Detailed health check passed${NC}"
    echo "$DETAILED_RESPONSE" | jq '.' 2>/dev/null || echo "$DETAILED_RESPONSE"
  else
    echo -e "${RED}❌ Detailed health check failed${NC}"
    echo "$DETAILED_RESPONSE"
  fi
}

# Function to get recent logs
get_recent_logs() {
  echo -e "\n${YELLOW}📜 Recent logs (last 20 entries):${NC}"
  
  gcloud logging read \
    "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" \
    --limit=20 \
    --project=$PROJECT_ID \
    --format="table(
      timestamp.date('%Y-%m-%d %H:%M:%S'),
      severity,
      textPayload.slice(0:100)
    )"
}

# Function to get error logs
get_error_logs() {
  echo -e "\n${YELLOW}⚠️  Recent errors (last 10):${NC}"
  
  ERROR_COUNT=$(gcloud logging read \
    "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME AND severity>=ERROR" \
    --limit=10 \
    --project=$PROJECT_ID \
    --format="value(textPayload)" | wc -l)
  
  if [ "$ERROR_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ No recent errors${NC}"
  else
    echo -e "${RED}Found $ERROR_COUNT recent errors:${NC}"
    gcloud logging read \
      "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME AND severity>=ERROR" \
      --limit=10 \
      --project=$PROJECT_ID \
      --format="table(
        timestamp.date('%Y-%m-%d %H:%M:%S'),
        severity,
        textPayload.slice(0:150)
      )"
  fi
}

# Function to get metrics
get_metrics() {
  echo -e "\n${YELLOW}📊 Service metrics (last 1 hour):${NC}"
  
  gcloud monitoring time-series list \
    --filter="resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" \
    --format="table(
      metric.type,
      points[0].value.int64Value,
      points[0].interval.endTime.date('%H:%M:%S')
    )" \
    --project=$PROJECT_ID \
    2>/dev/null || echo "Metrics not available (may take a few minutes after deployment)"
}

# Main execution
main() {
  check_gcloud
  get_deployment_status
  get_recent_revisions
  check_health
  get_recent_logs
  get_error_logs
  get_metrics
  
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${GREEN}✅ Monitoring complete${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
  echo "Service URL: $SERVICE_URL"
  echo "Dashboard: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME?project=$PROJECT_ID"
  echo ""
}

# Run main function
main
