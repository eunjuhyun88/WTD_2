#!/bin/bash
# Vercel Environment Variable Setup
# Sets EXCHANGE_ENCRYPTION_KEY in production environment
# Usage: bash scripts/infra/vercel-env-setup.sh [ENCRYPTION_KEY]

set -e

ENCRYPTION_KEY="${1:-}"

if [ -z "$ENCRYPTION_KEY" ]; then
  echo "❌ Usage: $0 <ENCRYPTION_KEY>"
  echo ""
  echo "   ENCRYPTION_KEY should be a 32-byte hex string (64 hex characters)"
  echo ""
  echo "   To generate a new key:"
  echo "     node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  echo ""
  exit 1
fi

# Validate key format (32 bytes = 64 hex chars)
if ! [[ "$ENCRYPTION_KEY" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "❌ Invalid ENCRYPTION_KEY format"
  echo "   Must be 64 hexadecimal characters (32 bytes)"
  echo "   Got: $ENCRYPTION_KEY (${#ENCRYPTION_KEY} chars)"
  exit 1
fi

echo "🔐 Setting EXCHANGE_ENCRYPTION_KEY in Vercel production environment..."
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
  echo "❌ Vercel CLI not found. Install with:"
  echo "   npm i -g vercel"
  exit 1
fi

# Check authentication
if ! vercel whoami &> /dev/null; then
  echo "❌ Not authenticated with Vercel"
  echo "   Run: vercel login"
  exit 1
fi

# Set environment variable for production
echo "📝 Adding EXCHANGE_ENCRYPTION_KEY to production environment..."
vercel env add EXCHANGE_ENCRYPTION_KEY --production <<< "$ENCRYPTION_KEY"

echo ""
echo "✅ EXCHANGE_ENCRYPTION_KEY set successfully in production!"
echo ""
echo "📋 Verification:"
echo "   vercel env list --production | grep EXCHANGE_ENCRYPTION_KEY"
echo ""
echo "⚠️  Note: Changes take effect on next Vercel deployment"
echo "   Deploy with: vercel deploy --prod"
echo ""
