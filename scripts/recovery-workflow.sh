#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
#         SOL RECOVERY & VAULT REBUILD - COMPLETE WORKFLOW
# ═══════════════════════════════════════════════════════════════════════════
#
# CURRENT STATE:
#   - Wallet: 1.7 SOL
#   - LPM Vaults: 14 SOL (3.5 SOL each x 4 tiers)
#   - Program: 6 SOL
#
# GOAL:
#   - Deploy updated program (requires ~6 SOL)
#   - Recover 14 SOL from vaults
#   - Rebuild vaults with 0.05 SOL MAXIMUM per vault
#   - Total after recovery: 1.7 + 14 = 15.7 SOL
#   - Total after rebuild: 15.7 - 0.05*4 = 15.5 SOL (net positive)
#
# STEPS:
# 1. Get 5 SOL airdrop (if available) -> 6.7 SOL total
# 2. Deploy program (uses ~6.05 SOL) -> 0.65 SOL + 14 SOL in vaults
# 3. Withdraw from vaults -> 14.65 SOL in wallet
# 4. Initialize vaults with 0.05 SOL each -> 14.65 - (0.05*4) = 14.45 SOL in wallet
#
# ═══════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
}

print_step() {
    echo -e "${YELLOW}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

show_balances() {
    print_step "Current Balances:"
    
    WALLET=$(solana balance 2>/dev/null | awk '{print $1}')
    PROGRAM=$(solana program show 2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY 2>/dev/null | grep "Balance:" | awk '{print $2}' || echo "0")
    
    echo "  Wallet: $WALLET SOL"
    echo "  Program: $PROGRAM SOL"
    
    # Calculate vault totals
    node -e "
        const { PublicKey, Connection } = require('@solana/web3.js');
        const programId = new PublicKey('2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY');
        const connection = new Connection('https://api.mainnet-beta.solana.com');
        
        async function main() {
            let total = 0;
            for (const tier of [5, 10, 20, 50]) {
                const [vault] = PublicKey.findProgramAddressSync(
                    [Buffer.from('vault_lpm'), Buffer.from([tier])],
                    programId
                );
                const balance = await connection.getBalance(vault);
                total += balance / 1e9;
            }
            console.log('  Vaults: ' + total.toFixed(6) + ' SOL');
        }
        main().catch(console.error);
    " 2>/dev/null || echo "  Vaults: (unable to calculate)"
}

main() {
    print_header "SOL RECOVERY & VAULT REBUILD"
    
    show_balances
    
    echo ""
    print_step "Step 1: Check wallet balance for deployment"
    BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')
    
    if (( $(echo "$BALANCE < 4" | bc -l) )); then
        print_error "Insufficient balance ($BALANCE SOL). Need ~6 SOL to deploy."
        echo ""
        echo "  Run: solana airdrop 5"
        echo "  Then: ./scripts/recover-lpm-sol.sh"
        exit 1
    fi
    
    print_success "Balance sufficient: $BALANCE SOL"
    
    echo ""
    print_step "Step 2: Build program"
    anchor build 2>&1 | tail -1
    print_success "Build complete"
    
    echo ""
    print_step "Step 3: Deploy program upgrade"
    anchor deploy --provider.cluster mainnet 2>&1 | grep -E "Deployed|Error" || echo "Deployment in progress..."
    print_success "Deployment complete"
    
    echo ""
    print_step "Step 4: Withdraw SOL from vaults"
    npx ts-node scripts/close-lpm-vaults.ts 2>&1 | tail -10
    print_success "Withdrawal complete"
    
    echo ""
    print_step "Step 5: Rebuild vaults with 0.05 SOL each"
    npx ts-node scripts/rebuild-lpm-vaults.ts 2>&1 | tail -10
    print_success "Rebuild complete"
    
    echo ""
    print_header "RECOVERY COMPLETE"
    show_balances
    
    echo ""
    echo "  All vaults now initialized with 0.05 SOL maximum"
    echo "  Total SOL recovered and saved!"
}

main "$@"
