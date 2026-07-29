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
- Reentrega de comandos hasta recibir confirmación de ejecución o fallo.
- Monitor de todos los notebooks, incluso sin sesión activa.
- Inventario ampliado: serie, código, marca, modelo, hostname, sistema, MAC, responsable y mantención.
- Estado de seguridad normal, observación, perdido o robado.
- Credencial individual por equipo y API segura para heartbeats.
- Agente Windows transparente y con lista cerrada de comandos.
- Detección de señal de un equipo marcado como perdido o robado.
- Supervisión cada cinco minutos mediante Supabase Cron, más una comprobación diaria de respaldo en Vercel.
- Acciones administrativas sensibles mediante rutas servidoras y `SUPABASE_SERVICE_ROLE_KEY`.
- Perfiles administrativos y políticas RLS, incluido el rol `solo_lectura` sin permisos de escritura.

## 1. Base de datos

Ejecutar en el SQL Editor de Supabase, respetando este orden:

```text
supabase/migrations/202607290001_control_central.sql
supabase/migrations/202607290002_security_and_delivery_hotfix.sql
supabase/migrations/202607290003_device_health_and_core_rls.sql
```

Las migraciones:

- conservan las tablas existentes;
- agregan campos a `notebooks` y `solicitudes_override`;
- crean las tablas centrales de eventos, incidencias, dispositivos y comandos;
- registran los usuarios existentes de `auth.users` como administradores iniciales;
- conectan las alertas antiguas con el centro de incidencias;
- instalan triggers de auditoría;
- activan Realtime para las tablas centrales;
- restringen las escrituras del rol `solo_lectura`;
- programan `procesar_salud_dispositivos()` cada cinco minutos con `pg_cron`.

Después de comprobar el funcionamiento, revisa los roles de `admin_profiles`. Solo un `superadmin` debe administrar perfiles y roles.

## 2. Variables de Vercel

Copiar `.env.example` a `.env.local` para desarrollo y configurar en Vercel:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AGENT_BOOTSTRAP_SECRET
CRON_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` nunca debe llevar el prefijo `NEXT_PUBLIC_`. Usa valores largos y distintos para `AGENT_BOOTSTRAP_SECRET` y `CRON_SECRET`.

## 3. Despliegue

```bash
npm install
npm run build
```

Subir el proyecto a Vercel. El archivo `vercel.json` ejecuta una comprobación diaria de respaldo compatible con el plan Hobby. La supervisión frecuente de cinco minutos se realiza dentro de Supabase mediante la migración `202607290003_device_health_and_core_rls.sql`.

Configura `CRON_SECRET` para proteger `/api/cron/device-health`. Si no existe, el endpoint responde con error y no ejecuta operaciones con la clave de servicio.

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

El instalador guarda `config.json` en UTF-8 sin BOM para mantener compatibilidad con Windows PowerShell 5.1 y Python.

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
- El rol `solo_lectura` puede consultar, pero no crear, editar ni eliminar estudiantes, docentes, notebooks, exámenes ni registros centrales.

## 7. Pruebas recomendadas

1. Ejecutar las tres migraciones y comprobar que el trabajo `control-acceso-device-health-5m` aparece en Supabase Cron.
2. Crear un notebook de prueba.
3. Generar e instalar su token.
4. Confirmar que aparece en línea en Monitor.
5. Enviar un desbloqueo y verificar `recibido` y `ejecutado`.
6. Interrumpir el agente después de recibir un comando y comprobar que el comando vuelve a entregarse hasta ser confirmado.
7. Marcar el equipo como robado, detener el agente y volverlo a iniciar.
8. Comprobar la incidencia crítica y el evento de conexión.
9. Crear un usuario `solo_lectura` y confirmar que no pueda modificar estudiantes, docentes, notebooks ni exámenes.
10. Exportar cada grupo de reportes.
11. Iniciar y cerrar un examen en una sala de prueba.
