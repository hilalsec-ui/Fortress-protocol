#!/bin/bash
# Start Solana Local Test Validator

echo "🚀 Starting Solana Test Validator..."
echo ""
echo "This will run a local blockchain with unlimited SOL for testing"
echo ""

# Create a directory for validator files
mkdir -p ~/.solana-validator

# Start validator with persistent state
solana-test-validator \
  --ledger ~/.solana-validator/ledger \
  --reset \
  --quiet &

VALIDATOR_PID=$!

echo "⏳ Waiting for validator to start..."
sleep 5

# Configure Solana CLI to use local validator
echo "🔧 Configuring Solana CLI..."
solana config set --url http://localhost:8899

# Fund the wallet with 1000 SOL
echo "💰 Funding wallet with 1000 SOL..."
solana airdrop 1000 EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg --url localhost

# Check balance
echo ""
echo "✅ Setup complete!"
echo ""
solana balance --url localhost
echo ""
echo "📋 Validator is running in the background (PID: $VALIDATOR_PID)"
echo ""
echo "To stop validator later, run:"
echo "  kill $VALIDATOR_PID"
echo ""
echo "In another terminal, you can now:"
echo "  npm run deploy        # Deploy to local validator"
echo "  npm run init-lotteries  # Initialize lottery vaults"
echo ""
echo "Press Ctrl+C to stop the validator"

# Keep script running
wait $VALIDATOR_PID
