// Desktop Icons Hide/Show Module
// Uses WinAPI to find and hide/show the desktop icon ListView

use std::ptr::null_mut;

// WinAPI constants
const SW_HIDE: i32 = 0;
const SW_SHOW: i32 = 5;
const GW_CHILD: u32 = 5;
const GW_HWNDNEXT: u32 = 2;

#[link(name = "user32")]
extern "system" {
    fn FindWindowW(
        lpClassName: *const u16,
        lpWindowName: *const u16,
    ) -> isize;

    fn FindWindowExW(
        hWndParent: isize,
        hWndChildAfter: isize,
        lpszClass: *const u16,
        lpszWindow: *const u16,
    ) -> isize;

    fn ShowWindow(hWnd: isize, nCmdShow: i32) -> i32;

    fn GetWindow(hWnd: isize, uCmd: u32) -> isize;
}

/// Encode a Rust string to a null-terminated UTF-16 wide string
fn to_wstring(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Find the Progman (Desktop) window, then locate SysListView32 (desktop icons)
unsafe fn find_desktop_listview() -> isize {
    let progman_class = to_wstring("Progman");
    let progman = FindWindowW(progman_class.as_ptr(), null_mut());
    if progman == 0 {
        return 0;
    }

    // Try to find SysListView32 directly as child of Progman
    let listview_class = to_wstring("SysListView32");
    let mut hwnd = FindWindowExW(progman, 0, listview_class.as_ptr(), null_mut());
    if hwnd != 0 {
        return hwnd;
    }

    // Fallback: Some Windows versions place the icons in a WorkerW window under Progman
    // So we need to search deeper
    // First, enumerate children of Progman
    let mut child = GetWindow(progman, GW_CHILD);
    while child != 0 {
        hwnd = FindWindowExW(child, 0, listview_class.as_ptr(), null_mut());
        if hwnd != 0 {
            return hwnd;
        }
        child = GetWindow(child, GW_HWNDNEXT);
    }

    0
}

/// Hide desktop icons
pub fn hide() -> Result<(), String> {
    unsafe {
        let hwnd = find_desktop_listview();
        if hwnd == 0 {
            return Err("Cannot find desktop ListView window".to_string());
        }
        ShowWindow(hwnd, SW_HIDE);
        Ok(())
    }
}

/// Show desktop icons
pub fn show() -> Result<(), String> {
    unsafe {
        let hwnd = find_desktop_listview();
        if hwnd == 0 {
            // It's possible the window handle changed; we just ignore
            return Err("Cannot find desktop ListView window".to_string());
        }
        ShowWindow(hwnd, SW_SHOW);
        Ok(())
    }
}
