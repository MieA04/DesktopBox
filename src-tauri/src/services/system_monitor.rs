use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime};

use sysinfo::{CpuRefreshKind, MemoryRefreshKind, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};

use crate::services::AppService;
use crate::types::messages::{ProcessInfo, SystemStats};

/// Periodically collects CPU/GPU/memory/process data and emits Tauri events.
pub struct SystemMonitor {
    app_handle: AppHandle,
    stats_interval: Duration,
    process_interval: Duration,
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
}

impl SystemMonitor {
    pub fn new(app_handle: AppHandle) -> Self {
        SystemMonitor {
            app_handle,
            stats_interval: Duration::from_millis(1000),
            process_interval: Duration::from_millis(500),
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        }
    }
}

impl Drop for SystemMonitor {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }
}

impl AppService for SystemMonitor {
    fn start(&mut self) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Err("SystemMonitor is already running".to_string());
        }
        self.running.store(true, Ordering::SeqCst);
        let running = self.running.clone();
        let app_handle = self.app_handle.clone();
        let stats_interval = self.stats_interval;
        let process_interval = self.process_interval;

        let handle = thread::spawn(move || {
            let mut sys = System::new();
            // Pre-populate process list so the first stats emission is not empty
            sys.refresh_processes(ProcessesToUpdate::All, false);
            let mut stats_elapsed = Duration::ZERO;
            let mut process_elapsed = Duration::ZERO;
            let tick = Duration::from_millis(50);

            while running.load(Ordering::SeqCst) {
                thread::sleep(tick);
                stats_elapsed += tick;
                process_elapsed += tick;

                if stats_elapsed >= stats_interval {
                    stats_elapsed = Duration::ZERO;
                    sys.refresh_cpu_specifics(CpuRefreshKind::everything());
                    sys.refresh_memory_specifics(MemoryRefreshKind::everything());

                    let stats = SystemStats {
                        cpu_usage: sys.global_cpu_usage(),
                        gpu_usage: None, // sysinfo does not support GPU
                        memory_used: sys.used_memory(),
                        memory_total: sys.total_memory(),
                        processes: sys.processes().len() as u32,
                        uptime: System::uptime(),
                        timestamp: SystemTime::now()
                            .duration_since(SystemTime::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs(),
                    };
                    let _ = app_handle.emit("system:stats", &stats);
                }

                if process_elapsed >= process_interval {
                    process_elapsed = Duration::ZERO;
                    sys.refresh_processes(ProcessesToUpdate::All, false);

                    let processes: Vec<ProcessInfo> = sys
                        .processes()
                        .iter()
                        .map(|(pid, process)| ProcessInfo {
                            pid: pid.as_u32(),
                            name: process.name().to_string_lossy().to_string(),
                            cpu_usage: process.cpu_usage(),
                            memory_usage: process.memory(),
                        })
                        .collect();

                    let _ = app_handle.emit("system:processes", &processes);
                }
            }
        });

        self.thread_handle = Some(handle);
        Ok(())
    }

    fn stop(&mut self) -> Result<(), String> {
        if !self.running.load(Ordering::SeqCst) {
            return Err("SystemMonitor is not running".to_string());
        }
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
        Ok(())
    }

    fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}
