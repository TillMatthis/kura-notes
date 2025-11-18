#!/bin/bash

# =============================================================================
# KURA Notes - Setup Script
# =============================================================================
# This script automates the initial setup process for KURA Notes
#
# What it does:
# 1. Creates .env from .env.example (if not exists)
# 2. Generates secure random API keys
# 3. Creates necessary directories
# 4. Initializes database
# 5. Validates configuration
#
# Usage:
#   ./scripts/setup.sh                  # Interactive mode
#   ./scripts/setup.sh --auto           # Non-interactive mode (use defaults)
#   ./scripts/setup.sh --help           # Show help
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"
AUTO_MODE=false

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo -e "${BLUE}=============================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=============================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Generate a secure random key
generate_key() {
    if command -v openssl &> /dev/null; then
        openssl rand -hex 32
    elif command -v node &> /dev/null; then
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    else
        print_error "Cannot generate random key: neither openssl nor node is available"
        exit 1
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Ask yes/no question
ask_yes_no() {
    local question="$1"
    local default="${2:-n}"

    if [ "$AUTO_MODE" = true ]; then
        [ "$default" = "y" ] && return 0 || return 1
    fi

    local prompt
    if [ "$default" = "y" ]; then
        prompt="[Y/n]"
    else
        prompt="[y/N]"
    fi

    while true; do
        read -p "$question $prompt " answer
        answer="${answer:-$default}"
        case "$answer" in
            [Yy]*) return 0 ;;
            [Nn]*) return 1 ;;
            *) echo "Please answer yes or no." ;;
        esac
    done
}

# =============================================================================
# Setup Steps
# =============================================================================

step_check_prerequisites() {
    print_header "Step 1: Checking Prerequisites"

    local missing_deps=()

    # Check Node.js
    if command_exists node; then
        local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -ge 18 ]; then
            print_success "Node.js $(node -v) is installed"
        else
            print_warning "Node.js version is $(node -v), but v18+ is recommended"
        fi
    else
        print_error "Node.js is not installed"
        missing_deps+=("nodejs")
    fi

    # Check npm
    if command_exists npm; then
        print_success "npm $(npm -v) is installed"
    else
        print_error "npm is not installed"
        missing_deps+=("npm")
    fi

    # Check Docker (optional)
    if command_exists docker; then
        print_success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') is installed"
    else
        print_info "Docker is not installed (optional, but recommended)"
    fi

    # Check if .env.example exists
    if [ -f "$ENV_EXAMPLE" ]; then
        print_success ".env.example file exists"
    else
        print_error ".env.example file is missing"
        exit 1
    fi

    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        print_info "Please install them and run this script again"
        exit 1
    fi

    echo ""
}

step_create_env_file() {
    print_header "Step 2: Creating Environment File"

    if [ -f "$ENV_FILE" ]; then
        print_warning ".env file already exists"
        if ask_yes_no "Do you want to back it up and create a new one?" "n"; then
            local backup_file="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
            cp "$ENV_FILE" "$backup_file"
            print_success "Backed up existing .env to $(basename $backup_file)"
        else
            print_info "Skipping .env creation"
            echo ""
            return
        fi
    fi

    # Copy .env.example to .env
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    print_success "Created .env from .env.example"

    # Generate API keys
    print_info "Generating secure API keys..."
    local api_key=$(generate_key)
    local chroma_token=$(generate_key)

    # Update .env file with generated keys
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/API_KEY=your-api-key-here/API_KEY=$api_key/" "$ENV_FILE"
        sed -i '' "s/CHROMA_SERVER_AUTH_CREDENTIALS=your-chroma-token-here/CHROMA_SERVER_AUTH_CREDENTIALS=$chroma_token/" "$ENV_FILE"
    else
        # Linux
        sed -i "s/API_KEY=your-api-key-here/API_KEY=$api_key/" "$ENV_FILE"
        sed -i "s/CHROMA_SERVER_AUTH_CREDENTIALS=your-chroma-token-here/CHROMA_SERVER_AUTH_CREDENTIALS=$chroma_token/" "$ENV_FILE"
    fi

    print_success "Generated and set API_KEY"
    print_success "Generated and set CHROMA_SERVER_AUTH_CREDENTIALS"

    # Prompt for OpenAI API key
    if [ "$AUTO_MODE" = false ]; then
        echo ""
        print_info "OpenAI API key is required for vector embeddings"
        print_info "Get your key from: https://platform.openai.com/api-keys"
        echo ""
        read -p "Enter your OpenAI API key (or press Enter to skip): " openai_key

        if [ -n "$openai_key" ]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/OPENAI_API_KEY=/OPENAI_API_KEY=$openai_key/" "$ENV_FILE"
            else
                sed -i "s/OPENAI_API_KEY=/OPENAI_API_KEY=$openai_key/" "$ENV_FILE"
            fi
            print_success "Set OPENAI_API_KEY"
        else
            print_warning "Skipped OPENAI_API_KEY (search will be limited to full-text only)"
        fi
    fi

    echo ""
}

step_create_directories() {
    print_header "Step 3: Creating Directories"

    local dirs=(
        "data"
        "data/content"
        "data/metadata"
        "data/logs"
    )

    for dir in "${dirs[@]}"; do
        local full_path="$PROJECT_ROOT/$dir"
        if [ -d "$full_path" ]; then
            print_info "Directory $dir already exists"
        else
            mkdir -p "$full_path"
            print_success "Created directory $dir"
        fi
    done

    # Set appropriate permissions
    chmod 755 "$PROJECT_ROOT/data"
    chmod 755 "$PROJECT_ROOT/data/content"
    chmod 755 "$PROJECT_ROOT/data/metadata"
    chmod 755 "$PROJECT_ROOT/data/logs"

    print_success "Set directory permissions"

    echo ""
}

step_install_dependencies() {
    print_header "Step 4: Installing Dependencies"

    if [ -d "$PROJECT_ROOT/node_modules" ]; then
        print_info "node_modules already exists"
        if ask_yes_no "Do you want to reinstall dependencies?" "n"; then
            cd "$PROJECT_ROOT"
            npm install
            print_success "Reinstalled dependencies"
        else
            print_info "Skipping dependency installation"
        fi
    else
        print_info "Installing npm dependencies..."
        cd "$PROJECT_ROOT"
        npm install
        print_success "Installed dependencies"
    fi

    echo ""
}

step_build_project() {
    print_header "Step 5: Building Project"

    if [ -d "$PROJECT_ROOT/dist" ]; then
        print_info "dist/ directory already exists"
        if ask_yes_no "Do you want to rebuild?" "y"; then
            cd "$PROJECT_ROOT"
            npm run build
            print_success "Rebuilt project"
        else
            print_info "Skipping build"
        fi
    else
        print_info "Building TypeScript project..."
        cd "$PROJECT_ROOT"
        npm run build
        print_success "Built project"
    fi

    echo ""
}

step_initialize_database() {
    print_header "Step 6: Initializing Database"

    local db_file="$PROJECT_ROOT/data/metadata/knowledge.db"

    if [ -f "$db_file" ]; then
        print_info "Database already exists at $db_file"
        if ask_yes_no "Do you want to reinitialize it? (WARNING: This will delete all data)" "n"; then
            rm "$db_file"
            print_success "Removed existing database"
        else
            print_info "Skipping database initialization"
            echo ""
            return
        fi
    fi

    # Database will be created automatically on first run
    print_info "Database will be created automatically on first application start"
    print_success "Database initialization configured"

    echo ""
}

step_validate_configuration() {
    print_header "Step 7: Validating Configuration"

    # Source .env file
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
    fi

    local errors=()
    local warnings=()

    # Check required variables
    if [ -z "$VECTOR_STORE_URL" ]; then
        errors+=("VECTOR_STORE_URL is not set")
    fi

    if [ -z "$API_KEY" ]; then
        errors+=("API_KEY is not set")
    elif [ "$API_KEY" = "your-api-key-here" ]; then
        errors+=("API_KEY is still set to default value")
    fi

    # Check optional but recommended variables
    if [ -z "$OPENAI_API_KEY" ]; then
        warnings+=("OPENAI_API_KEY is not set (search will be limited)")
    fi

    if [ "$CORS_ORIGIN" = "*" ] && [ "$NODE_ENV" = "production" ]; then
        warnings+=("CORS_ORIGIN is set to '*' in production (security risk)")
    fi

    # Display results
    if [ ${#errors[@]} -gt 0 ]; then
        print_error "Configuration validation failed:"
        for error in "${errors[@]}"; do
            echo -e "  ${RED}•${NC} $error"
        done
        echo ""
        print_info "Please edit $ENV_FILE and fix the errors"
        echo ""
        exit 1
    else
        print_success "Configuration validation passed"
    fi

    if [ ${#warnings[@]} -gt 0 ]; then
        echo ""
        print_warning "Configuration warnings:"
        for warning in "${warnings[@]}"; do
            echo -e "  ${YELLOW}•${NC} $warning"
        done
    fi

    echo ""
}

step_show_next_steps() {
    print_header "Setup Complete!"

    echo ""
    echo "Next steps:"
    echo ""
    echo "  1. Review and edit .env file if needed:"
    echo "     ${BLUE}nano .env${NC}"
    echo ""
    echo "  2. Start the application:"
    echo ""
    echo "     With Docker:"
    echo "     ${BLUE}docker-compose up -d${NC}"
    echo ""
    echo "     Without Docker:"
    echo "     ${BLUE}npm run dev${NC}"
    echo ""
    echo "  3. Access the application:"
    echo "     ${BLUE}http://localhost:3000${NC}"
    echo ""
    echo "  4. Check health:"
    echo "     ${BLUE}curl http://localhost:3000/api/health${NC}"
    echo ""
    echo "  5. Configure iOS Shortcut (optional):"
    echo "     See docs/ios-shortcut-quick-start.md"
    echo ""

    print_info "For detailed documentation, see docs/setup.md"
    echo ""
}

# =============================================================================
# Main Script
# =============================================================================

show_help() {
    cat << EOF
KURA Notes - Setup Script

Usage:
  ./scripts/setup.sh [OPTIONS]

Options:
  --auto      Non-interactive mode (use defaults, skip prompts)
  --help      Show this help message

Description:
  This script automates the initial setup process for KURA Notes.
  It will:
    1. Check prerequisites
    2. Create .env file from .env.example
    3. Generate secure API keys
    4. Create necessary directories
    5. Install dependencies
    6. Build the project
    7. Initialize the database
    8. Validate configuration

Examples:
  ./scripts/setup.sh              # Interactive mode
  ./scripts/setup.sh --auto       # Non-interactive mode

For more information, see docs/setup.md

EOF
}

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --auto)
                AUTO_MODE=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Run with --help for usage information"
                exit 1
                ;;
        esac
    done

    # Print banner
    clear
    echo ""
    print_header "KURA Notes - Setup Script"
    echo ""

    if [ "$AUTO_MODE" = true ]; then
        print_info "Running in automatic mode"
        echo ""
    fi

    # Run setup steps
    step_check_prerequisites
    step_create_env_file
    step_create_directories
    step_install_dependencies
    step_build_project
    step_initialize_database
    step_validate_configuration
    step_show_next_steps

    print_success "Setup completed successfully!"
    echo ""
}

# Run main function
main "$@"
