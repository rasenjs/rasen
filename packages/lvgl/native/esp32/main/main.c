/**
 * @file main.c
 * @brief Rasen LVGL for ESP32
 * 
 * Main entry point for running Rasen applications on ESP32 with LVGL.
 * Uses shared code from common/ directory.
 */

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"

// LVGL
#include "lvgl.h"

// QuickJS
#include "quickjs/quickjs.h"

// Rasen common code
#include "qjs_rasen.h"

static const char *TAG = "rasen-lvgl";

// ============ Display Configuration ============
// Adjust these for your specific display module

#define DISPLAY_WIDTH  320
#define DISPLAY_HEIGHT 240
#define LVGL_TICK_PERIOD_MS 2

// ============ Tick Timer ============

static void lvgl_tick_task(void *arg) {
    lv_tick_inc(LVGL_TICK_PERIOD_MS);
}

// ============ Display Driver ============

static lv_disp_draw_buf_t draw_buf;
static lv_color_t *buf1 = NULL;
static lv_disp_drv_t disp_drv;

// Placeholder flush callback - replace with your display driver
static void disp_flush_cb(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *color_p) {
    // TODO: Implement actual display flush for your hardware
    // Example for SPI display:
    // esp_lcd_panel_draw_bitmap(panel_handle, area->x1, area->y1, 
    //                           area->x2 + 1, area->y2 + 1, color_p);
    
    lv_disp_flush_ready(drv);
}

// ============ Input Driver ============

// Touch input state
static bool touch_pressed = false;
static int16_t touch_x = 0, touch_y = 0;

static void touch_read_cb(lv_indev_drv_t *drv, lv_indev_data_t *data) {
    // TODO: Read from your touch controller (CST816, GT911, etc.)
    data->point.x = touch_x;
    data->point.y = touch_y;
    data->state = touch_pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

// ============ LVGL Initialization ============

static void lvgl_init_display(void) {
    ESP_LOGI(TAG, "Initializing LVGL...");
    
    lv_init();
    
    // Allocate draw buffers
    buf1 = heap_caps_malloc(DISPLAY_WIDTH * 40 * sizeof(lv_color_t), MALLOC_CAP_DMA);
    if (!buf1) {
        ESP_LOGE(TAG, "Failed to allocate LVGL buffer");
        return;
    }
    
    lv_disp_draw_buf_init(&draw_buf, buf1, NULL, DISPLAY_WIDTH * 40);
    
    // Initialize display driver
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res = DISPLAY_WIDTH;
    disp_drv.ver_res = DISPLAY_HEIGHT;
    disp_drv.flush_cb = disp_flush_cb;
    disp_drv.draw_buf = &draw_buf;
    lv_disp_drv_register(&disp_drv);
    
    // Initialize input driver
    static lv_indev_drv_t indev_drv;
    lv_indev_drv_init(&indev_drv);
    indev_drv.type = LV_INDEV_TYPE_POINTER;
    indev_drv.read_cb = touch_read_cb;
    lv_indev_drv_register(&indev_drv);
    
    // Create tick timer
    const esp_timer_create_args_t tick_timer_args = {
        .callback = &lvgl_tick_task,
        .name = "lvgl_tick"
    };
    esp_timer_handle_t tick_timer = NULL;
    ESP_ERROR_CHECK(esp_timer_create(&tick_timer_args, &tick_timer));
    ESP_ERROR_CHECK(esp_timer_start_periodic(tick_timer, LVGL_TICK_PERIOD_MS * 1000));
    
    ESP_LOGI(TAG, "LVGL initialized");
}

// ============ QuickJS Runtime ============

static JSRuntime *js_rt = NULL;
static JSContext *js_ctx = NULL;

static void quickjs_init(void) {
    ESP_LOGI(TAG, "Initializing QuickJS...");
    
    js_rt = JS_NewRuntime();
    if (!js_rt) {
        ESP_LOGE(TAG, "Failed to create JS runtime");
        return;
    }
    
    // Limit memory for embedded use
    JS_SetMemoryLimit(js_rt, 256 * 1024);  // 256KB
    
    js_ctx = JS_NewContext(js_rt);
    if (!js_ctx) {
        ESP_LOGE(TAG, "Failed to create JS context");
        return;
    }
    
    // Initialize Rasen bindings (from common/)
    if (qjs_rasen_init(js_ctx) != 0) {
        ESP_LOGE(TAG, "Failed to init Rasen bindings");
        return;
    }
    
    ESP_LOGI(TAG, "QuickJS initialized");
}

// ============ Example Application ============

// Simple counter app (normally loaded from filesystem or OTA)
static const char *example_app = 
"const { ref, div, label, button, run } = __modules['@rasenjs/lvgl'];\n"
"\n"
"function App() {\n"
"    const count = ref(0);\n"
"    \n"
"    return div({\n"
"        class: 'flex flex-col items-center justify-center size-full bg-gray-900 gap-4',\n"
"        children: [\n"
"            label({\n"
"                class: 'text-2xl text-white',\n"
"                children: function() { return 'Count: ' + count.value; }\n"
"            }),\n"
"            div({\n"
"                class: 'flex flex-row gap-2',\n"
"                children: [\n"
"                    button({\n"
"                        class: 'px-4 py-2 bg-blue-500 rounded-lg',\n"
"                        onClick: function() { count.value--; },\n"
"                        children: [label({ class: 'text-white', children: '-' })]\n"
"                    }),\n"
"                    button({\n"
"                        class: 'px-4 py-2 bg-blue-500 rounded-lg',\n"
"                        onClick: function() { count.value++; },\n"
"                        children: [label({ class: 'text-white', children: '+' })]\n"
"                    })\n"
"                ]\n"
"            })\n"
"        ]\n"
"    });\n"
"}\n"
"\n"
"run(App);\n";

// ============ Main Task ============

static void main_task(void *pvParameters) {
    // Initialize LVGL
    lvgl_init_display();
    
    // Initialize QuickJS
    quickjs_init();
    
    // Render the app
    if (js_ctx) {
        ESP_LOGI(TAG, "Rendering application...");
        lv_obj_t *screen = lv_scr_act();
        qjs_rasen_render(js_ctx, example_app, screen);
    }
    
    // Main loop
    while (1) {
        // Process JS events
        if (js_ctx) {
            qjs_rasen_process_events(js_ctx);
        }
        
        // Run LVGL handler
        lv_timer_handler();
        
        // Small delay
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// ============ Entry Point ============

void app_main(void) {
    ESP_LOGI(TAG, "=================================");
    ESP_LOGI(TAG, "  Rasen LVGL for ESP32");
    ESP_LOGI(TAG, "  QuickJS + LVGL + Tailwind");
    ESP_LOGI(TAG, "=================================");
    ESP_LOGI(TAG, "Free heap: %lu bytes", esp_get_free_heap_size());
    
    // Create main task with sufficient stack
    xTaskCreate(main_task, "main", 8192, NULL, 5, NULL);
}
