use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Emitter};

use crate::types::messages::{DesktopChangePayload, FileEntry};

/// Trait for app services managed by the Tauri setup lifecycle.
pub trait AppService {
    fn start(&mut self) -> Result<(), String>;
}

/// Periodically polls the Windows desktop directory and emits file-change events.
pub struct FilePoller {
    app_handle: AppHandle,
    poll_interval: Duration,
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
    previous_snapshot: Vec<FileEntry>,
    previous_modified: HashMap<String, SystemTime>,
    desktop_path: PathBuf,
}

impl FilePoller {
    pub fn new(app_handle: AppHandle, poll_interval: Duration) -> Self {
        let desktop_path = get_desktop_path().unwrap_or_else(|_| {
        // 回退：使用 SystemDrive 环境变量（避免硬编码 C:\）
        std::env::var("SystemDrive").map(|d| PathBuf::from(format!("{}\\Users\\Default\\Desktop", d)))
            .unwrap_or_else(|_| PathBuf::from("C:\\"))
    });
        FilePoller {
            app_handle,
            poll_interval,
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
            previous_snapshot: Vec::new(),
            previous_modified: HashMap::new(),
            desktop_path,
        }
    }
}

impl Drop for FilePoller {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }
}

impl AppService for FilePoller {
    fn start(&mut self) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Err("FilePoller is already running".to_string());
        }

        self.running.store(true, Ordering::SeqCst);
        let running = self.running.clone();
        let interval = self.poll_interval;
        let app_handle = self.app_handle.clone();
        let desktop_path = self.desktop_path.clone();

        // Initialize snapshot from current desktop state
        self.previous_snapshot = read_desktop_files(&desktop_path)?;
        self.previous_modified = get_modified_times(&desktop_path)?;

        let (tx, rx) = std::sync::mpsc::channel();

        let handle = thread::spawn(move || {
            let mut prev_snapshot: Vec<FileEntry> = Vec::new();
            let mut prev_modified: HashMap<String, SystemTime> = HashMap::new();

            // Receive initial snapshot from parent thread
            if let Ok((snap, mods)) = rx.recv() {
                prev_snapshot = snap;
                prev_modified = mods;
            }

            // Emit initial full sync
            let full_payload = DesktopChangePayload {
                added: prev_snapshot.clone(),
                removed: Vec::new(),
                modified: Vec::new(),
                is_full: true,
            };
            let _ = app_handle.emit("desktop:files", &full_payload);

            // Poll loop
            while running.load(Ordering::SeqCst) {
                thread::sleep(interval);

                // Read current desktop files
                let current_files = match read_desktop_files(&desktop_path) {
                    Ok(files) => files,
                    Err(e) => {
                        eprintln!("[FilePoller] Failed to read desktop: {e}");
                        continue;
                    }
                };
                let current_modified = match get_modified_times(&desktop_path) {
                    Ok(m) => m,
                    Err(e) => {
                        eprintln!("[FilePoller] Failed to get modified times: {e}");
                        continue;
                    }
                };

                // Compute diff
                let diff = compute_diff(&prev_snapshot, &current_files, &prev_modified, &current_modified);

                // Only emit if there are any changes
                if !diff.added.is_empty() || !diff.removed.is_empty() || !diff.modified.is_empty() {
                    let _ = app_handle.emit("desktop:files", &diff);
                }

                prev_snapshot = current_files;
                prev_modified = current_modified;
            }
        });

        // Send initial snapshot to the thread
        let _ = tx.send((self.previous_snapshot.clone(), self.previous_modified.clone()));

        self.thread_handle = Some(handle);
        Ok(())
    }

}

// ── Helpers ──

pub fn get_desktop_path() -> Result<PathBuf, String> {
    // Try %USERPROFILE%\Desktop first
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let path = PathBuf::from(&profile).join("Desktop");
        if path.exists() {
            return Ok(path);
        }
    }
    // Fallback: %PUBLIC%\Desktop
    if let Ok(public) = std::env::var("PUBLIC") {
        let path = PathBuf::from(&public).join("Desktop");
        if path.exists() {
            return Ok(path);
        }
    }
    // Fallback: SystemDrive\Users\Default\Desktop
    if let Ok(system_drive) = std::env::var("SystemDrive") {
        let path = PathBuf::from(&system_drive).join("\\Users\\Default\\Desktop");
        if path.exists() {
            return Ok(path);
        }
    }
    Err("Could not find desktop directory".to_string())
}

fn read_desktop_files(desktop_path: &PathBuf) -> Result<Vec<FileEntry>, String> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(desktop_path)
        .map_err(|e| format!("Failed to read desktop: {e}"))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Skip hidden/system files (recycle bin markers, system files)
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

fn get_modified_times(desktop_path: &PathBuf) -> Result<HashMap<String, SystemTime>, String> {
    let mut map = HashMap::new();
    for entry in std::fs::read_dir(desktop_path)
        .map_err(|e| format!("Failed to read desktop for modified times: {e}"))?
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

        if let Ok(metadata) = path.metadata() {
            if let Ok(modified) = metadata.modified() {
                map.insert(path.to_string_lossy().to_string(), modified);
            }
        }
    }
    Ok(map)
}

fn compute_diff(
    prev: &[FileEntry],
    curr: &[FileEntry],
    prev_modified: &HashMap<String, SystemTime>,
    curr_modified: &HashMap<String, SystemTime>,
) -> DesktopChangePayload {
    use std::collections::HashSet;

    let prev_paths: HashSet<&str> = prev.iter().map(|f| f.path.as_str()).collect();
    let curr_paths: HashSet<&str> = curr.iter().map(|f| f.path.as_str()).collect();

    // Added: files in current but not in previous
    let added: Vec<FileEntry> = curr
        .iter()
        .filter(|f| !prev_paths.contains(f.path.as_str()))
        .cloned()
        .collect();

    // Removed: files in previous but not in current
    let removed: Vec<FileEntry> = prev
        .iter()
        .filter(|f| !curr_paths.contains(f.path.as_str()))
        .cloned()
        .collect();

    // Modified: files in both but with different modification time
    let modified: Vec<FileEntry> = curr
        .iter()
        .filter(|f| {
            if !prev_paths.contains(f.path.as_str()) {
                return false;
            }
            // Check if modification time changed
            let prev_mtime = prev_modified.get(&f.path);
            let curr_mtime = curr_modified.get(&f.path);
            match (prev_mtime, curr_mtime) {
                (Some(p), Some(c)) => p != c,
                _ => false,
            }
        })
        .cloned()
        .collect();

    DesktopChangePayload {
        added,
        removed,
        modified,
        is_full: false,
    }
}
