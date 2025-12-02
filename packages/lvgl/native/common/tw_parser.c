/**
 * @file tw_parser.c
 * @brief Tailwind CSS to LVGL style parser
 */

#include "qjs_rasen.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

// ============ Color Helpers ============

static lv_color_t hex_to_color(const char *hex) {
    // Skip # if present
    if (hex[0] == '#') hex++;
    
    unsigned int r, g, b;
    if (strlen(hex) == 6) {
        sscanf(hex, "%02x%02x%02x", &r, &g, &b);
    } else if (strlen(hex) == 3) {
        sscanf(hex, "%1x%1x%1x", &r, &g, &b);
        r *= 17; g *= 17; b *= 17;
    } else {
        return lv_color_black();
    }
    return lv_color_make(r, g, b);
}

// Tailwind color palette (500 variants)
static lv_color_t get_tw_color(const char *name) {
    if (strcmp(name, "white") == 0) return lv_color_white();
    if (strcmp(name, "black") == 0) return lv_color_black();
    if (strcmp(name, "red-500") == 0) return lv_color_make(239, 68, 68);
    if (strcmp(name, "orange-500") == 0) return lv_color_make(249, 115, 22);
    if (strcmp(name, "yellow-500") == 0) return lv_color_make(234, 179, 8);
    if (strcmp(name, "green-500") == 0) return lv_color_make(34, 197, 94);
    if (strcmp(name, "blue-500") == 0) return lv_color_make(59, 130, 246);
    if (strcmp(name, "purple-500") == 0) return lv_color_make(168, 85, 247);
    if (strcmp(name, "pink-500") == 0) return lv_color_make(236, 72, 153);
    if (strcmp(name, "gray-500") == 0) return lv_color_make(107, 114, 128);
    if (strcmp(name, "gray-800") == 0) return lv_color_make(31, 41, 55);
    if (strcmp(name, "gray-900") == 0) return lv_color_make(17, 24, 39);
    // Default
    return lv_color_black();
}

// ============ Parse Helpers ============

static int parse_number(const char *str) {
    return atoi(str);
}

// Parse arbitrary value like [#505050] or [200px]
static bool parse_arbitrary(const char *value, char *out, size_t out_size) {
    if (value[0] != '[') return false;
    
    const char *end = strchr(value, ']');
    if (!end) return false;
    
    size_t len = end - value - 1;
    if (len >= out_size) len = out_size - 1;
    
    strncpy(out, value + 1, len);
    out[len] = '\0';
    return true;
}

// Parse CSS length like "200px" or "10rem"
static lv_coord_t parse_length(const char *str) {
    int len = strlen(str);
    int value = atoi(str);
    
    if (len > 2 && strcmp(str + len - 2, "px") == 0) {
        return value;
    }
    if (len > 3 && strcmp(str + len - 3, "rem") == 0) {
        return value * 16; // 1rem = 16px
    }
    if (len > 1 && str[len - 1] == '%') {
        return LV_PCT(value);
    }
    return value;
}

// ============ Main Parser ============

void tw_parse(const char *class_str, tw_styles_t *styles) {
    // Initialize defaults
    memset(styles, 0, sizeof(tw_styles_t));
    styles->width = LV_SIZE_CONTENT;
    styles->height = LV_SIZE_CONTENT;
    styles->bg_opa = LV_OPA_COVER;
    styles->flex_flow = LV_FLEX_FLOW_ROW;
    styles->justify_content = LV_FLEX_ALIGN_START;
    styles->align_items = LV_FLEX_ALIGN_START;
    
    if (!class_str || !class_str[0]) return;
    
    // Make a copy to tokenize
    char *copy = strdup(class_str);
    char *token = strtok(copy, " ");
    
    while (token) {
        char arb_value[64];
        
        // ===== Flex Layout =====
        if (strcmp(token, "flex") == 0) {
            styles->flex = true;
        }
        else if (strcmp(token, "flex-row") == 0) {
            styles->flex = true;
            styles->flex_flow = LV_FLEX_FLOW_ROW;
        }
        else if (strcmp(token, "flex-col") == 0) {
            styles->flex = true;
            styles->flex_flow = LV_FLEX_FLOW_COLUMN;
        }
        else if (strcmp(token, "flex-wrap") == 0) {
            if (styles->flex_flow == LV_FLEX_FLOW_ROW)
                styles->flex_flow = LV_FLEX_FLOW_ROW_WRAP;
            else if (styles->flex_flow == LV_FLEX_FLOW_COLUMN)
                styles->flex_flow = LV_FLEX_FLOW_COLUMN_WRAP;
        }
        
        // ===== Justify Content =====
        else if (strcmp(token, "justify-start") == 0) {
            styles->justify_content = LV_FLEX_ALIGN_START;
        }
        else if (strcmp(token, "justify-end") == 0) {
            styles->justify_content = LV_FLEX_ALIGN_END;
        }
        else if (strcmp(token, "justify-center") == 0) {
            styles->justify_content = LV_FLEX_ALIGN_CENTER;
        }
        else if (strcmp(token, "justify-between") == 0) {
            styles->justify_content = LV_FLEX_ALIGN_SPACE_BETWEEN;
        }
        else if (strcmp(token, "justify-around") == 0) {
            styles->justify_content = LV_FLEX_ALIGN_SPACE_AROUND;
        }
        else if (strcmp(token, "justify-evenly") == 0) {
            styles->justify_content = LV_FLEX_ALIGN_SPACE_EVENLY;
        }
        
        // ===== Align Items =====
        else if (strcmp(token, "items-start") == 0) {
            styles->align_items = LV_FLEX_ALIGN_START;
        }
        else if (strcmp(token, "items-end") == 0) {
            styles->align_items = LV_FLEX_ALIGN_END;
        }
        else if (strcmp(token, "items-center") == 0) {
            styles->align_items = LV_FLEX_ALIGN_CENTER;
        }
        
        // ===== Sizing =====
        else if (strcmp(token, "size-full") == 0) {
            styles->width = LV_PCT(100);
            styles->height = LV_PCT(100);
        }
        else if (strcmp(token, "w-full") == 0) {
            styles->width = LV_PCT(100);
        }
        else if (strcmp(token, "h-full") == 0) {
            styles->height = LV_PCT(100);
        }
        else if (strncmp(token, "w-[", 3) == 0) {
            if (parse_arbitrary(token + 2, arb_value, sizeof(arb_value))) {
                styles->width = parse_length(arb_value);
            }
        }
        else if (strncmp(token, "h-[", 3) == 0) {
            if (parse_arbitrary(token + 2, arb_value, sizeof(arb_value))) {
                styles->height = parse_length(arb_value);
            }
        }
        else if (strncmp(token, "size-", 5) == 0) {
            if (token[5] == '[') {
                if (parse_arbitrary(token + 5, arb_value, sizeof(arb_value))) {
                    lv_coord_t size = parse_length(arb_value);
                    styles->width = size;
                    styles->height = size;
                }
            } else {
                int n = parse_number(token + 5);
                styles->width = n * 4;
                styles->height = n * 4;
            }
        }
        else if (strncmp(token, "w-", 2) == 0) {
            int n = parse_number(token + 2);
            styles->width = n * 4;
        }
        else if (strncmp(token, "h-", 2) == 0) {
            int n = parse_number(token + 2);
            styles->height = n * 4;
        }
        
        // ===== Gap =====
        else if (strncmp(token, "gap-", 4) == 0) {
            if (token[4] == '[') {
                if (parse_arbitrary(token + 4, arb_value, sizeof(arb_value))) {
                    lv_coord_t gap = parse_length(arb_value);
                    styles->pad_row = gap;
                    styles->pad_column = gap;
                }
            } else {
                int n = parse_number(token + 4);
                styles->pad_row = n * 4;
                styles->pad_column = n * 4;
            }
        }
        
        // ===== Padding =====
        else if (strncmp(token, "p-", 2) == 0 && token[2] != '[') {
            int n = parse_number(token + 2);
            lv_coord_t p = n * 4;
            styles->pad_top = p;
            styles->pad_bottom = p;
            styles->pad_left = p;
            styles->pad_right = p;
        }
        else if (strncmp(token, "p-[", 3) == 0) {
            if (parse_arbitrary(token + 2, arb_value, sizeof(arb_value))) {
                lv_coord_t p = parse_length(arb_value);
                styles->pad_top = p;
                styles->pad_bottom = p;
                styles->pad_left = p;
                styles->pad_right = p;
            }
        }
        else if (strncmp(token, "px-", 3) == 0) {
            int n = parse_number(token + 3);
            styles->pad_left = n * 4;
            styles->pad_right = n * 4;
        }
        else if (strncmp(token, "py-", 3) == 0) {
            int n = parse_number(token + 3);
            styles->pad_top = n * 4;
            styles->pad_bottom = n * 4;
        }
        else if (strncmp(token, "pt-", 3) == 0) {
            styles->pad_top = parse_number(token + 3) * 4;
        }
        else if (strncmp(token, "pb-", 3) == 0) {
            styles->pad_bottom = parse_number(token + 3) * 4;
        }
        else if (strncmp(token, "pl-", 3) == 0) {
            styles->pad_left = parse_number(token + 3) * 4;
        }
        else if (strncmp(token, "pr-", 3) == 0) {
            styles->pad_right = parse_number(token + 3) * 4;
        }
        
        // ===== Background Color =====
        else if (strncmp(token, "bg-[", 4) == 0) {
            if (parse_arbitrary(token + 3, arb_value, sizeof(arb_value))) {
                styles->bg_color = hex_to_color(arb_value);
                styles->has_bg_color = true;
            }
        }
        else if (strncmp(token, "bg-", 3) == 0) {
            styles->bg_color = get_tw_color(token + 3);
            styles->has_bg_color = true;
        }
        
        // ===== Text Color =====
        else if (strncmp(token, "text-[", 6) == 0) {
            if (parse_arbitrary(token + 5, arb_value, sizeof(arb_value))) {
                if (arb_value[0] == '#') {
                    styles->text_color = hex_to_color(arb_value);
                    styles->has_text_color = true;
                }
            }
        }
        else if (strcmp(token, "text-white") == 0) {
            styles->text_color = lv_color_white();
            styles->has_text_color = true;
        }
        else if (strcmp(token, "text-black") == 0) {
            styles->text_color = lv_color_black();
            styles->has_text_color = true;
        }
        else if (strcmp(token, "text-xs") == 0) {
            styles->font = &lv_font_montserrat_12;
        }
        else if (strcmp(token, "text-sm") == 0) {
            styles->font = &lv_font_montserrat_14;
        }
        else if (strcmp(token, "text-base") == 0) {
            styles->font = &lv_font_montserrat_16;
        }
        else if (strcmp(token, "text-lg") == 0) {
            styles->font = &lv_font_montserrat_18;
        }
        else if (strcmp(token, "text-xl") == 0) {
            styles->font = &lv_font_montserrat_20;
        }
        else if (strcmp(token, "text-2xl") == 0) {
            styles->font = &lv_font_montserrat_24;
        }
        else if (strcmp(token, "text-3xl") == 0) {
            styles->font = &lv_font_montserrat_28;
        }
        else if (strcmp(token, "text-4xl") == 0) {
            styles->font = &lv_font_montserrat_32;
        }
        
        // ===== Border =====
        else if (strcmp(token, "border") == 0) {
            styles->border_width = 1;
        }
        else if (strncmp(token, "border-", 7) == 0) {
            char c = token[7];
            if (c >= '0' && c <= '9') {
                styles->border_width = parse_number(token + 7);
            } else if (token[7] == '[') {
                if (parse_arbitrary(token + 7, arb_value, sizeof(arb_value))) {
                    if (arb_value[0] == '#') {
                        styles->border_color = hex_to_color(arb_value);
                        styles->has_border_color = true;
                    }
                }
            } else {
                styles->border_color = get_tw_color(token + 7);
                styles->has_border_color = true;
            }
        }
        
        // ===== Border Radius =====
        else if (strcmp(token, "rounded-none") == 0) {
            styles->border_radius = 0;
        }
        else if (strcmp(token, "rounded-sm") == 0) {
            styles->border_radius = 2;
        }
        else if (strcmp(token, "rounded") == 0) {
            styles->border_radius = 4;
        }
        else if (strcmp(token, "rounded-md") == 0) {
            styles->border_radius = 6;
        }
        else if (strcmp(token, "rounded-lg") == 0) {
            styles->border_radius = 8;
        }
        else if (strcmp(token, "rounded-xl") == 0) {
            styles->border_radius = 12;
        }
        else if (strcmp(token, "rounded-2xl") == 0) {
            styles->border_radius = 16;
        }
        else if (strcmp(token, "rounded-3xl") == 0) {
            styles->border_radius = 24;
        }
        else if (strcmp(token, "rounded-full") == 0) {
            styles->border_radius = LV_RADIUS_CIRCLE;
        }
        
        token = strtok(NULL, " ");
    }
    
    free(copy);
}

// ============ Apply Styles to LVGL Object ============

void tw_apply(lv_obj_t *obj, const tw_styles_t *styles) {
    // Flex layout
    if (styles->flex) {
        lv_obj_set_layout(obj, LV_LAYOUT_FLEX);
        lv_obj_set_flex_flow(obj, styles->flex_flow);
        lv_obj_set_flex_align(obj, styles->justify_content, styles->align_items, LV_FLEX_ALIGN_START);
    }
    
    // Size
    if (styles->width != LV_SIZE_CONTENT) {
        lv_obj_set_width(obj, styles->width);
    }
    if (styles->height != LV_SIZE_CONTENT) {
        lv_obj_set_height(obj, styles->height);
    }
    
    // Padding
    if (styles->pad_top) lv_obj_set_style_pad_top(obj, styles->pad_top, 0);
    if (styles->pad_bottom) lv_obj_set_style_pad_bottom(obj, styles->pad_bottom, 0);
    if (styles->pad_left) lv_obj_set_style_pad_left(obj, styles->pad_left, 0);
    if (styles->pad_right) lv_obj_set_style_pad_right(obj, styles->pad_right, 0);
    if (styles->pad_row) lv_obj_set_style_pad_row(obj, styles->pad_row, 0);
    if (styles->pad_column) lv_obj_set_style_pad_column(obj, styles->pad_column, 0);
    
    // Background
    if (styles->has_bg_color) {
        lv_obj_set_style_bg_color(obj, styles->bg_color, 0);
        lv_obj_set_style_bg_opa(obj, styles->bg_opa, 0);
    }
    
    // Border
    if (styles->border_width) {
        lv_obj_set_style_border_width(obj, styles->border_width, 0);
    }
    if (styles->has_border_color) {
        lv_obj_set_style_border_color(obj, styles->border_color, 0);
    }
    if (styles->border_radius) {
        lv_obj_set_style_radius(obj, styles->border_radius, 0);
    }
    
    // Text
    if (styles->has_text_color) {
        lv_obj_set_style_text_color(obj, styles->text_color, 0);
    }
    if (styles->font) {
        lv_obj_set_style_text_font(obj, styles->font, 0);
    }
}
