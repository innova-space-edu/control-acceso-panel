# Control de Acceso Escolar · Versión 2.0

La versión 2 convierte el panel en un centro integrado de operación, auditoría, incidencias y seguridad de dispositivos.

## Implementado

- Registro central `eventos_sistema` para actividad de toda la plataforma.
- Incidencias con severidad, estado, responsable, seguimiento y resolución obligatoria.
- Historial global con filtros, paginación y detalle JSON.
- Reportes de auditoría, administración, accesos, fallas, uso, incidencias, desbloqueos, comandos, dispositivos y exámenes.
- Exportación Excel y CSV; la vista de reportes se puede imprimir o guardar como PDF desde el navegador.
- Desbloqueo individual, por selección y de todos los pendientes.
- Comandos remotos con estados: pendiente, enviado, recibido, ejecutado, fallido, expirado y cancelado.
- Monitor de todos los notebooks, incluso sin sesión activa.
- Inventario ampliado: serie, código, marca, modelo, hostname, sistema, MAC, responsable y mantención.
- Estado de seguridad normal, observación, perdido o robado.
- Credencial individual por equipo y API segura para heartbeats.
- Agente Windows transparente y con lista cerrada de comandos.
- Detección de señal de un equipo marcado como perdido o robado.
- Tarea programada para detectar equipos sin señal y comandos expirados.
- Acciones administrativas realizadas mediante rutas servidoras y `SUPABASE_SERVICE_ROLE_KEY`.
- Perfiles de administrador y políticas RLS para las tablas nuevas.

## 1. Base de datos

Ejecutar en el SQL Editor de Supabase:

```text
supabase/migrations/202607290001_control_central.sql
```

La migración es idempotente y:

- conserva las tablas existentes;
- agrega campos a `notebooks` y `solicitudes_override`;
- crea tablas nuevas;
- registra los usuarios de `auth.users` existentes como administradores iniciales;
- conecta las alertas antiguas con el nuevo centro de incidencias;
- instala triggers de auditoría;
- activa Realtime para las tablas centrales.

Después de comprobar el funcionamiento, cambia los roles de `admin_profiles` según corresponda.

## 2. Variables de Vercel

Copiar `.env.example` a `.env.local` para desarrollo y configurar en Vercel:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` nunca debe llevar el prefijo `NEXT_PUBLIC_`.

## 3. Despliegue

```bash
npm install
npm run build
```

Subir el proyecto a Vercel. `vercel.json` programa `/api/cron/device-health` cada cinco minutos. Configura `CRON_SECRET` para proteger la ejecución.

## 4. Agente de notebooks

La carpeta `agent/windows` contiene:

- `agent.py`
- `install.ps1`
- `uninstall.ps1`
- instrucciones específicas

En Gestión → Notebooks:

1. registrar o editar el equipo;
2. pulsar **Token agente**;
3. copiar el token mostrado una sola vez;
4. ejecutar el instalador de PowerShell en el notebook.

El agente no contiene ejecución remota arbitraria. Los únicos comandos aceptados están declarados en `execute_command()`.

## 5. Integración con el kiosco

El agente escribe señales JSON en:

```text
C:\ProgramData\ControlAccesoAgent\signals
```

El kiosco debe observar esta carpeta para aplicar el desbloqueo, cierre de sesión o modo examen. Esto permite conservar compatibilidad con el mecanismo actual basado en Supabase mientras se migra gradualmente a confirmaciones reales.

## 6. Seguridad y privacidad

- El seguimiento se limita a equipos institucionales administrados.
- No se capturan teclas, cámara, micrófono, documentos ni navegación.
- La IP pública es aproximada y no identifica por sí sola una dirección física.
- Las acciones sensibles requieren motivo y quedan auditadas.
- Los tokens de los agentes se almacenan con SHA-256 y solo se muestran una vez.
- Los reportes con RUT e IP deben quedar restringidos a personal autorizado.

## 7. Pruebas recomendadas

1. Crear un notebook de prueba.
2. Generar e instalar su token.
3. Confirmar que aparece en línea en Monitor.
4. Enviar un desbloqueo y verificar `recibido` y `ejecutado`.
5. Marcarlo como robado, detener el agente y volverlo a iniciar.
6. Comprobar la incidencia crítica y el evento de conexión.
7. Crear, editar y eliminar un registro de prueba y revisar Auditoría.
8. Exportar cada grupo de reportes.
9. Iniciar y cerrar un examen en una sala de prueba.
