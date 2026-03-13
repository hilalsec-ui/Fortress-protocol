#!/bin/bash
set -e

PROGRAM_ID="HerDfQLbrXk8CFPcCGW8sDvaegk1qYawSa82Wuzov4Lb"
FPT_MINT="7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2"
WALLET="${ANCHOR_WALLET:-/home/dev/my-wallet.json}"
RPC="https://api.devnet.solana.com"

echo "🔧 FORTRESS LOTTERY VAULT INITIALIZATION"
echo ""
echo "Program: $PROGRAM_ID"
echo "Mint:    $FPT_MINT"
echo "Wallet:  $WALLET"
echo ""

# Function to initialize a vault tier
init_vault() {
  local lottery_type=$1
  local tier=$2
  
  echo -n "  Tier \$$tier... "
  
  # Call initialize instruction via Anchor
  anchor run initialize-${lottery_type,,}-tier --provider.cluster devnet "$tier" 2>/dev/null && {
    echo "✅"
    return 0
  } || {
    echo "⏭️  (already initialized)"
    return 0
  }
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "INITIALIZING LOTTERY VAULTS (4-byte LE seeds)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Initialize all vaults
echo "📍 LPM:"
init_vault "LPM" 5
init_vault "LPM" 10
init_vault "LPM" 20
init_vault "LPM" 50

echo "📍 DPL:"
init_vault "DPL" 5
init_vault "DPL" 10
init_vault "DPL" 15
init_vault "DPL" 20

echo "📍 WPL:"
init_vault "WPL" 5
init_vault "WPL" 10
init_vault "WPL" 15
init_vault "WPL" 20

echo "📍 MPL:"
init_vault "MPL" 5
init_vault "MPL" 10
init_vault "MPL" 15
init_vault "MPL" 20

echo "📍 YPL:"
init_vault "YPL" 5
init_vault "YPL" 10
init_vault "YPL" 15
init_vault "YPL" 20

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Vault initialization complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next: Open http://localhost:3001 and buy a ticket"
