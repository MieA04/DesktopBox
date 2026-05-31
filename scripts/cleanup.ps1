<#
.SYNOPSIS
    清理 desktopBox Tauri 开发进程，释放端口 1420

.DESCRIPTION
    在重新运行 pnpm tauri dev 之前执行此脚本，
    可彻底终止残留的 vite(node) 和 desktop-box.exe 进程。
#>

Write-Host "[desktopBox] 清理 Tauri 开发进程..." -ForegroundColor Cyan

# 1. 查找并终止占用 1420 端口的进程
$portProcess = netstat -ano | Select-String ":1420 " | Select-String "LISTENING"
if ($portProcess) {
    $pid = $portProcess.Line.Trim().Split(' ') | Where-Object { $_ -ne '' } | Select-Object -Last 1
    if ($pid) {
        Write-Host "  杀死 1420 端口的进程 (PID: $pid)" -ForegroundColor Yellow
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
}

# 2. 终止 desktop-box.exe (Tauri 应用)
$tauriProc = Get-Process desktop-box -ErrorAction SilentlyContinue
if ($tauriProc) {
    Write-Host "  终止 desktop-box.exe" -ForegroundColor Yellow
    $tauriProc | Stop-Process -Force
}

# 3. 终止残留的早期 node 进程（仅本项目目录下的）
#    谨慎起见，只杀与 vite/tauri 相关的 node 子进程
$nodeProcs = Get-Process node -ErrorAction SilentlyContinue
foreach ($proc in $nodeProcs) {
    try {
        $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
        if ($cmdLine -match "desktopBox|vite|tauri") {
            Write-Host "  终止残留的 node 进程 (PID: $($proc.Id))" -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # 忽略权限错误
    }
}

Start-Sleep -Seconds 1

# 4. 验证端口已释放
$stillUsed = netstat -ano | Select-String ":1420 " | Select-String "LISTENING"
if (-not $stillUsed) {
    Write-Host "[desktopBox] 清理完成，端口 1420 已释放 ✓" -ForegroundColor Green
} else {
    Write-Host "[desktopBox] 警告：端口 1420 仍被占用，请手动杀死 PID: $(([regex]::Match($stillUsed.Line, '\d+$')).Value)" -ForegroundColor Red
}
