# Launch two Chrome kiosk windows on the first two monitors with separate URLs.
$url1 = 'https://example.com'  # first monitor
$url2 = 'https://example.org'  # second monitor

# Resolve Chrome path (common install locations).
$chromePath = @(
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chromePath) {
  Write-Error "Chrome not found. Install Chrome or set the path manually."
  exit 1
}

# Need at least two monitors.
Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
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

  $args = @(
    "--kiosk"
    "--new-window"
    "--user-data-dir=""$userDataDir"""
    "--window-position=$($pos.X),$($pos.Y)"
    "--window-size=$($pos.Width),$($pos.Height)"
    "--autoplay-policy=no-user-gesture-required"
    "--disable-features=TranslateUI,GlobalMediaControls"
    "--no-first-run"
    "--disable-infobars"
    "--disable-notifications"
    "--disable-session-crashed-bubble"
    "--app=$url"
  )

  Start-Process -FilePath $chromePath -ArgumentList $args -WindowStyle Hidden
}

# Launch on the first two monitors with distinct URLs.
$profilesRoot = Join-Path $env:TEMP "chrome-kiosk-profiles"
Start-ChromeKiosk -screen $screens[0] -userDataDir (Join-Path $profilesRoot "kiosk-1") -url $url1
Start-ChromeKiosk -screen $screens[1] -userDataDir (Join-Path $profilesRoot "kiosk-2") -url $url2

Write-Host "Launched two Chrome kiosk windows with separate URLs."
