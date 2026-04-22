cmake_minimum_required(VERSION 3.14)
project(cultivo_sim LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Dependencias ────────────────────────────────────────────────────────────
# SDL2 via Homebrew no Mac: brew install sdl2
find_package(SDL2 REQUIRED)

# LVGL 9.2.2 via FetchContent — mesmo tag que platformio.ini usa
# FETCHCONTENT_QUIET=OFF faz o git clone mostrar progresso (LVGL ~30MB).
# GIT_SHALLOW=TRUE pega so o tag especifico (muito mais rapido que clone full).
include(FetchContent)
set(FETCHCONTENT_QUIET OFF)
FetchContent_Declare(
    lvgl
    GIT_REPOSITORY https://github.com/lvgl/lvgl.git
    GIT_TAG v9.2.2
    GIT_SHALLOW TRUE
    GIT_PROGRESS TRUE
)

# Aponta o LVGL pro nosso lv_conf.h antes de materializar o subdir.
# LV_CONF_PATH e' consumido pelo CMakeLists.txt do LVGL.
set(LV_CONF_PATH "${CMAKE_CURRENT_SOURCE_DIR}/lv_conf.h" CACHE STRING "" FORCE)
set(LV_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LV_BUILD_DEMOS OFF CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(lvgl)

# Faz lv_conf.h ficar acessivel via <lv_conf.h> em qualquer .c do projeto
add_compile_definitions(LV_CONF_INCLUDE_SIMPLE)

# ── Executavel do simulador ─────────────────────────────────────────────────
add_executable(cultivo_sim
    sim_main.cpp
    cultivo_ui.cpp
    ../src/cultivo_icons.c
    ../src/fonts/manrope_bold_18.c
    ../src/fonts/manrope_bold_24.c
    ../src/fonts/manrope_bold_28.c
    ../src/fonts/manrope_bold_40.c
    ../src/fonts/manrope_sb_12.c
    ../src/fonts/manrope_sb_14.c
    ../src/fonts/manrope_sb_18.c
)

target_include_directories(cultivo_sim PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../src
    ${CMAKE_CURRENT_SOURCE_DIR}/../src/fonts
    ${SDL2_INCLUDE_DIRS}
)

target_link_libraries(cultivo_sim PRIVATE
    lvgl
    ${SDL2_LIBRARIES}
)

# macOS: SDL2 via brew entrega include paths em /opt/homebrew ou /usr/local
if(APPLE)
    target_link_libraries(cultivo_sim PRIVATE "-framework Cocoa")
endif()
