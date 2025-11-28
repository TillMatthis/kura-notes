#!/bin/bash
# KURA MCP Bridge - Ensures Node v22+ is used for mcp-remote

# Use Node v22 from nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Switch to Node v22
nvm use 22 >/dev/null 2>&1

# Run mcp-remote with the SSE endpoint
exec npx -y mcp-remote "https://kura.tillmaessen.de/mcp/sse"
