#!/bin/bash

# Fortress Lottery Deployment Script
# This script builds, deploys, and initializes the lottery program on Solana Devnet

set -e

echo "🏰 Fortress Protocol Lottery - Deployment Script"
echo "================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v anchor &> /dev/null; then
    echo -e "${RED}❌ Anchor CLI not found. Please install: cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked${NC}"
    exit 1
fi

if ! command -v solana &> /dev/null; then
    echo -e "${RED}❌ Solana CLI not found. Please install: sh -c \"\$(curl -sSfL https://release.solana.com/v1.18.22/install)\"${NC}"
    exit 1
fi

ANCHOR_VERSION=$(anchor --version | grep -oP '\d+\.\d+\.\d+' | head -1)
SOLANA_VERSION=$(solana --version | grep -oP '\d+\.\d+\.\d+' | head -1)

echo -e "${GREEN}✅ Anchor CLI: $ANCHOR_VERSION${NC}"
echo -e "${GREEN}✅ Solana CLI: $SOLANA_VERSION${NC}"
echo ""

# Check Solana config
echo "🔍 Checking Solana configuration..."
CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')
WALLET=$(solana config get | grep "Keypair Path" | awk '{print $3}')

echo "   Cluster: $CLUSTER"
echo "   Wallet: $WALLET"
echo ""

# Check wallet balance
BALANCE=$(solana balance | awk '{print $1}')
echo "💰 Wallet balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 0.5" | bc -l) )); then
    echo -e "${YELLOW}⚠️  Low balance. You need at least 0.5 SOL for deployment and initialization.${NC}"
    echo "   Get mainnet SOL from exchange or wallet"
    exit 1
fi
echo ""

# Build program
echo "🔨 Building Anchor program..."
anchor build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed. Check errors above.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build successful${NC}"
echo ""

# Check program ID
PROGRAM_ID=$(solana address -k target/deploy/fortress_lottery-keypair.json)
echo "📍 Program ID: $PROGRAM_ID"

EXPECTED_ID="Ft3s4d2kqTcJR8f5pXt2i8m3uzdJzq1LkX5Hjw3z4Y5Z"
if [ "$PROGRAM_ID" != "$EXPECTED_ID" ]; then
    echo -e "${YELLOW}⚠️  Program ID mismatch!${NC}"
    echo "   Generated: $PROGRAM_ID"
    echo "   Expected:  $EXPECTED_ID"
    echo ""
    echo "   Update the following files:"
    echo "   - programs/fortress_lottery/src/lib.rs (declare_id!)"
    echo "   - Anchor.toml ([programs.mainnet])"
    echo "   - app/src/utils/constants.ts (PROGRAM_ID)"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# Deploy program
echo "🚀 Deploying to Mainnet..."
anchor deploy --provider.cluster devnet

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Program deployed successfully${NC}"
echo ""

# Initialize IDL
echo "📝 Initializing IDL on-chain..."
anchor idl init --filepath target/idl/fortress_lottery.json $PROGRAM_ID --provider.cluster devnet

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  IDL initialization failed (may already exist)${NC}"
    echo "   Trying to upgrade IDL instead..."
    anchor idl upgrade --filepath target/idl/fortress_lottery.json $PROGRAM_ID --provider.cluster devnet
fi
echo ""

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
    echo ""
fi

# Initialize lotteries
echo "🎰 Initializing lottery system..."
npm run init-lotteries

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Lottery initialization failed${NC}"
    exit 1
fi
echo ""

# Copy IDL to frontend
echo "📋 Copying IDL to frontend..."
cp target/idl/fortress_lottery.json app/src/fortress_protocol.json
echo -e "${GREEN}✅ IDL copied to app/src/fortress_protocol.json${NC}"
echo ""

# Summary
echo "================================================"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "================================================"
echo ""
echo "📊 Summary:"
echo "   Program ID: $PROGRAM_ID"
echo "   Cluster: Devnet"
echo "   Global Registry: ✅"
echo "   Lotteries initialized: 5 (LPM, DPL, WPL, MPL, YPL)"
echo "   Vault PDAs created: 20 (5 types × 4 tiers)"
echo ""
echo "🔗 Next Steps:"
echo "   1. Update frontend constants with program ID (if changed)"
echo "   2. Setup Clockwork automation: npm run setup-clockwork"
echo "   3. Fund Clockwork threads with SOL"
echo "   4. Test ticket purchases from frontend"
echo ""
echo "📝 Useful Commands:"
echo "   - Check registry: solana account $(solana address -k target/deploy/fortress_lottery-keypair.json)"
echo "   - View logs: solana logs | grep 'Fortress'"
echo "   - Update IDL: anchor idl upgrade --filepath target/idl/fortress_lottery.json $PROGRAM_ID"
echo ""
echo -e "${GREEN}✨ Ready to accept lottery tickets!${NC}"
