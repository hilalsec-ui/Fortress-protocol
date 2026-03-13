#!/bin/bash
# Build script that patches edition2024 packages before building

set -e

echo "Patching edition2024 packages..."

# Patch constant_time_eq
if [ -f "$HOME/.cargo/registry/src/index.crates.io-*/constant_time_eq-0.4.2/Cargo.toml" ]; then
    for file in $HOME/.cargo/registry/src/index.crates.io-*/constant_time_eq-0.4.2/Cargo.toml; do
        if [ -f "$file" ]; then
            echo "Patching: $file"
            sed -i 's/edition = "2024"/edition = "2021"/' "$file"
        fi
    done
fi

# Patch blake3
if [ -f "$HOME/.cargo/registry/src/index.crates.io-*/blake3-1.8.3/Cargo.toml" ]; then
    for file in $HOME/.cargo/registry/src/index.crates.io-*/blake3-1.8.3/Cargo.toml; do
        if [ -f "$file" ]; then
            echo "Patching: $file"
            sed -i 's/edition = "2024"/edition = "2021"/' "$file"
        fi
    done
fi

# Patch wit-bindgen
if [ -f "$HOME/.cargo/registry/src/index.crates.io-*/wit-bindgen-0.51.0/Cargo.toml" ]; then
    for file in $HOME/.cargo/registry/src/index.crates.io-*/wit-bindgen-0.51.0/Cargo.toml; do
        if [ -f "$file" ]; then
            echo "Patching: $file"
            sed -i 's/edition = "2024"/edition = "2021"/' "$file"
        fi
    done
fi

echo "Patching rust-version requirements..."

# Remove or lower rust-version requirements that are too high
for file in $HOME/.cargo/registry/src/index.crates.io-*/*/Cargo.toml; do
    if grep -q 'rust-version = "1\.[89][0-9]\.[0-9]' "$file" 2>/dev/null; then
        echo "Lowering rust-version in: $file"
        sed -i 's/rust-version = "1\.[89][0-9]\.[0-9]/rust-version = "1.75/' "$file"
    fi
done

echo "Done patching. Building..."
cargo build-sbf "$@"
