use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

/// [TD-005] Get window downgrade state from persistent store.
#[tauri::command]
pub fn get_window_downgrade(app: AppHandle) -> Result<bool, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let val = store.get("window_downgrade");
    Ok(val.and_then(|v| v.as_bool()).unwrap_or(false))
}

/// [TD-005] Set window downgrade state in persistent store.
#[tauri::command]
pub fn set_window_downgrade(app: AppHandle, downgrade: bool) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("window_downgrade", serde_json::json!(downgrade));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
