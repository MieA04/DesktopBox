use tauri::{Emitter, WebviewWindow};

/// Send `app:toggle-modules` event to toggle module visibility in the frontend.
/// The window background stays visible at all times.
/// [REQ-SYS-003] 全局快捷键切换模块显隐
#[tauri::command]
pub fn toggle_modules_visibility(window: WebviewWindow) {
    println!("[DesktopBox] Emitting app:toggle-modules event");
    let _ = window.emit("app:toggle-modules", ());
}
