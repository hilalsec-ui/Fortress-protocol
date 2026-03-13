#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
#                    FORTRESS LOTTERY FULL STRESS TEST RUNNER
# ═══════════════════════════════════════════════════════════════════════════
# 
# Runs stress tests for all 5 lottery types:
# - LPM: Lottery Pool Max (100 participants, auto-draw)
# - DPL: Daily Pool Lottery (unlimited, daily draw)
# - WPL: Weekly Pool Lottery (unlimited, weekly draw)
# - MPL: Monthly Pool Lottery (unlimited, monthly draw)
# - YPL: Yearly Pool Lottery (unlimited, yearly draw)
#
# Usage:
#   ./scripts/run-all-stress-tests.sh [lpm|dpl|wpl|mpl|ypl|all]
#
# ═══════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check prerequisites
check_prerequisites() {
    print_header "CHECKING PREREQUISITES"
    
    # Check if anchor is installed
    if ! command -v anchor &> /dev/null; then
        print_error "Anchor CLI not found. Please install it first."
        exit 1
    fi
    print_success "Anchor CLI found"
    
    # Check if npm packages are installed
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        print_status "Installing npm dependencies..."
        cd "$PROJECT_ROOT" && npm install
    fi
    print_success "npm dependencies installed"
    
    # Check wallet balance
    BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')
    print_status "Wallet balance: $BALANCE SOL"
    
    if (( $(echo "$BALANCE < 5" | bc -l) )); then
        print_error "Insufficient SOL balance. Need at least 5 SOL for stress tests."
        print_status "Request airdrop or fund your wallet."
        exit 1
    fi
    print_success "Sufficient SOL balance"
}

# Run individual test
run_test() {
    local test_name=$1
    local test_file=$2
    
    print_header "RUNNING $test_name STRESS TEST"
    
    cd "$PROJECT_ROOT"
    
    if npx ts-mocha -p ./tsconfig.json -t 600000 "$test_file"; then
        print_success "$test_name stress test PASSED"
        return 0
    else
        print_error "$test_name stress test FAILED"
        return 1
    fi
}

# Main execution
main() {
    local test_type="${1:-all}"
    
    print_header "FORTRESS LOTTERY STRESS TEST RUNNER"
    echo "Test Type: $test_type"
    echo "Timestamp: $(date)"
    echo ""
    
    check_prerequisites
    
    local passed=0
    local failed=0
    local skipped=0
    
    case "$test_type" in
        lpm)
            if run_test "LPM" "tests/lpm-gauntlet.test.ts"; then
                ((passed++))
            else
                ((failed++))
            fi
            ;;
        dpl)
            if run_test "DPL" "tests/dpl-stress.test.ts"; then
                ((passed++))
            else
                ((failed++))
            fi
            ;;
        wpl)
            if run_test "WPL" "tests/wpl-stress.test.ts"; then
                ((passed++))
            else
                ((failed++))
            fi
            ;;
        mpl)
            if run_test "MPL" "tests/mpl-stress.test.ts"; then
                ((passed++))
            else
                ((failed++))
            fi
            ;;
        ypl)
            if run_test "YPL" "tests/ypl-stress.test.ts"; then
                ((passed++))
            else
                ((failed++))
            fi
            ;;
        all)
            print_header "RUNNING ALL STRESS TESTS"
            
            for lottery in lpm dpl wpl mpl ypl; do
                case "$lottery" in
                    lpm) test_file="tests/lpm-gauntlet.test.ts" ;;
                    dpl) test_file="tests/dpl-stress.test.ts" ;;
                    wpl) test_file="tests/wpl-stress.test.ts" ;;
                    mpl) test_file="tests/mpl-stress.test.ts" ;;
                    ypl) test_file="tests/ypl-stress.test.ts" ;;
                esac
                
                if [ -f "$PROJECT_ROOT/$test_file" ]; then
                    if run_test "${lottery^^}" "$test_file"; then
                        ((passed++))
                    else
                        ((failed++))
                    fi
                else
                    print_status "Skipping ${lottery^^} - test file not found"
                    ((skipped++))
                fi
                
                echo ""
            done
            ;;
        *)
            print_error "Unknown test type: $test_type"
            echo "Usage: $0 [lpm|dpl|wpl|mpl|ypl|all]"
            exit 1
            ;;
    esac
    
    print_header "TEST SUMMARY"
    echo -e "  ${GREEN}Passed:${NC}  $passed"
    echo -e "  ${RED}Failed:${NC}  $failed"
    echo -e "  ${YELLOW}Skipped:${NC} $skipped"
    echo ""
    
    if [ $failed -gt 0 ]; then
        print_error "Some tests failed!"
        exit 1
    else
        print_success "All tests passed!"
        exit 0
    fi
}

# Show usage if --help
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Fortress Lottery Stress Test Runner"
    echo ""
    echo "Usage: $0 [test_type]"
    echo ""
    echo "Test Types:"
    echo "  lpm   - Run LPM (Lottery Pool Max) stress test"
    echo "  dpl   - Run DPL (Daily Pool Lottery) stress test"
    echo "  wpl   - Run WPL (Weekly Pool Lottery) stress test"
    echo "  mpl   - Run MPL (Monthly Pool Lottery) stress test"
    echo "  ypl   - Run YPL (Yearly Pool Lottery) stress test"
    echo "  all   - Run all stress tests (default)"
    echo ""
    echo "Examples:"
    echo "  $0 lpm    # Run only LPM test"
    echo "  $0 all    # Run all tests"
    echo "  $0        # Same as 'all'"
    exit 0
fi

main "$@"
