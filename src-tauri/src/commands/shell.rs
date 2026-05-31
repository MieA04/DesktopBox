use std::sync::Mutex;

use tauri::State;

use crate::services::shell_manager::ShellManager;

/// Initialize a new cmd.exe shell session. Returns a unique session_id.
#[tauri::command]
pub fn init_shell(manager: State<'_, Mutex<ShellManager>>) -> Result<String, String> {
    let mut mgr = manager.lock().map_err(|e| format!("Lock error: {e}"))?;
    mgr.create_session()
}

/// Write raw data (as UTF-8 string) to the shell's stdin.
#[tauri::command]
pub fn write_stdin(
    manager: State<'_, Mutex<ShellManager>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|e| format!("Lock error: {e}"))?;
    mgr.write_stdin(&session_id, &data)
}

/// Resize the terminal dimensions (v0.1 placeholder).
#[tauri::command]
pub fn resize_shell(
    manager: State<'_, Mutex<ShellManager>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|e| format!("Lock error: {e}"))?;
    mgr.resize_shell(&session_id, cols, rows)
}

/// Kill a shell session, forcibly terminating the subprocess.
#[tauri::command]
pub fn kill_shell(
    manager: State<'_, Mutex<ShellManager>>,
    session_id: String,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|e| format!("Lock error: {e}"))?;
    mgr.kill_session(&session_id)
}
