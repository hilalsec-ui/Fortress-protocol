#!/bin/bash

# Script to update Solana CLI and verify edition2024 support
# Run this when network connectivity is restored

set -e

echo "=================================="
echo "Fortress Lottery - Solana Update"
echo "=================================="
echo ""

# Check current version
echo "Current Solana version:"
solana --version
echo ""

echo "Current cargo-build-sbf details:"
cargo-build-sbf --version
echo ""

# Backup current installation
echo "Backing up current Solana installation..."
if [ -d "$HOME/.local/share/solana/install/active_release" ]; then
    BACKUP_DIR="$HOME/.local/share/solana/install/backup_$(date +%Y%m%d_%H%M%S)"
    cp -r "$HOME/.local/share/solana/install/active_release" "$BACKUP_DIR"
    echo "Backup created at: $BACKUP_DIR"
fi
echo ""

# Update Solana CLI
echo "Updating Solana CLI to latest stable..."
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
echo ""

# Reload PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
echo ""

# Verify new version
echo "New Solana version:"
solana --version
echo ""

echo "New cargo-build-sbf details:"
cargo-build-sbf --version
echo ""

# Check if Rust version is sufficient
CARGO_BUILD_SBF_RUST=$(cargo-build-sbf --version 2>&1 | grep -oP 'rustc \K[0-9]+\.[0-9]+' || echo "unknown")
echo "cargo-build-sbf Rust version: $CARGO_BUILD_SBF_RUST"

if [ "$CARGO_BUILD_SBF_RUST" != "unknown" ]; then
    MAJOR=$(echo $CARGO_BUILD_SBF_RUST | cut -d. -f1)
    MINOR=$(echo $CARGO_BUILD_SBF_RUST | cut -d. -f2)
    
    if [ "$MAJOR" -gt 1 ] || ([ "$MAJOR" -eq 1 ] && [ "$MINOR" -ge 76 ]); then
        echo "✅ Rust version supports edition2024!"
        echo ""
        echo "You can now build the program:"
        echo "  cd /home/dev/fortress"
        echo "  anchor build"
    else
        echo "⚠️  Rust version still < 1.76, edition2024 may not be supported"
        echo "You may need to update to Solana CLI v2.0 or later"
    fi
else
    echo "⚠️  Could not determine Rust version"
fi

echo ""
echo "Update complete!"
