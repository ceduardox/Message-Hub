## Cambio

Convertir la vista `analytics/calendar` de mensual a rango libre:
- filtro `desde / hasta`
- soporte para rangos que cruzan meses
- render de uno o varios calendarios segun el rango

## Backup creado antes del cambio

- Backup dir: `backup-db/analytics-calendar-range-20260419-193236`
- Archivo respaldado: `client/src/pages/AnalyticsCalendarPage.tsx`
- Hash original: `6B442ED50F16C6A452ED831293A3BD85DF740DF67476DA630784732FEDFB838B`
- Hash backup: `6B442ED50F16C6A452ED831293A3BD85DF740DF67476DA630784732FEDFB838B`

## Archivo previsto a modificar

- `client/src/pages/AnalyticsCalendarPage.tsx`

## Señales de problema

- el calendario solo muestra un mes aunque el rango cruce de mes
- el rango se invierte y no corrige `desde/hasta`
- el total diario no coincide con la suma visible
- se muestran datos en dias fuera del rango
- `/analytics/calendar` deja de compilar

## Rollback rápido

1. Restaurar el archivo:

```powershell
Copy-Item -LiteralPath "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\backup-db\analytics-calendar-range-20260419-193236\AnalyticsCalendarPage.tsx.bak" -Destination "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\client\src\pages\AnalyticsCalendarPage.tsx" -Force
```

2. Verificar hash restaurado:

```powershell
(Get-FileHash -Algorithm SHA256 "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\client\src\pages\AnalyticsCalendarPage.tsx").Hash
```

Resultado esperado:

- `6B442ED50F16C6A452ED831293A3BD85DF740DF67476DA630784732FEDFB838B`

3. Reiniciar la app si estaba corriendo.

## Nota

Este rollback devuelve solo la pagina calendario a la version previa mensual. No toca `App.tsx` ni `AnalyticsPage.tsx`.
