//! Tailwind CSS class parser
//! Parses Tailwind-style class strings and converts them to GPUI style properties

use gpui::*;

/// Parsed style properties from Tailwind classes
#[derive(Default, Debug, Clone)]
pub struct ParsedStyles {
    // Display & Flex
    pub display: Option<Display>,
    pub flex_direction: Option<FlexDirection>,
    pub justify_content: Option<JustifyContent>,
    pub align_items: Option<AlignItems>,
    pub flex_wrap: Option<FlexWrap>,
    pub flex_grow: Option<f32>,
    pub flex_shrink: Option<f32>,
    
    // Sizing
    pub width: Option<Length>,
    pub height: Option<Length>,
    pub min_width: Option<Length>,
    pub min_height: Option<Length>,
    pub max_width: Option<Length>,
    pub max_height: Option<Length>,
    
    // Spacing
    pub padding: Option<Edges<Length>>,
    pub margin: Option<Edges<Length>>,
    pub gap: Option<Length>,
    pub gap_x: Option<Length>,
    pub gap_y: Option<Length>,
    
    // Background & Border
    pub background: Option<Hsla>,
    pub border_color: Option<Hsla>,
    pub border_width: Option<Pixels>,
    pub border_radius: Option<Pixels>,
    
    // Text
    pub text_color: Option<Hsla>,
    pub font_size: Option<Pixels>,
    pub font_weight: Option<FontWeight>,
    
    // Effects
    pub shadow: Option<BoxShadow>,
    pub opacity: Option<f32>,
    pub visibility: Option<Visibility>,
}

/// Parse a Tailwind class string into style properties
pub fn parse(class_string: &str) -> ParsedStyles {
    let mut styles = ParsedStyles::default();
    
    for class in class_string.split_whitespace() {
        parse_class(class, &mut styles);
    }
    
    styles
}

fn parse_class(class: &str, styles: &mut ParsedStyles) {
    // Handle arbitrary values like bg-[#505050] or size-[500px]
    if let Some((prefix, value)) = parse_arbitrary(class) {
        apply_arbitrary(prefix, value, styles);
        return;
    }
    
    match class {
        // Display
        "flex" => styles.display = Some(Display::Flex),
        "block" => styles.display = Some(Display::Block),
        "hidden" => styles.visibility = Some(Visibility::Hidden),
        "visible" => styles.visibility = Some(Visibility::Visible),
        
        // Flex Direction
        "flex-row" => styles.flex_direction = Some(FlexDirection::Row),
        "flex-col" => styles.flex_direction = Some(FlexDirection::Column),
        "flex-row-reverse" => styles.flex_direction = Some(FlexDirection::RowReverse),
        "flex-col-reverse" => styles.flex_direction = Some(FlexDirection::ColumnReverse),
        
        // Flex Wrap
        "flex-wrap" => styles.flex_wrap = Some(FlexWrap::Wrap),
        "flex-nowrap" => styles.flex_wrap = Some(FlexWrap::NoWrap),
        "flex-wrap-reverse" => styles.flex_wrap = Some(FlexWrap::WrapReverse),
        
        // Justify Content
        "justify-start" => styles.justify_content = Some(JustifyContent::FlexStart),
        "justify-end" => styles.justify_content = Some(JustifyContent::FlexEnd),
        "justify-center" => styles.justify_content = Some(JustifyContent::Center),
        "justify-between" => styles.justify_content = Some(JustifyContent::SpaceBetween),
        "justify-around" => styles.justify_content = Some(JustifyContent::SpaceAround),
        "justify-evenly" => styles.justify_content = Some(JustifyContent::SpaceEvenly),
        
        // Align Items
        "items-start" => styles.align_items = Some(AlignItems::FlexStart),
        "items-end" => styles.align_items = Some(AlignItems::FlexEnd),
        "items-center" => styles.align_items = Some(AlignItems::Center),
        "items-baseline" => styles.align_items = Some(AlignItems::Baseline),
        "items-stretch" => styles.align_items = Some(AlignItems::Stretch),
        
        // Flex Grow/Shrink
        "flex-1" => {
            styles.flex_grow = Some(1.0);
            styles.flex_shrink = Some(1.0);
        }
        "flex-auto" => {
            styles.flex_grow = Some(1.0);
            styles.flex_shrink = Some(1.0);
        }
        "flex-none" => {
            styles.flex_grow = Some(0.0);
            styles.flex_shrink = Some(0.0);
        }
        "grow" => styles.flex_grow = Some(1.0),
        "grow-0" => styles.flex_grow = Some(0.0),
        "shrink" => styles.flex_shrink = Some(1.0),
        "shrink-0" => styles.flex_shrink = Some(0.0),
        
        // Sizing
        "size-full" | "w-full" if class.starts_with("w-") => styles.width = Some(relative(1.0).into()),
        "size-full" | "h-full" if class.starts_with("h-") => styles.height = Some(relative(1.0).into()),
        "size-full" => {
            styles.width = Some(relative(1.0).into());
            styles.height = Some(relative(1.0).into());
        }
        
        // Colors (common Tailwind colors)
        "bg-white" => styles.background = Some(white()),
        "bg-black" => styles.background = Some(black()),
        "bg-red-500" => styles.background = Some(red()),
        "bg-green-500" => styles.background = Some(green()),
        "bg-blue-500" => styles.background = Some(blue()),
        "bg-yellow-500" => styles.background = Some(yellow()),
        
        "text-white" => styles.text_color = Some(white()),
        "text-black" => styles.text_color = Some(black()),
        
        // Border
        "border" => styles.border_width = Some(px(1.0)),
        "border-0" => styles.border_width = Some(px(0.0)),
        "border-2" => styles.border_width = Some(px(2.0)),
        "border-4" => styles.border_width = Some(px(4.0)),
        "border-8" => styles.border_width = Some(px(8.0)),
        
        "border-white" => styles.border_color = Some(white()),
        "border-black" => styles.border_color = Some(black()),
        
        // Border Radius
        "rounded-none" => styles.border_radius = Some(px(0.0)),
        "rounded-sm" => styles.border_radius = Some(px(2.0)),
        "rounded" => styles.border_radius = Some(px(4.0)),
        "rounded-md" => styles.border_radius = Some(px(6.0)),
        "rounded-lg" => styles.border_radius = Some(px(8.0)),
        "rounded-xl" => styles.border_radius = Some(px(12.0)),
        "rounded-2xl" => styles.border_radius = Some(px(16.0)),
        "rounded-3xl" => styles.border_radius = Some(px(24.0)),
        "rounded-full" => styles.border_radius = Some(px(9999.0)),
        
        // Text Size
        "text-xs" => styles.font_size = Some(px(12.0)),
        "text-sm" => styles.font_size = Some(px(14.0)),
        "text-base" => styles.font_size = Some(px(16.0)),
        "text-lg" => styles.font_size = Some(px(18.0)),
        "text-xl" => styles.font_size = Some(px(20.0)),
        "text-2xl" => styles.font_size = Some(px(24.0)),
        "text-3xl" => styles.font_size = Some(px(30.0)),
        "text-4xl" => styles.font_size = Some(px(36.0)),
        
        // Font Weight
        "font-thin" => styles.font_weight = Some(FontWeight::THIN),
        "font-light" => styles.font_weight = Some(FontWeight::LIGHT),
        "font-normal" => styles.font_weight = Some(FontWeight::NORMAL),
        "font-medium" => styles.font_weight = Some(FontWeight::MEDIUM),
        "font-semibold" => styles.font_weight = Some(FontWeight::SEMIBOLD),
        "font-bold" => styles.font_weight = Some(FontWeight::BOLD),
        "font-extrabold" => styles.font_weight = Some(FontWeight::EXTRA_BOLD),
        "font-black" => styles.font_weight = Some(FontWeight::BLACK),
        
        _ => {
            // Parse numbered classes like gap-4, p-2, m-4, size-8, etc.
            parse_numbered_class(class, styles);
        }
    }
}

/// Parse classes with numbers like gap-4, p-2, size-8
fn parse_numbered_class(class: &str, styles: &mut ParsedStyles) {
    let parts: Vec<&str> = class.rsplitn(2, '-').collect();
    if parts.len() != 2 {
        return;
    }
    
    let (num_str, prefix) = (parts[0], parts[1]);
    
    // Parse the number (Tailwind uses 4px per unit, e.g., gap-4 = 16px)
    let num: f32 = match num_str.parse() {
        Ok(n) => n,
        Err(_) => return,
    };
    
    let value = px(num * 4.0);
    let length: Length = value.into();
    
    match prefix {
        // Gap
        "gap" => styles.gap = Some(length),
        "gap-x" => styles.gap_x = Some(length),
        "gap-y" => styles.gap_y = Some(length),
        
        // Size
        "size" => {
            styles.width = Some(length.clone());
            styles.height = Some(length);
        }
        "w" => styles.width = Some(length),
        "h" => styles.height = Some(length),
        "min-w" => styles.min_width = Some(length),
        "min-h" => styles.min_height = Some(length),
        "max-w" => styles.max_width = Some(length),
        "max-h" => styles.max_height = Some(length),
        
        // Padding
        "p" => styles.padding = Some(Edges::all(length)),
        "px" => {
            let edges = styles.padding.get_or_insert(Edges::default());
            edges.left = length.clone();
            edges.right = length;
        }
        "py" => {
            let edges = styles.padding.get_or_insert(Edges::default());
            edges.top = length.clone();
            edges.bottom = length;
        }
        "pt" => styles.padding.get_or_insert(Edges::default()).top = length,
        "pb" => styles.padding.get_or_insert(Edges::default()).bottom = length,
        "pl" => styles.padding.get_or_insert(Edges::default()).left = length,
        "pr" => styles.padding.get_or_insert(Edges::default()).right = length,
        
        // Margin
        "m" => styles.margin = Some(Edges::all(length)),
        "mx" => {
            let edges = styles.margin.get_or_insert(Edges::default());
            edges.left = length.clone();
            edges.right = length;
        }
        "my" => {
            let edges = styles.margin.get_or_insert(Edges::default());
            edges.top = length.clone();
            edges.bottom = length;
        }
        "mt" => styles.margin.get_or_insert(Edges::default()).top = length,
        "mb" => styles.margin.get_or_insert(Edges::default()).bottom = length,
        "ml" => styles.margin.get_or_insert(Edges::default()).left = length,
        "mr" => styles.margin.get_or_insert(Edges::default()).right = length,
        
        _ => {}
    }
}

/// Parse arbitrary values like bg-[#505050] or size-[500px]
fn parse_arbitrary(class: &str) -> Option<(&str, &str)> {
    if let Some(bracket_start) = class.find('[') {
        if class.ends_with(']') {
            let prefix = &class[..bracket_start];
            let value = &class[bracket_start + 1..class.len() - 1];
            return Some((prefix, value));
        }
    }
    None
}

/// Apply arbitrary value to styles
fn apply_arbitrary(prefix: &str, value: &str, styles: &mut ParsedStyles) {
    match prefix {
        "bg-" => {
            if let Some(color) = parse_color(value) {
                styles.background = Some(color);
            }
        }
        "text-" => {
            if let Some(color) = parse_color(value) {
                styles.text_color = Some(color);
            }
        }
        "border-" => {
            if let Some(color) = parse_color(value) {
                styles.border_color = Some(color);
            }
        }
        "size-" => {
            if let Some(size) = parse_length(value) {
                styles.width = Some(size.clone());
                styles.height = Some(size);
            }
        }
        "w-" => {
            if let Some(size) = parse_length(value) {
                styles.width = Some(size);
            }
        }
        "h-" => {
            if let Some(size) = parse_length(value) {
                styles.height = Some(size);
            }
        }
        "gap-" => {
            if let Some(size) = parse_length(value) {
                styles.gap = Some(size);
            }
        }
        "p-" => {
            if let Some(size) = parse_length(value) {
                styles.padding = Some(Edges::all(size));
            }
        }
        "m-" => {
            if let Some(size) = parse_length(value) {
                styles.margin = Some(Edges::all(size));
            }
        }
        "rounded-" => {
            if let Some(size) = parse_length(value) {
                if let Length::Definite(DefiniteLength::Absolute(AbsoluteLength::Pixels(p))) = size {
                    styles.border_radius = Some(p);
                }
            }
        }
        _ => {}
    }
}

/// Parse color value like #505050, #333, or rgb(...)
fn parse_color(value: &str) -> Option<Hsla> {
    if value.starts_with('#') {
        let hex = value.trim_start_matches('#');
        
        // Handle 3-digit hex (#RGB -> #RRGGBB)
        if hex.len() == 3 {
            let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
            let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
            let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
            Some(rgb(((r as u32) << 16) | ((g as u32) << 8) | (b as u32)).into())
        }
        // Handle 6-digit hex (#RRGGBB)
        else if hex.len() >= 6 {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            Some(rgb(((r as u32) << 16) | ((g as u32) << 8) | (b as u32)).into())
        } else {
            None
        }
    } else {
        None
    }
}

/// Parse length value like 500px or 100%
fn parse_length(value: &str) -> Option<Length> {
    if value.ends_with("px") {
        let num: f32 = value.trim_end_matches("px").parse().ok()?;
        Some(px(num).into())
    } else if value.ends_with('%') {
        let num: f32 = value.trim_end_matches('%').parse().ok()?;
        Some(relative(num / 100.0).into())
    } else if let Ok(num) = value.parse::<f32>() {
        // Assume pixels if no unit
        Some(px(num).into())
    } else {
        None
    }
}

// Helper color functions
fn white() -> Hsla {
    rgb(0xffffff).into()
}

fn black() -> Hsla {
    rgb(0x000000).into()
}

fn red() -> Hsla {
    rgb(0xef4444).into()
}

fn green() -> Hsla {
    rgb(0x22c55e).into()
}

fn blue() -> Hsla {
    rgb(0x3b82f6).into()
}

fn yellow() -> Hsla {
    rgb(0xeab308).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_flex() {
        let styles = parse("flex flex-col gap-4 justify-center items-center");
        assert!(matches!(styles.display, Some(Display::Flex)));
        assert!(matches!(styles.flex_direction, Some(FlexDirection::Column)));
        assert!(matches!(styles.justify_content, Some(JustifyContent::Center)));
        assert!(matches!(styles.align_items, Some(AlignItems::Center)));
    }

    #[test]
    fn test_parse_arbitrary_color() {
        let styles = parse("bg-[#505050]");
        assert!(styles.background.is_some());
    }

    #[test]
    fn test_parse_arbitrary_size() {
        let styles = parse("size-[500px]");
        assert!(styles.width.is_some());
        assert!(styles.height.is_some());
    }
}
