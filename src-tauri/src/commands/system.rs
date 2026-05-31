use crate::types::messages::SystemStats;

#[tauri::command]
pub fn get_system_stats() -> Result<SystemStats, String> {
    Err("get_system_stats is not implemented as a command; use system:stats event instead".to_string())
}
