// ════════════════════════════════════════════════════════════════════════════════
// cultivo_ui.h — entrypoint da UI no simulador
//
// Declara buildCultivoUI() que monta toda a hierarquia de telas + navbar
// usando LVGL puro, com sensores/estado mockados. Separado do main_lvgl.cpp
// (ESP32) pra nao precisar compilar stacks Arduino/WiFi/etc no Mac.
//
// Para trazer uma mudanca visual daqui pro firmware real: copie a funcao
// buildX() ou refreshX() relevante de cultivo_ui.cpp -> main_lvgl.cpp.
// ════════════════════════════════════════════════════════════════════════════════
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

void buildCultivoUI(void);

#ifdef __cplusplus
}
#endif
