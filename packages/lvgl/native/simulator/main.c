/**
 * @file main.c
 * @brief Rasen LVGL Simulator using SDL2
 * 
 * This provides a desktop preview of LVGL UI for development.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// SDL2 headers
#include "SDL.h"

// LVGL and QuickJS
#include "lvgl.h"
#include "quickjs.h"

// Rasen common code
#include "../common/qjs_rasen.h"

// ============ Configuration ============

#define DISPLAY_WIDTH  320
#define DISPLAY_HEIGHT 240
#define WINDOW_SCALE   2    // 2x scale for easier viewing on desktop

// ============ SDL LVGL Driver ============

static SDL_Window *window = NULL;
static SDL_Renderer *renderer = NULL;
static SDL_Texture *texture = NULL;
static uint32_t *framebuffer = NULL;

// Flush callback for LVGL
static void sdl_flush_cb(lv_disp_drv_t *disp_drv, const lv_area_t *area, lv_color_t *color_p) {
    int32_t x, y;
    
    for (y = area->y1; y <= area->y2; y++) {
        for (x = area->x1; x <= area->x2; x++) {
            uint32_t color32 = lv_color_to32(*color_p);
            framebuffer[y * DISPLAY_WIDTH + x] = color32;
            color_p++;
        }
    }
    
    lv_disp_flush_ready(disp_drv);
}

// Input callback for LVGL
static bool mouse_pressed = false;
static int16_t mouse_x = 0, mouse_y = 0;

static void sdl_input_read_cb(lv_indev_drv_t *drv, lv_indev_data_t *data) {
    data->point.x = mouse_x / WINDOW_SCALE;
    data->point.y = mouse_y / WINDOW_SCALE;
    data->state = mouse_pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

// ============ SDL Initialization ============

static int sdl_init(void) {
    if (SDL_Init(SDL_INIT_VIDEO) < 0) {
        printf("SDL init failed: %s\n", SDL_GetError());
        return -1;
    }
    
    window = SDL_CreateWindow(
        "Rasen LVGL Simulator",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        DISPLAY_WIDTH * WINDOW_SCALE,
        DISPLAY_HEIGHT * WINDOW_SCALE,
        SDL_WINDOW_SHOWN
    );
    
    if (!window) {
        printf("Window creation failed: %s\n", SDL_GetError());
        return -1;
    }
    
    renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    if (!renderer) {
        printf("Renderer creation failed: %s\n", SDL_GetError());
        return -1;
    }
    
    texture = SDL_CreateTexture(
        renderer,
        SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING,
        DISPLAY_WIDTH,
        DISPLAY_HEIGHT
    );
    
    if (!texture) {
        printf("Texture creation failed: %s\n", SDL_GetError());
        return -1;
    }
    
    framebuffer = (uint32_t *)malloc(DISPLAY_WIDTH * DISPLAY_HEIGHT * sizeof(uint32_t));
    if (!framebuffer) {
        printf("Framebuffer allocation failed\n");
        return -1;
    }
    
    memset(framebuffer, 0, DISPLAY_WIDTH * DISPLAY_HEIGHT * sizeof(uint32_t));
    
    return 0;
}

static void sdl_cleanup(void) {
    if (framebuffer) free(framebuffer);
    if (texture) SDL_DestroyTexture(texture);
    if (renderer) SDL_DestroyRenderer(renderer);
    if (window) SDL_DestroyWindow(window);
    SDL_Quit();
}

// ============ LVGL Initialization ============

static lv_disp_draw_buf_t draw_buf;
static lv_color_t buf1[DISPLAY_WIDTH * 10];  // Partial buffer
static lv_disp_drv_t disp_drv;
static lv_indev_drv_t indev_drv;

static void lvgl_init(void) {
    lv_init();
    
    // Initialize display buffer
    lv_disp_draw_buf_init(&draw_buf, buf1, NULL, DISPLAY_WIDTH * 10);
    
    // Initialize display driver
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res = DISPLAY_WIDTH;
    disp_drv.ver_res = DISPLAY_HEIGHT;
    disp_drv.flush_cb = sdl_flush_cb;
    disp_drv.draw_buf = &draw_buf;
    lv_disp_drv_register(&disp_drv);
    
    // Initialize input driver
    lv_indev_drv_init(&indev_drv);
    indev_drv.type = LV_INDEV_TYPE_POINTER;
    indev_drv.read_cb = sdl_input_read_cb;
    lv_indev_drv_register(&indev_drv);
}

// ============ File Loading ============

static char *load_file(const char *filename) {
    FILE *f = fopen(filename, "rb");
    if (!f) {
        printf("Cannot open file: %s\n", filename);
        return NULL;
    }
    
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    
    char *content = (char *)malloc(size + 1);
    if (!content) {
        fclose(f);
        return NULL;
    }
    
    fread(content, 1, size, f);
    content[size] = '\0';
    fclose(f);
    
    return content;
}

// ============ QuickJS Initialization ============

static JSRuntime *js_rt = NULL;
static JSContext *js_ctx = NULL;

static int quickjs_init(void) {
    js_rt = JS_NewRuntime();
    if (!js_rt) {
        printf("Failed to create JS runtime\n");
        return -1;
    }
    
    js_ctx = JS_NewContext(js_rt);
    if (!js_ctx) {
        printf("Failed to create JS context\n");
        return -1;
    }
    
    // Initialize Rasen bindings
    if (qjs_rasen_init(js_ctx) != 0) {
        printf("Failed to init Rasen bindings\n");
        return -1;
    }
    
    return 0;
}

static void quickjs_cleanup(void) {
    if (js_ctx) {
        qjs_rasen_cleanup(js_ctx);
        JS_FreeContext(js_ctx);
    }
    if (js_rt) {
        JS_FreeRuntime(js_rt);
    }
}

// ============ Main ============

static void print_usage(const char *prog) {
    printf("Rasen LVGL Simulator\n\n");
    printf("Usage: %s <script.js>\n\n", prog);
    printf("Example scripts:\n");
    printf("  Counter app:  %s examples/counter.js\n", prog);
    printf("  Hello world:  %s examples/hello.js\n", prog);
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }
    
    const char *script_file = argv[1];
    
    // Load script
    char *script = load_file(script_file);
    if (!script) {
        return 1;
    }
    
    printf("Loading: %s\n", script_file);
    
    // Initialize SDL
    if (sdl_init() != 0) {
        free(script);
        return 1;
    }
    
    // Initialize LVGL
    lvgl_init();
    
    // Initialize QuickJS
    if (quickjs_init() != 0) {
        sdl_cleanup();
        free(script);
        return 1;
    }
    
    // Render the script
    lv_obj_t *screen = lv_scr_act();
    if (qjs_rasen_render(js_ctx, script, screen) != 0) {
        printf("Render failed\n");
    }
    
    free(script);
    
    // Main loop
    printf("Simulator running. Close window to exit.\n");
    
    bool running = true;
    uint32_t last_tick = SDL_GetTicks();
    
    while (running) {
        // Handle SDL events
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            switch (event.type) {
                case SDL_QUIT:
                    running = false;
                    break;
                    
                case SDL_MOUSEMOTION:
                    mouse_x = event.motion.x;
                    mouse_y = event.motion.y;
                    break;
                    
                case SDL_MOUSEBUTTONDOWN:
                    if (event.button.button == SDL_BUTTON_LEFT) {
                        mouse_pressed = true;
                    }
                    break;
                    
                case SDL_MOUSEBUTTONUP:
                    if (event.button.button == SDL_BUTTON_LEFT) {
                        mouse_pressed = false;
                    }
                    break;
                    
                case SDL_KEYDOWN:
                    if (event.key.keysym.sym == SDLK_r) {
                        // Reload on 'R' key
                        printf("Reloading...\n");
                        qjs_rasen_rerender(js_ctx, screen);
                    }
                    break;
            }
        }
        
        // Update LVGL tick
        uint32_t current_tick = SDL_GetTicks();
        lv_tick_inc(current_tick - last_tick);
        last_tick = current_tick;
        
        // Process JS events
        qjs_rasen_process_events(js_ctx);
        
        // Run LVGL task handler
        lv_timer_handler();
        
        // Update SDL texture
        SDL_UpdateTexture(texture, NULL, framebuffer, DISPLAY_WIDTH * sizeof(uint32_t));
        SDL_RenderClear(renderer);
        SDL_RenderCopy(renderer, texture, NULL, NULL);
        SDL_RenderPresent(renderer);
        
        // Small delay
        SDL_Delay(5);
    }
    
    // Cleanup
    quickjs_cleanup();
    sdl_cleanup();
    
    printf("Simulator closed.\n");
    return 0;
}
