#!/bin/bash

# Fortress Lottery - Cargo Update & Verification Script

set -e

echo "🏰 Fortress Protocol - Cargo Update Script"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check current Cargo version
echo "📋 Checking current versions..."
CURRENT_CARGO=$(cargo --version | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
CURRENT_RUST=$(rustc --version | grep -oP '\d+\.\d+\.\d+' || echo "unknown")

echo "   Current Rust: $CURRENT_RUST"
echo "   Current Cargo: $CURRENT_CARGO"
echo ""

# Check if Cargo is sufficient
if [[ "$CURRENT_CARGO" == "1.85"* ]] || [[ "$CURRENT_CARGO" == "1.86"* ]] || [[ "$CURRENT_CARGO" == "1.8"[7-9]* ]] || [[ "$CURRENT_CARGO" == "1.9"* ]] || [[ "$CURRENT_CARGO" > "1.85" ]]; then
    echo -e "${GREEN}✅ Cargo version is sufficient ($CURRENT_CARGO >= 1.85.0)${NC}"
    echo ""
    echo "You can now build the program:"
    echo "  cd /home/dev/fortress"
    echo "  anchor build"
    exit 0
fi

echo -e "${YELLOW}⚠️  Cargo version $CURRENT_CARGO is too old${NC}"
echo "   Required: 1.85.0+"
echo ""

# Prompt user
echo "Would you like to update Rust/Cargo now?"
echo ""
echo "  1) Update to latest stable (Recommended)"
echo "  2) Install Rust 1.81.0 (Minimum required)"
echo "  3) Cancel (I'll do it manually)"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo -e "${BLUE}📦 Updating to latest stable Rust...${NC}"
        rustup update stable
        rustup default stable
        ;;
    2)
        echo ""
        echo -e "${BLUE}📦 Installing Rust 1.81.0...${NC}"
        rustup install 1.81.0
        rustup default 1.81.0
        ;;
    3)
        echo ""
        echo -e "${YELLOW}Manual update instructions:${NC}"
        echo ""
        echo "Option A - Update to latest:"
        echo "  rustup update stable"
        echo "  rustup default stable"
        echo ""
        echo "Option B - Install specific version:"
        echo "  rustup install 1.81.0"
        echo "  rustup default 1.81.0"
        echo ""
        echo "Then verify:"
        echo "  cargo --version"
        echo ""
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac

# Verify new versions
echo ""
echo "🔍 Verifying new installation..."
NEW_CARGO=$(cargo --version | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
NEW_RUST=$(rustc --version | grep -oP '\d+\.\d+\.\d+' || echo "unknown")

echo "   New Rust: $NEW_RUST"
echo "   New Cargo: $NEW_CARGO"
echo ""

if [[ "$NEW_CARGO" == "1.85"* ]] || [[ "$NEW_CARGO" == "1.86"* ]] || [[ "$NEW_CARGO" == "1.8"[7-9]* ]] || [[ "$NEW_CARGO" == "1.9"* ]] || [[ "$NEW_CARGO" > "1.85" ]]; then
    echo -e "${GREEN}✅ Update successful! Cargo $NEW_CARGO is ready.${NC}"
    echo ""
    echo "🚀 Next steps:"
    echo ""
    echo "1. Build the program:"
    echo "   cd /home/dev/fortress"
    echo "   anchor build"
    echo ""
    echo "2. Deploy to mainnet:"
    echo "   ./deploy.sh"
    echo ""
    echo "3. Or deploy manually:"
    echo "   anchor deploy --provider.cluster devnet"
    echo "   npm run init-lotteries"
    echo ""
else
    echo -e "${RED}⚠️  Update may not have worked correctly.${NC}"
    echo "   Current Cargo: $NEW_CARGO"
    echo "   Required: 1.85.0+"
    echo ""
    echo "Try again with:"
    echo "  rustup update stable --force"
    echo ""
    exit 1
fi
