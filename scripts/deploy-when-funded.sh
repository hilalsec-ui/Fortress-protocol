#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# FORTRESS LOTTERY - DEPLOYMENT SCRIPT
# ═══════════════════════════════════════════════════════════════════════════
# 
# This script deploys the fortress_lottery program once sufficient SOL is available.
# Run this when you have at least 6 SOL in the admin wallet.
#
# Prerequisites:
#   - At least 6 SOL in wallet: EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg
#   - Anchor CLI installed
#   - anchor build already completed successfully
#
# Usage:
#   ./scripts/deploy-when-funded.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e

WALLET_ADDRESS="EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg"
REQUIRED_SOL=6
RPC_URL="https://api.devnet.solana.com"
WALLET_PATH="/home/dev/my-wallet.json"

echo "═══════════════════════════════════════════════════════════════════════════"
echo " FORTRESS LOTTERY DEPLOYMENT SCRIPT"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Check wallet balance
echo "Checking wallet balance..."
BALANCE=$(solana balance $WALLET_ADDRESS --url $RPC_URL | awk '{print $1}')
BALANCE_INT=$(echo $BALANCE | awk -F'.' '{print $1}')

echo "Current balance: $BALANCE SOL"
echo "Required: $REQUIRED_SOL SOL"
echo ""

if [ "$BALANCE_INT" -lt "$REQUIRED_SOL" ]; then
    echo "❌ Insufficient balance!"
    echo ""
    echo "You need at least $REQUIRED_SOL SOL to deploy."
    echo "Current balance: $BALANCE SOL"
    echo ""
    echo "Options to get more SOL:"
    echo "  1. Wait for airdrop rate limit to reset and run:"
    echo "     transfer SOL to $WALLET_ADDRESS on mainnet"
    echo ""
    echo "  2. Use the Solana faucet website (max 5 SOL with GitHub login):"
    echo "     https://faucet.solana.com"
    echo ""
    echo "  3. Transfer from another wallet that has mainnet SOL"
    echo ""
    exit 1
fi

echo "✅ Sufficient balance available!"
echo ""

# Build first to ensure latest code
echo "Building program..."
cd /home/dev/fortress
anchor build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "✅ Build successful!"
echo ""

# Deploy
echo "Deploying to mainnet..."
anchor deploy --provider.cluster mainnet

if [ $? -ne 0 ]; then
    echo "❌ Deploy failed!"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo " DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "Program ID: HerDfQLbrXk8CFPcCGW8sDvaegk1qYawSa82Wuzov4Lb"
echo ""
echo "Next steps:"
echo "  1. Reset LPM vaults: npx ts-node scripts/reset-lpm-vaults.ts"
echo "  2. Run LPM Gauntlet: npm run test:lpm-gauntlet"
echo ""
