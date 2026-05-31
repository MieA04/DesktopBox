pub mod file_poller;
pub mod shell_manager;
pub mod system_monitor;

/// Trait for app services managed by the Tauri setup lifecycle.
#[allow(dead_code)]
pub trait AppService: Send + 'static {
    fn start(&mut self) -> Result<(), String>;
    fn stop(&mut self) -> Result<(), String>;
    fn is_running(&self) -> bool;
}
