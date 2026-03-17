# Rollback 2026-03-17 - Push click focus hardening

## Cambios incluidos
- `client/public/OneSignalSDKWorker.js`
- `client/index.html`
- `server/routes.ts`

## Objetivo del cambio
- Evitar recarga completa/splash al tocar push cuando la PWA ya esta abierta.
- Mantener entrega de notificaciones (admin/agentes) sin cambios.
- Evitar mismatch de origen en `url` push (ahora relativa).

## Rollback rapido
1. Identifica el commit:
   - `git log --oneline -n 10`
2. Revertir:
   - `git revert <commit_sha>`
3. Subir:
   - `git push origin main`

## Rollback manual por archivos
- Restaurar archivos al estado previo:
  - `git checkout <sha_previo> -- client/public/OneSignalSDKWorker.js client/index.html server/routes.ts`
- Commit + push:
  - `git commit -m "Rollback push click focus hardening"`
  - `git push origin main`
