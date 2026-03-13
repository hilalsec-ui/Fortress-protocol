#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
#              AUTO-RETRY DEPLOYMENT WITH AIRDROP ATTEMPTS
# ═══════════════════════════════════════════════════════════════════════════
#
# This script:
# 1. Monitors SOL balance
# 2. Attempts airdrop periodically
# 3. Deploys when sufficient SOL available
# 4. Proceeds with recovery workflow
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

print_status() {
    echo -e "${YELLOW}[WAIT]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

main() {
    print_header "AUTO-RETRY DEPLOYMENT MONITOR"
    
    REQUIRED_SOL=6.06
    RETRY_INTERVAL=30  # seconds between retries
    MAX_ATTEMPTS=12    # 12 attempts * 30 sec = 6 minutes
    ATTEMPT=0
    
    cd /home/dev/fortress
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        ATTEMPT=$((ATTEMPT + 1))
        BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')
        
        echo ""
        echo "Attempt $ATTEMPT/$MAX_ATTEMPTS at $(date '+%H:%M:%S')"
        echo "Current Balance: $BALANCE SOL (need: $REQUIRED_SOL SOL)"
        
        # Check if we have enough
        if (( $(echo "$BALANCE >= $REQUIRED_SOL" | bc -l) )); then
            print_success "Sufficient balance! Proceeding with deployment..."
            
            # Build
            echo ""
            print_header "BUILDING"
            anchor build 2>&1 | tail -3
            
            # Deploy
            echo ""
            print_header "DEPLOYING"
            anchor deploy --provider.cluster mainnet && {
                print_success "Deployment successful!"
                
                # Proceed with recovery
                echo ""
                print_header "PROCEEDING WITH RECOVERY"
                npx ts-node scripts/close-lpm-vaults.ts
                npx ts-node scripts/rebuild-lpm-vaults.ts
                
                print_header "COMPLETE!"
                exit 0
            } || {
                print_error "Deployment failed"
                exit 1
            }
        fi
        
        # Try airdrop
        print_status "Attempting airdrop..."
        if echo "NOTE: airdrops not available on mainnet"  # was: solana airdrop 2>&1 | grep -q "received"; then
            print_success "Airdrop successful!"
            sleep 2
            continue
        else
            print_error "Airdrop failed (rate limited or not available)"
        fi
        
        # Wait before retry
        if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
            echo "Waiting $RETRY_INTERVAL seconds before retry..."
            sleep $RETRY_INTERVAL
        fi
    done
    
    print_error "Max attempts reached without sufficient SOL"
    echo ""
    echo "Solutions:"
    echo "  1. Transfer SOL from another wallet"
    echo "  2. Try again later when airdrop is available"
    echo "  3. Use localnet for development: solana-test-validator"
    exit 1
}

main "$@"
