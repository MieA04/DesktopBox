// Taskbar Hide/Show Module
// Uses WinAPI to hide and show the Windows taskbar

use std::ptr::null_mut;

const SW_HIDE: i32 = 0;
const SW_SHOW: i32 = 5;

#[link(name = "user32")]
extern "system" {
    fn FindWindowW(
        lpClassName: *const u16,
        lpWindowName: *const u16,
    ) -> isize;

    fn ShowWindow(hWnd: isize, nCmdShow: i32) -> i32;
}

fn to_wstring(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe fn find_taskbar() -> isize {
    let class_name = to_wstring("Shell_TrayWnd");
    FindWindowW(class_name.as_ptr(), null_mut())
}

/// Hide the taskbar
pub fn hide() -> Result<(), String> {
    unsafe {
        let hwnd = find_taskbar();
        if hwnd == 0 {
            return Err("Cannot find taskbar window".to_string());
        }
        ShowWindow(hwnd, SW_HIDE);
        Ok(())
    }
}

/// Show the taskbar
pub fn show() -> Result<(), String> {
    unsafe {
        let hwnd = find_taskbar();
        if hwnd == 0 {
            return Err("Cannot find taskbar window".to_string());
        }
        ShowWindow(hwnd, SW_SHOW);
        Ok(())
    }
}
