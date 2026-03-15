#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
#                    RECOVER SOL FROM LPM VAULTS
# ═══════════════════════════════════════════════════════════════════════════
#
# This script:
# 1. Builds and deploys the program with withdraw instructions
# 2. Withdraws all SOL from the 4 LPM vaults (~14 SOL)
# 3. Closes participant pages to recover additional SOL
# 4. Resets the vaults for fresh lottery rounds
#
# Prerequisites:
# - Need ~6 SOL to deploy (wallet + program accounts need this)
# - Admin wallet: EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv
#
# ═══════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROGRAM_ID="2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo " $1"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

print_status() {
    echo -e "${YELLOW}[STATUS]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get balances
get_balances() {
    print_status "Checking current balances..."
    
    WALLET_BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')
    echo "  Wallet Balance: $WALLET_BALANCE SOL"
    
    # LPM vault addresses (derived from seeds)
    echo ""
    echo "  LPM Vault Balances:"
    
    TOTAL_VAULT=0
    for tier in 5 10 20 50; do
        # Derive vault PDA and get balance
        # Note: This is approximate - actual PDA derivation is complex
        VAULT_ADDR=$(cd "$PROJECT_ROOT" && node -e "
            const { PublicKey } = require('@solana/web3.js');
            const programId = new PublicKey('$PROGRAM_ID');
            const [vault] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault_lpm'), Buffer.from([$tier])],
                programId
            );
            console.log(vault.toString());
        " 2>/dev/null)
        
        if [ -n "$VAULT_ADDR" ]; then
            VAULT_BAL=$(solana balance "$VAULT_ADDR" 2>/dev/null | awk '{print $1}' || echo "0")
            echo "    Tier $tier: $VAULT_BAL SOL ($VAULT_ADDR)"
            TOTAL_VAULT=$(echo "$TOTAL_VAULT + $VAULT_BAL" | bc)
        fi
    done
    
    echo ""
    echo "  Total in Vaults: $TOTAL_VAULT SOL"
    
    # Program account
    PROGRAM_BAL=$(solana program show "$PROGRAM_ID" 2>/dev/null | grep "Balance:" | awk '{print $2}' || echo "0")
    echo "  Program Account: $PROGRAM_BAL SOL"
}

# Main
main() {
    print_header "RECOVER SOL FROM LPM VAULTS"
    
    cd "$PROJECT_ROOT"
    
    # Step 1: Show current state
    get_balances
    
    # Step 2: Check if we can deploy
    WALLET_BAL=$(solana balance 2>/dev/null | awk '{print $1}')
    REQUIRED="6.1"
    
    if (( $(echo "$WALLET_BAL < $REQUIRED" | bc -l) )); then
        print_error "Insufficient wallet balance for deployment!"
        echo "  Have: $WALLET_BAL SOL"
        echo "  Need: ~$REQUIRED SOL"
        echo ""
        echo "  Options:"
        echo "    1. Request SOL airdrop: solana airdrop 5"
        echo "    2. Transfer SOL from another wallet"
        echo "    3. Wait until you have enough SOL"
        exit 1
    fi
    
    print_success "Sufficient balance for deployment"
    
    # Step 3: Build
    print_header "BUILDING PROGRAM"
    anchor build
    print_success "Build complete"
    
    # Step 4: Deploy
    print_header "DEPLOYING PROGRAM"
    anchor deploy --provider.cluster mainnet
    print_success "Deployment complete"
    
    # Step 5: Withdraw from vaults
    print_header "WITHDRAWING FROM VAULTS"
    npx ts-node scripts/close-lpm-vaults.ts
    
    # Step 6: Show final state
    print_header "FINAL STATE"
    get_balances
    
    print_success "Recovery complete!"
}

# Run
main "$@"
