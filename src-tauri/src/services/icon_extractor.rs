use std::ffi::OsStr;
use std::io::Cursor;
use std::os::windows::ffi::OsStrExt;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use image::{ImageBuffer, ImageFormat, Rgba};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    BITMAP, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleDC, DIB_USAGE, DeleteDC,
    GetDIBits, GetDC, GetObjectW, HDC, ReleaseDC, HBITMAP, HGDIOBJ, RGBQUAD,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::UI::Shell::{
    SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON,
};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO, HICON};

/// Extract icon from a file path and return it as a base64 data URL (PNG).
/// [REQ-ICON-008] 真实桌面图标渲染
pub fn extract_icon_as_data_url(file_path: &str, size: u32) -> Result<String, String> {
    // Step 1: Get HICON via SHGetFileInfoW
    let path_wide: Vec<u16> = OsStr::new(file_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut shfi = SHFILEINFOW::default();
    // [FIX #7] Remove SHGFI_USEFILEATTRIBUTES to get correct folder icons
    let flags = SHGFI_ICON;

    let result = unsafe {
        SHGetFileInfoW(
            windows::core::PCWSTR(path_wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut shfi as *mut SHFILEINFOW),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        )
    };

    if result == 0 {
        return Err(format!("SHGetFileInfoW failed for: {}", file_path));
    }

    let hicon = shfi.hIcon;
    if hicon.is_invalid() {
        return Err("Invalid icon handle".into());
    }

    // Step 2: Extract RGBA pixel data from HICON
    let rgba_result = unsafe { extract_hicon_rgba(hicon) };

    // Always clean up the icon handle
    unsafe {
        let _ = DestroyIcon(hicon);
    }

    let (rgba, width, height) = rgba_result?;

    // Step 3: Encode as PNG, then base64
    // [FIX #2] Resize to target size if different from original
    let img = ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, rgba)
        .ok_or("Failed to create image buffer from icon pixels")?;

    let img = if size > 0 && (width != size || height != size) {
        image::imageops::resize(&img, size, size, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let mut png_buf = Cursor::new(Vec::new());
    img.write_to(&mut png_buf, ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {}", e))?;

    let b64 = BASE64.encode(png_buf.into_inner());
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Extract RGBA pixel data from a Windows HICON handle.
/// Returns (pixels, width, height) with 32bpp top-down RGBA data.
/// [FIX #1] BGRA -> RGBA swap applied before return
/// [FIX #3] Alpha channel merged from hbmMask bitmap
unsafe fn extract_hicon_rgba(hicon: HICON) -> Result<(Vec<u8>, u32, u32), String> {
    let mut icon_info: ICONINFO = std::mem::zeroed();
    let ret = GetIconInfo(hicon, &mut icon_info);
    if ret.is_err() {
        return Err("GetIconInfo failed".into());
    }

    let hbm_color = icon_info.hbmColor;
    let hbm_mask = icon_info.hbmMask;

    // Get bitmap dimensions
    let mut bmp: BITMAP = std::mem::zeroed();
    let obj_result = GetObjectW(
        HBITMAP(hbm_color.0),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bmp as *mut _ as *mut std::ffi::c_void),
    );

    if obj_result == 0 {
        // Clean up bitmaps
        let _ = gdi_delete_object(hbm_color.into());
        let _ = gdi_delete_object(hbm_mask.into());
        return Err("GetObjectW failed for color bitmap".into());
    }

    let width = bmp.bmWidth as u32;
    let height = bmp.bmHeight as u32;

    // Set up BITMAPINFOHEADER for 32bpp top-down bitmap
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32), // top-down DIB
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0, // BI_RGB = 0
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [RGBQUAD::default(); 1],
    };

    let mut pixels = vec![0u8; (width * height * 4) as usize];

    let hdc_screen = GetDC(HWND::default());
    if hdc_screen.is_invalid() {
        let _ = gdi_delete_object(hbm_color.into());
        let _ = gdi_delete_object(hbm_mask.into());
        return Err("GetDC failed".into());
    }

    let hdc_mem = CreateCompatibleDC(hdc_screen);
    if hdc_mem.is_invalid() {
        let _ = ReleaseDC(HWND::default(), hdc_screen);
        let _ = gdi_delete_object(hbm_color.into());
        let _ = gdi_delete_object(hbm_mask.into());
        return Err("CreateCompatibleDC failed".into());
    }

    // Step A: Extract color pixels (GetDIBits returns BGRA, alpha=0)
    let dib_result = GetDIBits(
        hdc_mem,
        HBITMAP(hbm_color.0),
        0,
        height,
        Some(pixels.as_mut_ptr() as *mut std::ffi::c_void),
        &mut bmi,
        DIB_USAGE(0), // DIB_RGB_COLORS = 0
    );

    // Step B: [FIX #3] Extract mask bitmap and merge alpha channel
    // [FIX #9] 仅当 color bitmap 无 alpha 数据时才用 AND mask 推导透明度
    if dib_result != 0 {
        let has_meaningful_alpha = pixels.chunks_exact(4)
            .take(200)
            .any(|p| p[3] != 0);

        if !has_meaningful_alpha {
            let _ = merge_alpha_from_mask(&mut pixels, width, height, hdc_mem, hbm_mask);
        }
    }

    // Clean up DCs and bitmaps
    let _ = DeleteDC(hdc_mem);
    let _ = ReleaseDC(HWND::default(), hdc_screen);
    let _ = gdi_delete_object(hbm_color.into());
    let _ = gdi_delete_object(hbm_mask.into());

    if dib_result == 0 {
        return Err("GetDIBits failed".into());
    }

    // [FIX #1] Swap BGRA -> RGBA (exchange byte 0 and byte 2)
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }

    Ok((pixels, width, height))
}

/// [FIX #8] Use HGDIOBJ instead of HBITMAP to match actual usage
unsafe fn gdi_delete_object(h: HGDIOBJ) {
    let _ = windows::Win32::Graphics::Gdi::DeleteObject(h);
}

/// 从 AND mask 中提取透明度并合并到像素缓冲区。
/// 仅当 color bitmap 不含 alpha 数据时调用（旧格式图标）。
/// [FIX #9] 提取为独立函数以提高可读性
unsafe fn merge_alpha_from_mask(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    hdc_mem: HDC,
    hbm_mask: HBITMAP,
) -> Result<(), String> {
    let mut mask_bmp: BITMAP = std::mem::zeroed();
    let mask_obj = GetObjectW(
        HBITMAP(hbm_mask.0),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut mask_bmp as *mut _ as *mut std::ffi::c_void),
    );

    if mask_obj == 0 || mask_bmp.bmBitsPixel != 1 {
        return Err("Mask is not 1bpp or GetObjectW failed".into());
    }

    let mask_width = mask_bmp.bmWidth as u32;
    if mask_width < width {
        return Err("Mask narrower than color bitmap".into());
    }

    // For icons with separate hbmColor, the AND mask occupies the
    // first `height` rows of hbmMask (the rest is XOR mask, unused)
    let actual_mask_height = if mask_bmp.bmHeight > height as i32 {
        height
    } else {
        mask_bmp.bmHeight as u32
    };

    // Extract mask as 32bpp (GetDIBits converts 1bpp -> BGRA 32bpp)
    let mut mask_pixels = vec![0u8; (width * actual_mask_height * 4) as usize];
    let mut mask_bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(actual_mask_height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [RGBQUAD::default(); 1],
    };

    let mask_result = GetDIBits(
        hdc_mem,
        HBITMAP(hbm_mask.0),
        0,
        actual_mask_height,
        Some(mask_pixels.as_mut_ptr() as *mut std::ffi::c_void),
        &mut mask_bmi,
        DIB_USAGE(0),
    );

    if mask_result == 0 {
        return Err("GetDIBits on mask failed".into());
    }

    // AND mask convention: bit=0 (black) -> opaque, bit=1 (white) -> transparent
    // Monochrome 1bpp pixel values: 0=black(B=0), 1=white(B>0)
    for y in 0..actual_mask_height {
        for x in 0..width {
            let idx = ((y * width + x) * 4) as usize;
            // Set alpha: mask blue channel 0=opaque, >0=transparent
            pixels[idx + 3] = if mask_pixels[idx] == 0 { 255 } else { 0 };
        }
    }

    Ok(())
}
