#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# run.sh — build e executa o simulador SDL2 no Mac
#
# Uso (de qualquer diretorio):
#   ./esp32-display/sim/run.sh
#
# Dependencias (rodar uma vez):
#   brew install cmake sdl2
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Sempre trabalha a partir do diretorio sim/ (independente de onde foi chamado)
cd "$(dirname "$0")"

# SDL2 do Homebrew em Apple Silicon fica em /opt/homebrew; CMake nao acha sozinho
if command -v brew >/dev/null 2>&1; then
  SDL2_PREFIX="$(brew --prefix sdl2 2>/dev/null || true)"
  if [ -n "${SDL2_PREFIX}" ]; then
    export CMAKE_PREFIX_PATH="${SDL2_PREFIX}${CMAKE_PREFIX_PATH:+:${CMAKE_PREFIX_PATH}}"
  fi
fi

echo "╔══════════════════════════════════════════╗"
echo "║  Cultivo Sim — build & run              ║"
echo "╚══════════════════════════════════════════╝"
echo "[1/3] Configurando (baixa LVGL 9.2.2 na 1a vez, ~1min)..."
cmake -B build -S .

echo ""
echo "[2/3] Compilando..."
cmake --build build -j

echo ""
echo "[3/3] Abrindo janela 480x320..."
echo "      (Cmd+Q ou feche a janela pra sair)"
echo ""
exec ./build/cultivo_sim
