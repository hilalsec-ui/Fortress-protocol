#!/bin/bash
# Patch vendored dependencies for Rust 1.75 compatibility

set -e

echo "Patching edition2024 packages to edition2021..."

# Find and patch all edition2024 packages
find vendor* -name "Cargo.toml" -exec grep -l 'edition = "2024"' {} \; | while read file; do
    echo "Patching: $file"
    sed -i 's/edition = "2024"/edition = "2021"/' "$file"
done

echo "✅ All edition2024 packages patched to edition2021"
echo ""
echo "Patched packages:"
find vendor* -name "Cargo.toml" -exec grep -l 'edition = "2021"' {} \; | grep -E "(blake3|constant_time_eq|wit-bindgen)" || echo "  - None found (already patched or not present)"
