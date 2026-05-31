use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::types::messages::{ShellExitPayload, ShellOutputPayload};

/// Convert bytes from the system's active code page (e.g. CP936/GBK on Chinese Windows)
/// to a Rust String.  Falls back to UTF-8 lossy if the WinAPI call fails.
#[cfg(windows)]
fn decode_console_output(data: &[u8]) -> String {
    // First try UTF-8 (covers plain ASCII and UTF-8 output)
    if let Ok(s) = std::str::from_utf8(data) {
        return s.to_string();
    }

    // Fallback: use Windows MultiByteToWideChar to translate from the system
    // ANSI code page (CP_ACP = 0) to UTF-16, then re-encode as UTF-8.
    // This correctly handles GBK/CP936, CP1252, etc.
    extern "system" {
        fn GetACP() -> u32;
        fn MultiByteToWideChar(
            CodePage: u32,
            dwFlags: u32,
            lpMultiByteStr: *const i8,
            cbMultiByte: i32,
            lpWideCharStr: *mut u16,
            cchWideChar: i32,
        ) -> i32;
        fn WideCharToMultiByte(
            CodePage: u32,
            dwFlags: u32,
            lpWideCharStr: *const u16,
            cchWideChar: i32,
            lpMultiByteStr: *mut i8,
            cbMultiByte: i32,
            lpDefaultChar: *const i8,
            lpUsedDefaultChar: *mut i32,
        ) -> i32;
    }

    let cp = unsafe { GetACP() };
    // CP_ACP == 0 means the system ANSI code page
    let wide_len = unsafe {
        MultiByteToWideChar(cp, 0, data.as_ptr() as *const i8, data.len() as i32, std::ptr::null_mut(), 0)
    };
    if wide_len <= 0 {
        return String::from_utf8_lossy(data).to_string();
    }
    let mut wide = vec![0u16; wide_len as usize];
    unsafe {
        MultiByteToWideChar(cp, 0, data.as_ptr() as *const i8, data.len() as i32, wide.as_mut_ptr(), wide_len);
    }

    // Convert UTF-16 → UTF-8 (CP_UTF8 == 65001)
    let utf8_len = unsafe {
        WideCharToMultiByte(65001, 0, wide.as_ptr(), wide_len, std::ptr::null_mut(), 0, std::ptr::null(), std::ptr::null_mut())
    };
    if utf8_len <= 0 {
        return String::from_utf8_lossy(data).to_string();
    }
    let mut utf8_buf = vec![0u8; utf8_len as usize];
    unsafe {
        WideCharToMultiByte(65001, 0, wide.as_ptr(), wide_len, utf8_buf.as_mut_ptr() as *mut i8, utf8_len, std::ptr::null(), std::ptr::null_mut());
    }
    String::from_utf8_lossy(&utf8_buf).to_string()
}

#[cfg(not(windows))]
fn decode_console_output(data: &[u8]) -> String {
    String::from_utf8_lossy(data).to_string()
}

/// A single shell session wrapping a Windows cmd.exe subprocess.
pub struct ShellSession {
    pub stdin: ChildStdin,
    pub child_pid: u32,
}

/// Manages multiple cmd.exe shell sessions.
///
/// ShellManager is stored behind `Mutex<ShellManager>` via `app.manage()`.
/// The `app_handle` field is cloned into reader/waiter threads for event emission.
pub struct ShellManager {
    app_handle: AppHandle,
    pub sessions: HashMap<String, ShellSession>,
}

static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);

fn generate_session_id() -> String {
    let id = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    format!("session_{id}")
}

impl ShellManager {
    pub fn new(app_handle: AppHandle) -> Self {
        ShellManager {
            app_handle,
            sessions: HashMap::new(),
        }
    }

    /// Spawn a new cmd.exe shell session, returning the session_id.
    pub fn create_session(&mut self) -> Result<String, String> {
        let mut child = Command::new("cmd.exe")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn cmd.exe: {e}"))?;

        let session_id = generate_session_id();
        let child_pid = child.id();

        let stdin = child.stdin.take().ok_or("Failed to open stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

        let session = ShellSession {
            stdin,
            child_pid,
        };
        self.sessions.insert(session_id.clone(), session);

        // ── Background reader + waiter thread ──
        let app_h = self.app_handle.clone();
        let sid = session_id.clone();

        thread::spawn(move || {
            // Read stdout in a sub-thread
            let sid_stdout = sid.clone();
            let app_stdout = app_h.clone();
            let stdout_reader = thread::spawn(move || {
                let mut reader = BufReader::new(stdout);
                let mut buf = vec![0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break, // EOF
                        Ok(n) => {
                            let data = decode_console_output(&buf[..n]);
                            let payload = ShellOutputPayload {
                                session_id: sid_stdout.clone(),
                                data,
                            };
                            let _ = app_stdout.emit("shell:output", &payload);
                        }
                        Err(_) => break,
                    }
                }
            });

            // Read stderr in a sub-thread
            let sid_stderr = sid.clone();
            let app_stderr = app_h.clone();
            let stderr_reader = thread::spawn(move || {
                let mut reader = BufReader::new(stderr);
                let mut buf = vec![0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break, // EOF
                        Ok(n) => {
                            let data = decode_console_output(&buf[..n]);
                            let payload = ShellOutputPayload {
                                session_id: sid_stderr.clone(),
                                data,
                            };
                            let _ = app_stderr.emit("shell:output", &payload);
                        }
                        Err(_) => break,
                    }
                }
            });

            // Wait for both readers to finish (pipe EOF)
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();

            // Process has exited — get exit code
            let exit_code = child
                .wait()
                .ok()
                .and_then(|s| s.code())
                .unwrap_or(-1);

            let _ = app_h.emit(
                "shell:exit",
                &ShellExitPayload {
                    session_id: sid,
                    exit_code,
                },
            );
        });

        Ok(session_id)
    }

    /// Write raw bytes to the stdin of a session's subprocess.
    pub fn write_stdin(&mut self, session_id: &str, data: &str) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {session_id}"))?;

        session
            .stdin
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write stdin: {e}"))?;
        session
            .stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {e}"))?;
        Ok(())
    }

    /// Resize the terminal (v0.1 placeholder).
    #[allow(unused_variables)]
    pub fn resize_shell(&mut self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        // v0.1: no-op placeholder — Windows console resize requires Win32 API
        Ok(())
    }

    /// Kill a shell session: terminate the subprocess and clean up.
    pub fn kill_session(&mut self, session_id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .remove(session_id)
            .ok_or_else(|| format!("Session not found: {session_id}"))?;

        // Force-kill the child process via taskkill
        let _ = Command::new("taskkill")
            .args(["/PID", &session.child_pid.to_string(), "/F"])
            .output();

        // Dropping session closes stdin, signalling EOF to the waiter thread.
        drop(session);

        Ok(())
    }
}
