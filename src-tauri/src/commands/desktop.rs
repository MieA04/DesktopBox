use std::path::Path;
use tauri::AppHandle;
use crate::services::icon_extractor;
use tauri_plugin_opener::OpenerExt;

use crate::services::file_poller::get_desktop_path;
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
    let desktop_path = get_desktop_path()?;
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&desktop_path)
        .map_err(|e| format!("Failed to read desktop: {e}"))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        // Skip hidden/system files
        if name.starts_with('$') || name.starts_with('.') {
            continue;
        }
        files.push(FileEntry {
            name: name.clone(),
            path: path.to_string_lossy().to_string(),
            is_dir: path.is_dir(),
            extension: path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_string()),
        });
    }
    // Sort by name for consistent ordering
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}

#[tauri::command]
pub fn extract_icon(path: String, size: Option<u32>) -> Result<String, String> {
    icon_extractor::extract_icon_as_data_url(&path, size.unwrap_or(32))
}
