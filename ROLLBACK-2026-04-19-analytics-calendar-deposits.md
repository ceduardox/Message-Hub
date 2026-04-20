# Rollback analytics calendar deposits

Fecha: 2026-04-19

## Backup

- Carpeta: `backup-db/analytics-calendar-deposits-20260419-203921/`
- Archivo: `server.routes.ts.bak`
  - SHA256: `550B832D73BD46CE5F34C1E4FFA701BE97DEDCA74B5FABA9D9C3368816D40D99`
- Archivo: `AnalyticsCalendarPage.tsx.bak`
  - SHA256: `3435BF0678C7256FBC04F527DCC9B484A657194FDCC189255AF86952BCE03E34`

## Archivos tocados

- `server/routes.ts`
- `client/src/pages/AnalyticsCalendarPage.tsx`

## Restauracion rapida

```powershell
Copy-Item "backup-db/analytics-calendar-deposits-20260419-203921/server.routes.ts.bak" "server/routes.ts" -Force
Copy-Item "backup-db/analytics-calendar-deposits-20260419-203921/AnalyticsCalendarPage.tsx.bak" "client/src/pages/AnalyticsCalendarPage.tsx" -Force
npm.cmd run check
```

## Cambio funcional revertido

- Elimina la persistencia de depositos del calendario.
- Quita el boton flotante y el modal de depositos.
- Devuelve la vista calendario al comportamiento anterior, solo con costos.

## Nota sobre base de datos

Este cambio crea y usa la tabla `analytics_deposits` de forma no destructiva.
Si se revierte solo el codigo, la tabla puede quedar en la BD sin afectar el sistema.
No es necesario borrarla para restaurar el comportamiento anterior.
