# Agente institucional para Windows

Este agente envía una señal periódica al panel y recibe únicamente comandos permitidos. No captura teclado, cámara, micrófono, documentos personales ni historial de navegación.

## Instalación

1. En **Gestión → Notebooks**, registra el equipo.
2. Pulsa **Token agente** y copia la credencial mostrada una sola vez.
3. Copia esta carpeta al notebook.
4. Abre PowerShell como administrador y ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1 `
  -PanelUrl "https://control-acceso-panel.vercel.app" `
  -NotebookId "NB-SALA-41" `
  -Token "TOKEN_GENERADO_EN_EL_PANEL"
```

El agente queda como tarea programada del sistema y se reinicia automáticamente. Requiere Python 3 instalado.

## Integración con el kiosco

Las órdenes se guardan como archivos JSON en:

```text
C:\ProgramData\ControlAccesoAgent\signals
```

El kiosco puede observar esa carpeta para reaccionar a `unlock.json`, `close_session.json`, `exam_active.json`, etc. No se permite ejecutar comandos de shell enviados por internet.

## Equipo perdido o robado

Al marcarlo en el panel, la próxima conexión a internet crea una incidencia crítica con fecha, hora, IP pública aproximada, red informada y hostname. Una IP pública no entrega una dirección física exacta.
