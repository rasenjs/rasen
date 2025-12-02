/**
 * @file qjs_rasen.h
 * @brief Rasen LVGL binding for QuickJS
 * 
 * This file provides the JavaScript API for LVGL components.
 * Shared between simulator and ESP32 builds.
 */

#ifndef QJS_RASEN_H
#define QJS_RASEN_H

#include "quickjs.h"
#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

// ============ Initialization ============

/**
 * Initialize the Rasen LVGL module in QuickJS
 * Call this after creating the JS runtime and context
 */
int qjs_rasen_init(JSContext *ctx);

/**
 * Cleanup Rasen module
 */
void qjs_rasen_cleanup(JSContext *ctx);

// ============ Rendering ============

/**
 * Execute JavaScript and render the UI
 * @param ctx QuickJS context
 * @param script JavaScript source code
 * @param parent LVGL parent object (usually lv_scr_act())
 * @return 0 on success, -1 on error
 */
int qjs_rasen_render(JSContext *ctx, const char *script, lv_obj_t *parent);

/**
 * Re-render the UI (called after state changes)
 * @param ctx QuickJS context  
 * @param parent LVGL parent object
 * @return 0 on success, -1 on error
 */
int qjs_rasen_rerender(JSContext *ctx, lv_obj_t *parent);

// ============ Event Handling ============

/**
 * Process pending JavaScript events
 * Call this in the main loop
 */
void qjs_rasen_process_events(JSContext *ctx);

// ============ Tailwind Parser ============

/**
 * Parsed Tailwind styles
 */
typedef struct {
    // Layout
    bool flex;
    lv_flex_flow_t flex_flow;
    lv_flex_align_t justify_content;
    lv_flex_align_t align_items;
    
    // Size (LV_SIZE_CONTENT = -1, percentage = -2 to -101)
    lv_coord_t width;
    lv_coord_t height;
    
    // Padding
    lv_coord_t pad_top;
    lv_coord_t pad_bottom;
    lv_coord_t pad_left;
    lv_coord_t pad_right;
    lv_coord_t pad_row;
    lv_coord_t pad_column;
    
    // Background
    lv_color_t bg_color;
    bool has_bg_color;
    lv_opa_t bg_opa;
    
    // Border
    lv_coord_t border_width;
    lv_color_t border_color;
    bool has_border_color;
    lv_coord_t border_radius;
    
    // Text
    lv_color_t text_color;
    bool has_text_color;
    const lv_font_t *font;
    
} tw_styles_t;

/**
 * Parse Tailwind class string into LVGL styles
 * @param class_str Space-separated Tailwind classes
 * @param styles Output structure
 */
void tw_parse(const char *class_str, tw_styles_t *styles);

/**
 * Apply parsed styles to an LVGL object
 * @param obj LVGL object
 * @param styles Parsed styles
 */
void tw_apply(lv_obj_t *obj, const tw_styles_t *styles);

#ifdef __cplusplus
}
#endif

#endif // QJS_RASEN_H
