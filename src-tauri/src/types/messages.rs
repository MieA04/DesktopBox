use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DesktopChangePayload {
    pub added: Vec<FileEntry>,
    pub removed: Vec<FileEntry>,
    pub modified: Vec<FileEntry>,
    pub is_full: bool,  // true for initial full sync
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub gpu_usage: Option<f32>,
    pub memory_used: u64,
    pub memory_total: u64,
    pub processes: u32,
    pub uptime: u64,
    pub timestamp: u64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_usage: u64,
}

// ── M4: Terminal / Shell ──

#[derive(Clone, Serialize, Deserialize)]
pub struct ShellOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ShellExitPayload {
    pub session_id: String,
    pub exit_code: i32,
}

