#!/usr/bin/env python3
"""
Converte PNGs Lucide (preto com alpha) em arrays C no formato LVGL
LV_IMG_CF_ALPHA_8BIT. Como sao ícones line-art monocromáticos, só o
canal alpha é armazenado (1 byte/pixel). A cor final é aplicada em
runtime via lv_obj_set_style_img_recolor().

Uso:
  python3 scripts/convert_icons.py
"""

from PIL import Image
from pathlib import Path

# Ícones selecionados (nome no repo → símbolo C)
ICONS = {
    # Bottom nav
    "home":          "ic_home",
    "droplets":      "ic_droplets",
    "flask-conical": "ic_flask",
    "list-checks":   "ic_tasks",
    "activity":      "ic_activity",
    # Header HOME
    "sprout":        "ic_sprout",
    "wifi":          "ic_wifi",
    "wifi-off":      "ic_wifi_off",
    # Cards HOME (bonus — pode usar depois)
    "thermometer":   "ic_thermometer",
    "droplet":       "ic_droplet",
    "beaker":        "ic_beaker",
    "test-tube":     "ic_test_tube",
}

SRC_DIR = Path("esp32-display/assets/icons/64px")
OUT_C   = Path("esp32-display/src/cultivo_icons.c")
OUT_H   = Path("esp32-display/src/cultivo_icons.h")
TARGET_SIZE = 32   # tamanho final em pixels (resize do 64px original)

def convert(png_path: Path):
    img = Image.open(png_path).convert("RGBA")
    # Redimensiona com LANCZOS pra qualidade no line-art
    img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    w, h = img.size
    alpha_bytes = img.split()[3].tobytes()
    return w, h, alpha_bytes

def emit_c_array(name: str, data: bytes, per_line: int = 16) -> str:
    lines = []
    for i in range(0, len(data), per_line):
        chunk = data[i:i+per_line]
        lines.append("  " + ", ".join(f"0x{b:02x}" for b in chunk) + ",")
    return "\n".join(lines)

def main():
    c_parts = [
        '#include "lvgl.h"',
        '#include "cultivo_icons.h"',
        '',
    ]
    h_parts = [
        "#pragma once",
        '#include "lvgl.h"',
        '',
        "#ifdef __cplusplus",
        'extern "C" {',
        "#endif",
        '',
    ]

    for png_name, sym in ICONS.items():
        path = SRC_DIR / f"{png_name}.png"
        if not path.exists():
            print(f"SKIP {png_name}: nao encontrado em {path}")
            continue
        w, h, data = convert(path)
        print(f"OK {png_name}: {w}x{h} -> {sym} ({len(data)} bytes)")

        c_parts.append(f"static const LV_ATTRIBUTE_MEM_ALIGN uint8_t {sym}_map[] = {{")
        c_parts.append(emit_c_array(sym, data))
        c_parts.append("};")
        c_parts.append("")
        c_parts.append(f"const lv_img_dsc_t {sym} = {{")
        c_parts.append(f"  .header.cf = LV_IMG_CF_ALPHA_8BIT,")
        c_parts.append(f"  .header.always_zero = 0,")
        c_parts.append(f"  .header.reserved = 0,")
        c_parts.append(f"  .header.w = {w},")
        c_parts.append(f"  .header.h = {h},")
        c_parts.append(f"  .data_size = {len(data)},")
        c_parts.append(f"  .data = {sym}_map,")
        c_parts.append("};")
        c_parts.append("")

        h_parts.append(f"extern const lv_img_dsc_t {sym};")

    h_parts.append("")
    h_parts.append("#ifdef __cplusplus")
    h_parts.append("}")
    h_parts.append("#endif")
    h_parts.append("")

    OUT_C.write_text("\n".join(c_parts))
    OUT_H.write_text("\n".join(h_parts))
    total = sum((SRC_DIR / f"{n}.png").stat().st_size for n in ICONS if (SRC_DIR / f"{n}.png").exists())
    print(f"\nGerados {OUT_C} e {OUT_H}")
    print(f"Total PNG: {total/1024:.1f} KB")

if __name__ == "__main__":
    main()
