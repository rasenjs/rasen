//! Element types for GPUI rendering

use gpui::*;
use crate::tw_parser::ParsedStyles;
use crate::event_manager::HandlerId;

/// Element tree node
#[derive(Clone)]
pub enum Element {
    Div(DivElement),
    Text(TextElement),
}

#[derive(Clone, Default)]
pub struct EventHandlers {
    pub on_click: Option<HandlerId>,
    pub on_mouse_enter: Option<HandlerId>,
    pub on_mouse_leave: Option<HandlerId>,
}

#[derive(Clone)]
pub struct DivElement {
    pub id: String,
    pub styles: ParsedStyles,
    pub children: Vec<Element>,
    pub handlers: EventHandlers,
}

#[derive(Clone)]
pub struct TextElement {
    pub text: String,
    pub styles: ParsedStyles,
}

/// Context for rendering elements with event binding capability
pub struct RenderContext<'a> {
    pub click_handler: &'a dyn Fn(HandlerId) -> Box<dyn Fn(&ClickEvent, &mut Window, &mut App) + 'static>,
}

impl Element {
    pub fn render_with_events(&self, render_ctx: &RenderContext) -> AnyElement {
        match self {
            Element::Div(div_elem) => render_div_with_events(div_elem, render_ctx),
            Element::Text(text_elem) => render_text(text_elem).into_any_element(),
        }
    }
}

fn render_div_with_events(elem: &DivElement, render_ctx: &RenderContext) -> AnyElement {
    let mut d = div();
    
    // Apply styles from ParsedStyles
    let styles = &elem.styles;
    
    // Display & Flex
    if matches!(styles.display, Some(Display::Flex)) {
        d = d.flex();
    }
    
    if let Some(dir) = &styles.flex_direction {
        d = match dir {
            FlexDirection::Row => d.flex_row(),
            FlexDirection::Column => d.flex_col(),
            FlexDirection::RowReverse => d.flex_row_reverse(),
            FlexDirection::ColumnReverse => d.flex_col_reverse(),
        };
    }
    
    if let Some(jc) = &styles.justify_content {
        d = match jc {
            JustifyContent::FlexStart => d.justify_start(),
            JustifyContent::FlexEnd => d.justify_end(),
            JustifyContent::Center => d.justify_center(),
            JustifyContent::SpaceBetween => d.justify_between(),
            JustifyContent::SpaceAround => d.justify_around(),
            JustifyContent::SpaceEvenly => d.justify_evenly(),
            _ => d, // Handle other variants
        };
    }
    
    if let Some(ai) = &styles.align_items {
        d = match ai {
            AlignItems::FlexStart => d.items_start(),
            AlignItems::FlexEnd => d.items_end(),
            AlignItems::Center => d.items_center(),
            AlignItems::Baseline => d.items_baseline(),
            _ => d, // Stretch and other variants - default behavior
        };
    }
    
    // Sizing
    if let Some(w) = &styles.width {
        d = d.w(w.clone());
    }
    if let Some(h) = &styles.height {
        d = d.h(h.clone());
    }
    
    // Gap - convert Length to DefiniteLength
    if let Some(gap) = &styles.gap {
        if let Length::Definite(def_len) = gap {
            d = d.gap(def_len.clone());
        }
    }
    
    // Background
    if let Some(bg) = &styles.background {
        d = d.bg(*bg);
    }
    
    // Border
    if let Some(bw) = &styles.border_width {
        d = d.border(*bw);
    }
    if let Some(bc) = &styles.border_color {
        d = d.border_color(*bc);
    }
    if let Some(br) = &styles.border_radius {
        d = d.rounded(*br);
    }
    
    // Padding - apply individual sides if definite
    if let Some(p) = &styles.padding {
        if let Length::Definite(def) = &p.top {
            if let DefiniteLength::Absolute(AbsoluteLength::Pixels(px_val)) = def {
                d = d.pt(*px_val);
            }
        }
        if let Length::Definite(def) = &p.bottom {
            if let DefiniteLength::Absolute(AbsoluteLength::Pixels(px_val)) = def {
                d = d.pb(*px_val);
            }
        }
        if let Length::Definite(def) = &p.left {
            if let DefiniteLength::Absolute(AbsoluteLength::Pixels(px_val)) = def {
                d = d.pl(*px_val);
            }
        }
        if let Length::Definite(def) = &p.right {
            if let DefiniteLength::Absolute(AbsoluteLength::Pixels(px_val)) = def {
                d = d.pr(*px_val);
            }
        }
    }

    // Margin - apply individual sides if definite
    if let Some(m) = &styles.margin {
        if let Length::Definite(def) = &m.top {
            if let DefiniteLength::Absolute(AbsoluteLength::Pixels(px_val)) = def {
                d = d.mt(*px_val);
            }
        }
        if let Length::Definite(def) = &m.bottom {
            if let DefiniteLength::Absolute(AbsoluteLength::Pixels(px_val)) = def {
                d = d.mb(*px_val);
            }
        }
        if let Length::Definite(def) = &m.left {
            if let DefiniteLength::Absolute(AbsoluteLength::Pixels(px_val)) = def {
                d = d.ml(*px_val);
            }
        }
        if let Length::Definite(def) = &m.right {
            if let DefiniteLength::Absolute(AbsoluteLength::Pixels(px_val)) = def {
                d = d.mr(*px_val);
            }
        }
    }
    
    // Cursor style for clickable elements
    if elem.handlers.on_click.is_some() {
        d = d.cursor_pointer();
    }

    // Children
    for child in &elem.children {
        d = d.child(child.render_with_events(render_ctx));
    }
    
    // Apply click handler if present
    if let Some(handler_id) = elem.handlers.on_click {
        let handler = (render_ctx.click_handler)(handler_id);
        let element_id = ElementId::Name(elem.id.clone().into());
        return d.id(element_id).on_click(handler).into_any_element();
    }
    
    d.into_any_element()
}

fn render_text(elem: &TextElement) -> Div {
    let mut d = div().child(elem.text.clone());
    
    let styles = &elem.styles;
    
    // Text color
    if let Some(color) = &styles.text_color {
        d = d.text_color(*color);
    }
    
    // Font size
    if let Some(size) = &styles.font_size {
        d = d.text_size(*size);
    }
    
    // Font weight
    if let Some(weight) = &styles.font_weight {
        d = d.font_weight(*weight);
    }
    
    d
}
