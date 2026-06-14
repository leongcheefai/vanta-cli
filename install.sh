#!/usr/bin/env bash
set -euo pipefail

echo "Installing vanta-cli..."
npm i -g github:leongcheefai/vanta-cli

NPM_BIN_DIR="$(npm prefix -g)/bin"

# Already in PATH — done
if command -v vanta &>/dev/null; then
  echo "✓ vanta installed"
  exit 0
fi

# Detect shell profile
case "$(basename "$SHELL")" in
  zsh)  PROFILE="$HOME/.zshrc" ;;
  bash) PROFILE="${HOME}/.bash_profile"; [[ -f "$HOME/.bashrc" ]] && PROFILE="$HOME/.bashrc" ;;
  *)    PROFILE="$HOME/.profile" ;;
esac

# Add to PATH if not already there
if ! grep -qF "$NPM_BIN_DIR" "$PROFILE" 2>/dev/null; then
  printf '\nexport PATH="%s:$PATH"\n' "$NPM_BIN_DIR" >> "$PROFILE"
  echo "Added $NPM_BIN_DIR to PATH in $PROFILE"
fi

echo ""
echo "✓ Installed. Activate with:"
echo "  source $PROFILE"
echo ""
echo "Then run: vanta --help"
