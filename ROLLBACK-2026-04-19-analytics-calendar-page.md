## Cambio

Agregar acceso desde `/analytics` a una nueva vista calendario mensual de costos por agente.

## Backup creado antes del cambio

- Backup dir: `backup-db/analytics-calendar-20260419-093441`
- Archivo respaldado: `client/src/pages/AnalyticsPage.tsx`
- Hash original: `C80655B90AA7EBDFBE303639D9F4010CBC826C0AE7AF708EB045A73E8FF88F88`
- Hash backup: `C80655B90AA7EBDFBE303639D9F4010CBC826C0AE7AF708EB045A73E8FF88F88`
- Archivo respaldado: `client/src/App.tsx`
- Hash original: `1039A9EC188A5624971EE73B59BFFA71FDD9BFB4647BCD3ED0E44ECA29A2421F`
- Hash backup: `1039A9EC188A5624971EE73B59BFFA71FDD9BFB4647BCD3ED0E44ECA29A2421F`

## Archivos previstos a modificar

- `client/src/App.tsx`
- `client/src/pages/AnalyticsPage.tsx`
- `client/src/pages/AnalyticsCalendarPage.tsx` (nuevo)

## Señales de problema

- el botón nuevo de `/analytics` no navega
- la ruta nueva da 404
- el calendario no respeta el filtro de agentes
- los totales globales por día no coinciden con la suma visible
- la página actual `/analytics` deja de cargar

## Rollback rápido

1. Restaurar archivos modificados:

```powershell
Copy-Item -LiteralPath "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\backup-db\analytics-calendar-20260419-093441\AnalyticsPage.tsx.bak" -Destination "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\client\src\pages\AnalyticsPage.tsx" -Force
Copy-Item -LiteralPath "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\backup-db\analytics-calendar-20260419-093441\App.tsx.bak" -Destination "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\client\src\App.tsx" -Force
Remove-Item -LiteralPath "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\client\src\pages\AnalyticsCalendarPage.tsx" -Force
```

2. Verificar hashes restaurados:

```powershell
(Get-FileHash -Algorithm SHA256 "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\client\src\pages\AnalyticsPage.tsx").Hash
(Get-FileHash -Algorithm SHA256 "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\client\src\App.tsx").Hash
```

Resultados esperados:

- `C80655B90AA7EBDFBE303639D9F4010CBC826C0AE7AF708EB045A73E8FF88F88`
- `1039A9EC188A5624971EE73B59BFFA71FDD9BFB4647BCD3ED0E44ECA29A2421F`

3. Reiniciar la app si estaba corriendo.

## Nota

Este rollback elimina la nueva página calendario y devuelve la navegación y la página `/analytics` a su estado previo.
