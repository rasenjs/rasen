# Main component for Rasen LVGL ESP32

# Register the main component with its sources
idf_component_register(
    SRCS 
        "main.c"
        "../../common/qjs_rasen.c"
        "../../common/tw_parser.c"
    INCLUDE_DIRS 
        "."
        "../../common"
    REQUIRES 
        lvgl
        esp_lcd
        esp_timer
        driver
)

# QuickJS sources (embedded in main component)
target_sources(${COMPONENT_LIB} PRIVATE
    "quickjs/quickjs.c"
    "quickjs/libregexp.c"
    "quickjs/libunicode.c"
    "quickjs/cutils.c"
)

target_include_directories(${COMPONENT_LIB} PRIVATE
    "quickjs"
)

# QuickJS compile definitions for embedded
target_compile_definitions(${COMPONENT_LIB} PRIVATE
    CONFIG_VERSION="2024-01-13"
    CONFIG_BIGNUM=0
    EMSCRIPTEN
    __linux__=1
)
