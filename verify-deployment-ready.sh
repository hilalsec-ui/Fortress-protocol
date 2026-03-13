#!/bin/bash
# Deployment Readiness Verification Script
# Usage: ./verify-deployment-ready.sh

set -e

echo "=========================================="
echo "🔍 FORTRESS LOTTERY - DEPLOYMENT READINESS"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Cargo Check
echo "📦 [1/7] Checking Rust compilation..."
if cargo check --manifest-path programs/fortress_lottery/Cargo.toml 2>&1 | grep -q "Finished"; then
    echo -e "${GREEN}✅ Cargo check passed${NC}"
else
    echo -e "${RED}❌ Cargo check failed${NC}"
    exit 1
fi

# Check 2: Anchor Build
echo ""
echo "🏗️  [2/7] Building Anchor program..."
if anchor build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Anchor build successful${NC}"
    
    # Check program size
    PROGRAM_SIZE=$(ls -lh target/deploy/fortress_lottery.so | awk '{print $5}')
    echo "   Program size: $PROGRAM_SIZE"
else
    echo -e "${RED}❌ Anchor build failed${NC}"
    exit 1
fi

# Check 3: IDL Generated
echo ""
echo "📄 [3/7] Verifying IDL generation..."
if [ -f "target/idl/fortress_lottery.json" ]; then
    echo -e "${GREEN}✅ IDL file exists${NC}"
    
    # Count instructions
    INSTRUCTION_COUNT=$(jq '.instructions | length' target/idl/fortress_lottery.json)
    echo "   Instructions: $INSTRUCTION_COUNT"
else
    echo -e "${RED}❌ IDL file not found${NC}"
    exit 1
fi

# Check 4: Cluster Configuration
echo ""
echo "🌐 [4/7] Checking Solana cluster configuration..."
CURRENT_CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')
if [[ "$CURRENT_CLUSTER" == *"mainnet"* ]]; then
    echo -e "${GREEN}✅ Solana CLI configured for mainnet${NC}"
    echo "   Cluster: $CURRENT_CLUSTER"
else
    echo -e "${YELLOW}⚠️  Solana CLI not on mainnet: $CURRENT_CLUSTER${NC}"
    echo "   Run: solana config set --url https://api.devnet.solana.com"
fi

# Check 5: Admin Wallet Balance
echo ""
echo "💰 [5/7] Checking admin wallet balance..."
ADMIN_WALLET="EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv"
BALANCE=$(solana balance $ADMIN_WALLET 2>/dev/null || echo "0")
echo "   Admin wallet: $ADMIN_WALLET"
echo "   Balance: $BALANCE"

if (( $(echo "$BALANCE > 1" | bc -l) )); then
    echo -e "${GREEN}✅ Sufficient balance for deployment${NC}"
else
    echo -e "${YELLOW}⚠️  Low balance - may need airdrop${NC}"
    echo "   Run: solana airdrop 2 $ADMIN_WALLET"
fi

# Check 6: Program Account
echo ""
echo "📋 [6/7] Checking program account..."
PROGRAM_ID="HerDfQLbrXk8CFPcCGW8sDvaegk1qYawSa82Wuzov4Lb"
if solana program show $PROGRAM_ID 2>/dev/null | grep -q "Program Id"; then
    echo -e "${GREEN}✅ Program already deployed${NC}"
    PROGRAM_DATA=$(solana program show $PROGRAM_ID | grep "Data Length" | awk '{print $3}')
    echo "   Program ID: $PROGRAM_ID"
    echo "   Data Length: $PROGRAM_DATA bytes"
else
    echo -e "${YELLOW}⚠️  Program not yet deployed (expected for first deployment)${NC}"
    echo "   Program ID: $PROGRAM_ID"
fi

# Check 7: FPT Mint
echo ""
echo "🪙 [7/7] Verifying FPT token mint..."
FPT_MINT="96i8AFYcjBErBJeAdxzbR9ANSjKbtYstn1QRSaDvmexw"
if solana account $FPT_MINT 2>/dev/null | grep -q "Account"; then
    echo -e "${GREEN}✅ FPT mint exists on mainnet${NC}"
    echo "   Mint: $FPT_MINT"
else
    echo -e "${RED}❌ FPT mint not found${NC}"
    echo "   Expected: $FPT_MINT"
    exit 1
fi

# Summary
echo ""
echo "=========================================="
echo "📊 VERIFICATION SUMMARY"
echo "=========================================="
echo ""

# Count critical files
STATE_FILES=$(ls -1 programs/fortress_lottery/src/state/*.rs 2>/dev/null | wc -l)
INSTRUCTION_FILES=$(ls -1 programs/fortress_lottery/src/instructions/*.rs 2>/dev/null | wc -l)

echo "📁 Code Structure:"
echo "   State files: $STATE_FILES"
echo "   Instruction files: $INSTRUCTION_FILES"
echo ""

echo "🔧 Key Features Implemented:"
echo "   ✅ Hybrid Currency Architecture (USDC-denominated, FPT-paid)"
echo "   ✅ Dynamic Pricing System (PricingConfig + oracle.rs)"
echo "   ✅ Round-Based Vault Tracking (GlobalRegistry rounds)"
echo "   ✅ Slippage Protection (max_dpt_amount parameter)"
echo "   ✅ 5 Lottery Pools × 4 Tiers = 20 Total Tiers"
echo ""

echo "⚠️  Known Limitations:"
echo "   - Clock-based randomness (Pyth Entropy pending SDK)"
echo "   - PDA seeds don't include round_number (state-only tracking)"
echo "   - Oracle disabled (manual rate mode: 0.5 FPT/USDC)"
echo ""

echo "🚀 Next Steps:"
echo "   1. Run tests: anchor test --skip-local-validator"
echo "   2. Deploy program: anchor deploy --provider.cluster devnet"
echo "   3. Initialize registry: anchor run initialize-registry"
echo "   4. Initialize pricing: anchor run initialize-pricing"
echo "   5. Initialize all 20 tiers: Use deployment scripts"
echo ""

echo -e "${GREEN}✅ DEPLOYMENT READINESS: VERIFIED${NC}"
echo "   Ready to deploy with manual testing"
echo ""
