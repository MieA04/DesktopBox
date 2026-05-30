// DesktopBox - Main Application Entry
// Tauri 2 backend with WinAPI desktop/taskbar control, tray icon, global shortcuts

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_icons;
mod taskbar;

use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Runtime, WebviewWindow,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_global_shortcut::ShortcutState;

// ─── Tauri Commands ───────────────────────────────────────────

#[tauri::command]
fn hide_desktop_icons() -> Result<(), String> {
    desktop_icons::hide()
}

#[tauri::command]
fn show_desktop_icons() -> Result<(), String> {
    desktop_icons::show()
}

#[tauri::command]
fn hide_taskbar() -> Result<(), String> {
    taskbar::hide()
}

#[tauri::command]
fn show_taskbar() -> Result<(), String> {
    taskbar::show()
}

#[tauri::command]
fn toggle_window_visibility(window: WebviewWindow) -> Result<(), String> {
    if window.is_visible().unwrap_or(false) {
        window.hide().map_err(|e| e.to_string())
    } else {
        window.show().map_err(|e| e.to_string())
    }
}

// ─── Window Effects Setup ────────────────────────────────────

use tauri::window::{Effect, EffectState, EffectsBuilder};

fn apply_window_effects<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "windows")]
        {
            let _ = window.set_effects(
                EffectsBuilder::new()
                    .effects(vec![Effect::Acrylic])
                    .state(EffectState::Active)
                    .build(),
            );
        }
    }
}

// ─── Tray Menu Event Handler ────────────────────────────────

fn handle_tray_menu_event(app_handle: &tauri::AppHandle, event_id: &str) {
    match event_id {
        "toggle" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = toggle_window_visibility(window);
            }
        }
        "reset_taskbar" => {
            let _ = taskbar::show();
            let _ = desktop_icons::show();
        }
        "quit" => {
            // Restore desktop icons and taskbar before exit
            let _ = taskbar::show();
            let _ = desktop_icons::show();
            app_handle.exit(0);
        }
        _ => {}
    }
}

// ─── App Entry Point ──────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state == ShortcutState::Pressed
                        && shortcut.matches(
                            tauri_plugin_global_shortcut::Modifiers::CONTROL
                                | tauri_plugin_global_shortcut::Modifiers::SHIFT,
                            tauri_plugin_global_shortcut::Code::KeyD,
                        )
                    {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = toggle_window_visibility(window);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // ── Window acrylic/mica effects ──
            apply_window_effects(app.handle());

            // ── Tray Menu ──
            let show_hide =
                MenuItem::with_id(app, "toggle", "显示/隐藏窗口", true, None::<&str>)?;
            let reset_taskbar =
                MenuItem::with_id(app, "reset_taskbar", "重置任务栏", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &reset_taskbar, &quit])?;

            // ── Tray Icon ──
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("DesktopBox")
                .on_menu_event(|app_handle, event| {
                    handle_tray_menu_event(app_handle, event.id.as_ref());
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = toggle_window_visibility(window);
                        }
                    }
                })
                .build(app)?;

            // ── Register Global Shortcut ──
            app.global_shortcut().register("Ctrl+Shift+D")?;

            // ── Auto-hide desktop icons and taskbar on startup ──
            let _ = desktop_icons::hide();
            let _ = taskbar::hide();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_desktop_icons,
            show_desktop_icons,
            hide_taskbar,
            show_taskbar,
            toggle_window_visibility,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
