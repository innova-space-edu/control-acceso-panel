$Base = Join-Path $env:ProgramData "ControlAccesoAgent"
Unregister-ScheduledTask -TaskName "ControlAccesoAgent" -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item $Base -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Agente eliminado" -ForegroundColor Yellow
