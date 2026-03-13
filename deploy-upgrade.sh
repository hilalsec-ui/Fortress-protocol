#!/bin/bash

# Fortress Lottery Program Upgrade Script
# This script upgrades the fixed program to Devnet

set -e

PROGRAM_ID="2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY"
CLUSTER="devnet"
WALLET="/home/dev/my-wallet.json"
PROGRAM_PATH="target/deploy/fortress_protocol.so"

echo "=================================================="
echo "Fortress Lottery Program Upgrade"
echo "=================================================="
echo ""
echo "🔍 Pre-flight Checks"
echo "  Program ID: $PROGRAM_ID"
echo "  Cluster: $CLUSTER"
echo "  Wallet: $WALLET"
echo ""

# Check wallet
if [ ! -f "${WALLET/#\~/$HOME}" ]; then
    echo "❌ Wallet not found: $WALLET"
    exit 1
fi

# Check program binary
if [ ! -f "$PROGRAM_PATH" ]; then
    echo "❌ Program binary not found: $PROGRAM_PATH"
    echo "   Run: anchor build"
    exit 1
fi

echo "  ✅ Wallet exists"
echo "  ✅ Program binary exists"
echo ""

# Check balance
BALANCE=$(solana balance $(solana-keygen pubkey "$WALLET") --url "$CLUSTER" | awk '{print $1}')
echo "💰 Wallet Balance: $BALANCE SOL"

REQUIRED="4.81"
if (( $(echo "$BALANCE < $REQUIRED" | bc -l) )); then
    echo "❌ Insufficient balance. Required: $REQUIRED SOL"
    echo ""
    echo "   Get SOL from faucet:"
    echo "   solana airdrop 5 $(solana-keygen pubkey $WALLET) --url $CLUSTER"
    echo ""
    echo "   Or visit: https://faucet.solana.com/"
    exit 1
fi

echo "  ✅ Sufficient balance"
echo ""

# Perform upgrade
echo "📤 Deploying upgraded program..."
echo ""

if solana program write-buffer "$PROGRAM_PATH" --keypair "$WALLET" --url "$CLUSTER" > /tmp/buffer_output.txt; then
    BUFFER=$(cat /tmp/buffer_output.txt | awk '{print $2}')
    echo "Buffer created: $BUFFER"
    solana program upgrade "$BUFFER" "$PROGRAM_ID" --keypair "$WALLET" --url "$CLUSTER"
    
    echo ""
    echo "=================================================="
    echo "✅ UPGRADE SUCCESSFUL!"
    echo "=================================================="
    echo ""
    echo "Program upgraded with fixes:"
    echo "  ✅ buy_ticket.rs - All 5 lottery types fixed"
    echo "  ✅ draw_winner.rs - All 5 lottery types fixed"
    echo ""
    echo "Users can now:"
    echo "  🎫 Buy lottery tickets"
    echo "  🎰 Draw winners"
    echo "  💰 Withdraw winnings"
    echo ""
    echo "Test it:"
    echo "  1. Open: http://localhost:3001"
    echo "  2. Connect wallet"
    echo "  3. Buy LPM ticket at tier \$5"
    echo "  4. Verify transaction succeeds"
    echo ""
else
    echo ""
    echo "❌ UPGRADE FAILED"
    echo "   Check logs above for details"
    exit 1
fi
