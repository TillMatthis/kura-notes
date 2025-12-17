#!/bin/bash

# Anthropic IP Address Management Script
# Purpose: Manage UFW firewall rules for Anthropic MCP server IP addresses
# Usage: ./update-anthropic-ips.sh [add-new|add-legacy|remove-legacy|add-all|status|rollback]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Anthropic IP addresses
NEW_IP_RANGE="160.79.104.0/21"
LEGACY_IPS=(
    "34.162.46.92/32"
    "34.162.102.82/32"
    "34.162.136.91/32"
    "34.162.142.92/32"
    "34.162.183.95/32"
)

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
        exit 1
    fi
}

# Print header
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Anthropic MCP IP Management Tool${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Add new IP range (required by Jan 15, 2026)
add_new_ips() {
    echo -e "${GREEN}Adding new Anthropic IP range...${NC}"
    ufw allow from ${NEW_IP_RANGE} to any port 443 proto tcp comment 'Anthropic MCP - New Range'
    echo -e "${GREEN}✓ Added: ${NEW_IP_RANGE}${NC}"
}

# Add legacy IPs (can keep until April 1, 2026)
add_legacy_ips() {
    echo -e "${GREEN}Adding legacy Anthropic IPs...${NC}"
    local count=1
    for ip in "${LEGACY_IPS[@]}"; do
        ufw allow from ${ip} to any port 443 proto tcp comment "Anthropic MCP - Legacy ${count}"
        echo -e "${GREEN}✓ Added: ${ip}${NC}"
        ((count++))
    done
}

# Remove legacy IPs (after April 1, 2026)
remove_legacy_ips() {
    echo -e "${YELLOW}Removing legacy Anthropic IPs...${NC}"
    for ip in "${LEGACY_IPS[@]}"; do
        # Check if rule exists before trying to delete
        if ufw status | grep -q "${ip}"; then
            ufw delete allow from ${ip} to any port 443 proto tcp
            echo -e "${GREEN}✓ Removed: ${ip}${NC}"
        else
            echo -e "${YELLOW}⊘ Not found: ${ip}${NC}"
        fi
    done
}

# Add all IPs (both new and legacy)
add_all_ips() {
    echo -e "${GREEN}Adding all Anthropic IPs...${NC}"

    # First, check if open 443 rule exists and remove it
    if ufw status | grep -E "^443/tcp.*ALLOW.*Anywhere" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠ Found open 443/tcp rule. Removing it...${NC}"
        ufw delete allow 443/tcp
        echo -e "${GREEN}✓ Removed open 443/tcp rule${NC}"
    fi

    echo ""
    add_new_ips
    echo ""
    add_legacy_ips
    echo ""
    echo -e "${GREEN}Reloading firewall...${NC}"
    ufw reload
    echo -e "${GREEN}✓ Firewall reloaded${NC}"
}

# Show current status
show_status() {
    echo -e "${BLUE}Current UFW rules for port 443:${NC}"
    echo ""
    ufw status | grep "443" || echo -e "${YELLOW}No rules found for port 443${NC}"
    echo ""

    echo -e "${BLUE}Checking for Anthropic IPs:${NC}"
    echo ""

    # Check new IP range
    if ufw status | grep -q "${NEW_IP_RANGE}"; then
        echo -e "${GREEN}✓ New IP range (${NEW_IP_RANGE}) is configured${NC}"
    else
        echo -e "${RED}✗ New IP range (${NEW_IP_RANGE}) is NOT configured${NC}"
    fi

    # Check legacy IPs
    local legacy_count=0
    for ip in "${LEGACY_IPS[@]}"; do
        if ufw status | grep -q "${ip}"; then
            ((legacy_count++))
        fi
    done

    echo -e "${BLUE}Legacy IPs configured: ${legacy_count}/${#LEGACY_IPS[@]}${NC}"

    # Check for open 443 rule
    echo ""
    if ufw status | grep -E "^443/tcp.*ALLOW.*Anywhere" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠ WARNING: Port 443 is open to ALL IPs (0.0.0.0/0)${NC}"
        echo -e "${YELLOW}  This means your MCP server is accessible from anywhere.${NC}"
        echo -e "${YELLOW}  Consider running: sudo $0 add-all${NC}"
    else
        echo -e "${GREEN}✓ Port 443 is NOT open to all IPs (good for security)${NC}"
    fi
}

# Rollback to open access
rollback() {
    echo -e "${YELLOW}⚠ WARNING: This will remove IP restrictions and allow ALL IPs!${NC}"
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo -e "${BLUE}Rollback cancelled.${NC}"
        exit 0
    fi

    echo -e "${YELLOW}Rolling back to open access...${NC}"

    # Remove new IP range
    if ufw status | grep -q "${NEW_IP_RANGE}"; then
        ufw delete allow from ${NEW_IP_RANGE} to any port 443 proto tcp
        echo -e "${GREEN}✓ Removed new IP range${NC}"
    fi

    # Remove legacy IPs
    remove_legacy_ips

    # Add open rule
    echo -e "${GREEN}Adding open 443/tcp rule...${NC}"
    ufw allow 443/tcp

    echo -e "${GREEN}Reloading firewall...${NC}"
    ufw reload

    echo -e "${GREEN}✓ Rollback complete - port 443 now open to all IPs${NC}"
}

# Show usage
show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  add-new      - Add new Anthropic IP range (160.79.104.0/21)"
    echo "  add-legacy   - Add legacy Anthropic IPs (5 individual IPs)"
    echo "  add-all      - Add all IPs (new + legacy) and remove open 443 rule"
    echo "  remove-legacy - Remove legacy IPs (use after April 1, 2026)"
    echo "  status       - Show current firewall configuration"
    echo "  rollback     - Remove IP restrictions and allow all IPs"
    echo ""
    echo "Examples:"
    echo "  sudo $0 status           # Check current configuration"
    echo "  sudo $0 add-all          # Add all Anthropic IPs (recommended)"
    echo "  sudo $0 remove-legacy    # Remove old IPs after April 1, 2026"
    echo ""
}

# Main script
main() {
    print_header

    if [ $# -eq 0 ]; then
        show_usage
        exit 0
    fi

    check_root

    case "$1" in
        add-new)
            add_new_ips
            ufw reload
            echo ""
            show_status
            ;;
        add-legacy)
            add_legacy_ips
            ufw reload
            echo ""
            show_status
            ;;
        add-all)
            add_all_ips
            echo ""
            show_status
            ;;
        remove-legacy)
            remove_legacy_ips
            ufw reload
            echo ""
            show_status
            ;;
        status)
            show_status
            ;;
        rollback)
            rollback
            echo ""
            show_status
            ;;
        *)
            echo -e "${RED}Error: Unknown command '$1'${NC}"
            echo ""
            show_usage
            exit 1
            ;;
    esac

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}Done!${NC}"
    echo -e "${BLUE}========================================${NC}"
}

main "$@"
