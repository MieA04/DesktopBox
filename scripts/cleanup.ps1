<#
.SYNOPSIS
    Clean up desktopBox Tauri dev processes to free port 1420.
#>

Write-Host "[desktopBox] Cleaning up Tauri dev processes..." -ForegroundColor Cyan

# 1. Find and kill process on port 1420
$portProcess = netstat -ano | Select-String ":1420 " | Select-String "LISTENING"
if ($portProcess) {
    $parts = $portProcess.Line.Trim() -split '\s+'
    $pid = $parts[-1]
    if ($pid) {
        Write-Host "  Killing process on port 1420 (PID: $pid)" -ForegroundColor Yellow
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
}

# 2. Kill desktop-box.exe (Tauri app)
$tauriProc = Get-Process desktop-box -ErrorAction SilentlyContinue
if ($tauriProc) {
    Write-Host "  Stopping desktop-box.exe" -ForegroundColor Yellow
    $tauriProc | Stop-Process -Force
}

# 3. Kill node processes related to desktopBox/vite/tauri
$nodeProcs = Get-Process node -ErrorAction SilentlyContinue
foreach ($proc in $nodeProcs) {
    try {
        $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
        if ($cmdLine -match "desktopBox|vite|tauri") {
            Write-Host "  Stopping node process (PID: $($proc.Id))" -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # Ignore permission errors for system processes
    }
}

# 4. Wait and verify port is free
Start-Sleep -Seconds 1
$stillUsed = netstat -ano | Select-String ":1420 " | Select-String "LISTENING"
if (-not $stillUsed) {
    Write-Host "[desktopBox] Done - port 1420 is free." -ForegroundColor Green
} else {
    $parts = $stillUsed.Line.Trim() -split '\s+'
    $pid = $parts[-1]
    Write-Host "[desktopBox] WARNING: port 1420 still in use by PID: $pid" -ForegroundColor Red
}
