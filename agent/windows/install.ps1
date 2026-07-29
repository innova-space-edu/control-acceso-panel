param(
  [Parameter(Mandatory=$true)][string]$PanelUrl,
  [Parameter(Mandatory=$true)][string]$NotebookId,
  [Parameter(Mandatory=$true)][string]$Token,
  [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"
$Base = Join-Path $env:ProgramData "ControlAccesoAgent"
New-Item -ItemType Directory -Force -Path $Base | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Base "signals") | Out-Null
Copy-Item (Join-Path $PSScriptRoot "agent.py") (Join-Path $Base "agent.py") -Force

$config = @{
  panel_url = $PanelUrl.TrimEnd('/')
  notebook_id = $NotebookId
  token = $Token
  kiosk_processes = @("msedge.exe", "chrome.exe", "control-acceso-kiosk.exe")
} | ConvertTo-Json -Depth 4
$configPath = Join-Path $Base "config.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, $config, $utf8NoBom)

$pythonPath = (Get-Command $PythonExe).Source
$action = New-ScheduledTaskAction -Execute $pythonPath -Argument ('"{0}"' -f (Join-Path $Base "agent.py")) -WorkingDirectory $Base
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "ControlAccesoAgent" -Action $action -Trigger @($triggerStartup, $triggerLogon) -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName "ControlAccesoAgent"
Write-Host "Agente instalado en $Base para $NotebookId" -ForegroundColor Green
