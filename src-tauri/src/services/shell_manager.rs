use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::types::messages::{ShellExitPayload, ShellOutputPayload};

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

        let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

        // 将 cmd.exe 代码页切换为 UTF-8，避免中文系统 CP936(GBK) 导致终端乱码
        let _ = stdin.write_all(b"chcp 65001>nul\r\n");
        let _ = stdin.flush();

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
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
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
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
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
