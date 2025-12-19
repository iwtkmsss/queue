# URLs по мониторам
$url1 = 'https://line.tec4.kiev.ua/show'  # первый монитор
$url2 = 'https://line.tec4.kiev.ua/queue'   # второй монитор

# Находим chrome.exe
$chromePath = @(
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chromePath) {
  Write-Error "Chrome not found. Install Chrome or set the path manually."
  exit 1
}

# Мониторы
Add-Type -AssemblyName System.Windows.Forms
# сортируем по X, чтобы [0] был левый, [1] правый
$screens = [System.Windows.Forms.Screen]::AllScreens | Sort-Object { $_.Bounds.X }
if ($screens.Count -lt 2) {
  Write-Error "Detected only $($screens.Count) monitor(s). Connect two displays."
  exit 1
}

function Start-ChromeKiosk {
  param(
    [Parameter(Mandatory = $true)] $screen,
    [Parameter(Mandatory = $true)] [string] $userDataDir,
    [Parameter(Mandatory = $true)] [string] $url
  )

  $pos = $screen.Bounds

  if (-not (Test-Path $userDataDir)) {
    New-Item -ItemType Directory -Force -Path $userDataDir | Out-Null
  }

  $chromeArgs = @(
    "--kiosk"
    "--user-data-dir=""$userDataDir"""
    "--window-position=$($pos.X),$($pos.Y)"
    "--window-size=$($pos.Width),$($pos.Height)"
    "--autoplay-policy=no-user-gesture-required"
    "--no-first-run"
    "--no-default-browser-check"
    "--no-proxy-server"
    "--app=$url"
  )

  Start-Process -FilePath $chromePath -ArgumentList $chromeArgs
}

# Корень для профилей (не во временной папке, чтобы не слетало)
$profilesRoot = Join-Path $env:LOCALAPPDATA "ChromeKioskProfiles"

# Первый монитор – профиль kiosk-1
Start-ChromeKiosk -screen $screens[0] -userDataDir (Join-Path $profilesRoot "kiosk-1") -url $url1
Start-Sleep -Seconds 2
# Второй монитор – профиль kiosk-2
Start-ChromeKiosk -screen $screens[1] -userDataDir (Join-Path $profilesRoot "kiosk-2") -url $url2

Write-Host "Launched two Chrome kiosk windows with separate profiles and URLs."
