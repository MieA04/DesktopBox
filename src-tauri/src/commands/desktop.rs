use std::path::Path;
use tauri::AppHandle;
use crate::services::icon_extractor;
use tauri_plugin_opener::OpenerExt;

use crate::services::file_poller::read_all_desktop_files;
use crate::types::messages::FileEntry;

#[tauri::command]
pub fn open_file(app: AppHandle, path: String) -> Result<(), String> {
    // C4: 空值检查
    if path.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    // 路径存在性检查
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    // 使用 canonicalize 解析符号链接和 .. 以拦截路径遍历
    let canonical = p
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    app.opener()
        .open_path(canonical.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Failed to open file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_desktop_files() -> Result<Vec<FileEntry>, String> {
    read_all_desktop_files()
}

#[tauri::command]
pub fn extract_icon(path: String, size: Option<u32>) -> Result<String, String> {
    icon_extractor::extract_icon_as_data_url(&path, size.unwrap_or(32))
}
