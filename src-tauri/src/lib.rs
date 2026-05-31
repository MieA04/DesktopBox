mod commands;
mod services;
mod types;

use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, PhysicalSize, PhysicalPosition};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState};

use crate::services::file_poller::FilePoller;
use crate::services::shell_manager::ShellManager;
use crate::services::system_monitor::SystemMonitor;
use crate::services::AppService;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // ── 窗口配置：桌面层 Z-序 + 程序化全屏 ──
            // [BUG-3] 窗口置于所有应用之下，不遮挡浏览器/IDE
            // [BUG-2] 移除 fullscreen:true 改用程序化全屏（避免 DWM 合成被独占模式绕过）
            if let Some(window) = app.get_webview_window("main") {
                // Z-序：窗口钉在底部（桌面之上，所有应用之下）
                if let Err(e) = window.set_always_on_bottom(true) {
                    eprintln!("[DesktopBox] Warn: failed to set always_on_bottom: {e}");
                }
                // 不在任务栏显示
                if let Err(e) = window.set_skip_taskbar(true) {
                    eprintln!("[DesktopBox] Warn: failed to set skip_taskbar: {e}");
                }
                // 窗口允许聚焦（M4 终端模块需要键盘输入，不可聚焦时 WebView2 无法接收键盘事件）
                // skip_taskbar + always_on_bottom 已足够保持窗口非侵入性
                // 程序化全屏：获取主显示器尺寸并设置窗口覆盖
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let size = monitor.size();
                    if let Err(e) = window.set_size(PhysicalSize::new(size.width, size.height)) {
                        eprintln!("[DesktopBox] Warn: failed to set window size: {e}");
                    }
                    if let Err(e) = window.set_position(PhysicalPosition::new(0, 0)) {
                        eprintln!("[DesktopBox] Warn: failed to set window position: {e}");
                    }
                }
            }

            // 桌面图标与任务栏由用户在 Windows 系统设置中手动管理
            // 启动时不再自动隐藏（REQ-SYS-001/002 已降级为 P3）

            // 全局快捷键：Ctrl+Shift+D 切换模块显隐 [REQ-SYS-003]
            // on_shortcut 内部已包含注册逻辑，无需单独调用 register()
            let handle = app.handle().clone();
            let _ = app.global_shortcut().on_shortcut(
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyD),
                move |_app, _shortcut, event: ShortcutEvent| {
                    // 只响应按下事件，忽略释放事件（否则触发两次，模块立即重新显示）
                    if !matches!(event.state, ShortcutState::Pressed) {
                        return;
                    }
                    println!("[DesktopBox] Global shortcut Ctrl+Shift+D triggered");
                    if let Some(window) = handle.get_webview_window("main") {
                        commands::window::toggle_modules_visibility(window);
                    }
                },
            );

            // ── FilePoller: 实时监听桌面文件变化 ──
            // 通过 app.manage() 托管，应用退出时自动 Drop → 停止轮询线程
            let mut poller = FilePoller::new(app.handle().clone(), Duration::from_millis(300));
            if let Err(e) = poller.start() {
                eprintln!("[DesktopBox] FilePoller failed to start: {e}");
            }
            app.manage(Mutex::new(poller));

            // ── SystemMonitor: 系统数据采集 ──
            // 通过 app.manage() 托管，应用退出时自动 Drop → 停止采集线程
            let mut monitor = SystemMonitor::new(app.handle().clone());
            if let Err(e) = monitor.start() {
                eprintln!("[DesktopBox] SystemMonitor failed to start: {e}");
            }
            app.manage(Mutex::new(monitor));

            // ── ShellManager: 终端子进程管理 ──
            // 通过 app.manage() 托管，Mutex 包裹 HashMap<String, ShellSession>
            app.manage(Mutex::new(ShellManager::new(app.handle().clone())));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::window::toggle_modules_visibility,
            commands::window::get_window_downgrade,
            commands::window::set_window_downgrade,
            commands::desktop::open_file,
            commands::desktop::get_desktop_files,
            commands::system::get_system_stats,
            commands::shell::init_shell,
            commands::shell::write_stdin,
            commands::shell::resize_shell,
            commands::shell::kill_shell,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
