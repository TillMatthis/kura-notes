#!/bin/bash

# ============================================
# Docker Configuration Validation Script
# ============================================

set -e

echo "🔍 Validating Docker configuration..."
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required files exist
echo "📁 Checking required files..."
files=(
  "Dockerfile"
  "Dockerfile.dev"
  "docker-compose.yml"
  "docker-compose.dev.yml"
  ".dockerignore"
  ".env.example"
)

missing_files=0
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo -e "  ${GREEN}✓${NC} $file"
  else
    echo -e "  ${RED}✗${NC} $file (missing)"
    missing_files=$((missing_files + 1))
  fi
done

if [ $missing_files -gt 0 ]; then
  echo -e "\n${RED}❌ Validation failed: $missing_files file(s) missing${NC}"
  exit 1
fi

echo ""

# Check if Docker is installed
echo "🐳 Checking Docker installation..."
if command -v docker &> /dev/null; then
  echo -e "  ${GREEN}✓${NC} Docker is installed"
  docker --version
else
  echo -e "  ${YELLOW}⚠${NC} Docker is not installed (required for deployment)"
fi

echo ""

# Check if Docker Compose is installed
echo "🐳 Checking Docker Compose installation..."
if command -v docker-compose &> /dev/null; then
  echo -e "  ${GREEN}✓${NC} docker-compose is installed"
  docker-compose --version
elif docker compose version &> /dev/null; then
  echo -e "  ${GREEN}✓${NC} docker compose (plugin) is installed"
  docker compose version
else
  echo -e "  ${YELLOW}⚠${NC} Docker Compose is not installed (required for deployment)"
fi

echo ""

# Validate docker-compose.yml syntax (if Docker is available)
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
  echo "📋 Validating docker-compose.yml syntax..."

  if command -v docker-compose &> /dev/null; then
    if docker-compose -f docker-compose.yml config > /dev/null 2>&1; then
      echo -e "  ${GREEN}✓${NC} docker-compose.yml is valid"
    else
      echo -e "  ${RED}✗${NC} docker-compose.yml has syntax errors"
      exit 1
    fi

    if docker-compose -f docker-compose.dev.yml config > /dev/null 2>&1; then
      echo -e "  ${GREEN}✓${NC} docker-compose.dev.yml is valid"
    else
      echo -e "  ${RED}✗${NC} docker-compose.dev.yml has syntax errors"
      exit 1
    fi
  else
    if docker compose -f docker-compose.yml config > /dev/null 2>&1; then
      echo -e "  ${GREEN}✓${NC} docker-compose.yml is valid"
    else
      echo -e "  ${RED}✗${NC} docker-compose.yml has syntax errors"
      exit 1
    fi

    if docker compose -f docker-compose.dev.yml config > /dev/null 2>&1; then
      echo -e "  ${GREEN}✓${NC} docker-compose.dev.yml is valid"
    else
      echo -e "  ${RED}✗${NC} docker-compose.dev.yml has syntax errors"
      exit 1
    fi
  fi
else
  echo -e "  ${YELLOW}⚠${NC} Skipping syntax validation (Docker not available)"
fi

echo ""

# Check if .env file exists
echo "🔐 Checking environment configuration..."
if [ -f ".env" ]; then
  echo -e "  ${GREEN}✓${NC} .env file exists"

  # Check for required variables
  required_vars=("API_KEY" "OPENAI_API_KEY" "CHROMA_SERVER_AUTH_CREDENTIALS")
  for var in "${required_vars[@]}"; do
    if grep -q "^${var}=" .env && ! grep -q "^${var}=.*-here" .env && ! grep -q "^${var}=$" .env; then
      echo -e "  ${GREEN}✓${NC} $var is set"
    else
      echo -e "  ${YELLOW}⚠${NC} $var is missing or uses placeholder value"
    fi
  done
else
  echo -e "  ${YELLOW}⚠${NC} .env file not found (copy from .env.example)"
fi

echo ""

# Check directory structure
echo "📂 Checking data directories..."
if [ -d "data" ]; then
  echo -e "  ${GREEN}✓${NC} data directory exists"
else
  echo -e "  ${YELLOW}⚠${NC} data directory will be created on first run"
fi

echo ""
echo -e "${GREEN}✅ Docker configuration validation complete!${NC}"
echo ""
echo "📝 Next steps:"
echo "  1. Copy .env.example to .env if not already done"
echo "  2. Edit .env with your actual API keys"
echo "  3. Run: docker-compose build"
echo "  4. Run: docker-compose up -d"
echo ""
