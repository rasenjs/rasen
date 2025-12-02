cmake_minimum_required(VERSION 3.16)
project(rasen_lvgl_simulator C)

set(CMAKE_C_STANDARD 11)

# ============ SDL2 ============
if(WIN32)
    # Use bundled SDL2 in deps folder
    set(SDL2_DIR ${CMAKE_CURRENT_SOURCE_DIR}/deps/SDL2-2.28.5)
    set(SDL2_INCLUDE_DIRS ${SDL2_DIR}/include)
    if(CMAKE_SIZEOF_VOID_P EQUAL 8)
        set(SDL2_LIBRARIES ${SDL2_DIR}/lib/x64/SDL2.lib ${SDL2_DIR}/lib/x64/SDL2main.lib)
        set(SDL2_DLL ${SDL2_DIR}/lib/x64/SDL2.dll)
    else()
        set(SDL2_LIBRARIES ${SDL2_DIR}/lib/x86/SDL2.lib ${SDL2_DIR}/lib/x86/SDL2main.lib)
        set(SDL2_DLL ${SDL2_DIR}/lib/x86/SDL2.dll)
    endif()
else()
    find_package(SDL2 REQUIRED)
endif()

# ============ QuickJS-ng (MSVC compatible) ============
set(QJS_BUILD_LIBC OFF CACHE BOOL "" FORCE)
set(QJS_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
add_subdirectory(deps/quickjs EXCLUDE_FROM_ALL)

# ============ LVGL ============
# Set LV_CONF_PATH before adding LVGL
set(LV_CONF_BUILD_DISABLE_THORVG_INTERNAL ON)
set(LV_CONF_PATH ${CMAKE_CURRENT_SOURCE_DIR}/lv_conf.h CACHE STRING "" FORCE)

add_subdirectory(deps/lvgl)

# ============ Main Executable ============
set(SOURCES
    main.c
    ../common/qjs_rasen.c
    ../common/tw_parser.c
)

add_executable(rasen_simulator ${SOURCES})

target_include_directories(rasen_simulator PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../common
    ${CMAKE_CURRENT_SOURCE_DIR}/deps/lvgl
    ${CMAKE_CURRENT_SOURCE_DIR}/deps/quickjs
    ${SDL2_INCLUDE_DIRS}
)

target_link_libraries(rasen_simulator
    lvgl
    qjs
    ${SDL2_LIBRARIES}
)

target_compile_definitions(rasen_simulator PRIVATE
    LV_CONF_INCLUDE_SIMPLE
)

# Windows specific
if(WIN32)
    # Copy SDL2.dll to output directory
    if(SDL2_DLL)
        add_custom_command(TARGET rasen_simulator POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            ${SDL2_DLL}
            $<TARGET_FILE_DIR:rasen_simulator>
        )
    endif()
    
    # Console application (for debugging)
    set_target_properties(rasen_simulator PROPERTIES
        WIN32_EXECUTABLE FALSE
    )
endif()

# Copy examples
file(COPY ${CMAKE_CURRENT_SOURCE_DIR}/../examples DESTINATION ${CMAKE_BINARY_DIR})
