use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState};

use crate::types::messages::ShortcutBinding;

/// Registry holding the current set of shortcut bindings.
pub struct ShortcutRegistry {
    pub bindings: Vec<ShortcutBinding>,
    /// [FIX #5] 防止 `on_shortcut` 被多次注册（插件不支持运行时 unregister）
    pub registered: bool,
}

impl Default for ShortcutRegistry {
    fn default() -> Self {
        Self {
            bindings: Vec::new(),
            registered: false,
        }
    }
}

#[tauri::command]
pub fn register_shortcuts(
    app: AppHandle,
    registry: State<'_, Mutex<ShortcutRegistry>>,
    bindings: Vec<ShortcutBinding>,
) -> Result<(), String> {
    let mut reg = registry.lock().map_err(|e| e.to_string())?;

    // [FIX #5] 防止重复注册导致快捷键叠加执行
    if reg.registered {
        return Err(
            "Shortcuts already registered; this command can only be called once per session".into(),
        );
    }

    for binding in &bindings {
        let (modifiers, code) = parse_shortcut_keys(&binding.keys)?;
        let shortcut = Shortcut::new(Some(modifiers), code);
        let cmd = binding.command.clone();
        let args = binding.args.clone();
        let id = binding.id.clone();

        app.global_shortcut()
            .on_shortcut(shortcut, move |_app, _shortcut, event: ShortcutEvent| {
                if !matches!(event.state, ShortcutState::Pressed) {
                    return;
                }
                println!(
                    "[DesktopBox] Shortcut '{}' triggered: {} {:?}",
                    id, cmd, args
                );
                match std::process::Command::new(&cmd).args(&args).spawn() {
                    Ok(_) => {}
                    Err(e) => {
                        eprintln!("[DesktopBox] Failed to execute '{}': {}", cmd, e);
                    }
                }
            })
            .map_err(|e| {
                format!(
                    "Register shortcut '{}' (keys={}) failed: {}",
                    binding.id, binding.keys, e
                )
            })?;
    }

    reg.bindings = bindings;
    reg.registered = true;
    Ok(())
}

/// Parse shortcut key string like "w+r" into (Modifiers, Code).
/// Supported modifiers: w/win/meta, c/ctrl/control, s/shift, a/alt
fn parse_shortcut_keys(keys: &str) -> Result<(Modifiers, Code), String> {
    let parts: Vec<&str> = keys.split('+').collect();
    if parts.len() < 2 {
        return Err(format!(
            "Shortcut must have modifier + key, e.g. 'w+r'. Got: '{}'",
            keys
        ));
    }

    let mut modifiers = Modifiers::empty();
    let key_str = parts.last().unwrap().to_lowercase();

    for part in &parts[..parts.len() - 1] {
        match part.to_lowercase().as_str() {
            "w" | "win" | "meta" => modifiers |= Modifiers::META,
            "c" | "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "s" | "shift" => modifiers |= Modifiers::SHIFT,
            "a" | "alt" => modifiers |= Modifiers::ALT,
            other => return Err(format!("Unknown modifier: {}", other)),
        }
    }

    let code = match key_str.as_str() {
        "r" => Code::KeyR,
        "e" => Code::KeyE,
        "d" => Code::KeyD,
        "f" => Code::KeyF,
        "t" => Code::KeyT,
        "q" => Code::KeyQ,
        "w" => Code::KeyW,
        "a" => Code::KeyA,
        "s" => Code::KeyS,
        "z" => Code::KeyZ,
        "x" => Code::KeyX,
        "c" => Code::KeyC,
        "v" => Code::KeyV,
        "b" => Code::KeyB,
        "n" => Code::KeyN,
        "m" => Code::KeyM,
        "1" => Code::Digit1,
        "2" => Code::Digit2,
        "3" => Code::Digit3,
        "4" => Code::Digit4,
        "5" => Code::Digit5,
        "6" => Code::Digit6,
        "7" => Code::Digit7,
        "8" => Code::Digit8,
        "9" => Code::Digit9,
        "0" => Code::Digit0,
        other => return Err(format!("Unsupported key: {}", other)),
    };

    Ok((modifiers, code))
}
