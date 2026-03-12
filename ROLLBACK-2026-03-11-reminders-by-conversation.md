# Rollback Plan - 2026-03-11 (Recordatorios por Conversación)

## Solicitud
"Implementar recordatorios con fecha (editar/eliminar) desde el flujo de etiquetas, sin desconfigurar nada".

## Cambios aplicados
1. Se agregaron campos de recordatorio a `conversations`:
- `reminder_at`
- `reminder_note`
- `reminder_updated_at`

2. Se agregaron endpoints:
- `PATCH /api/conversations/:id/reminder` (crear/editar)
- `DELETE /api/conversations/:id/reminder` (eliminar)

3. UI:
- Menú de etiqueta en Chat: `Agregar/Editar recordatorio` + `Eliminar recordatorio`.
- Modal con fecha/hora y nota.
- Badge de recordatorio visible en header del chat y en card de Kanban.

4. Seguridad de despliegue:
- Auto-compatibilidad en runtime: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para evitar caída si no se ejecuta migración manual.

## Archivos modificados
- `shared/schema.ts`
- `server/storage.ts`
- `server/routes.ts`
- `client/src/components/ChatArea.tsx`
- `client/src/components/KanbanView.tsx`

## Verificación rápida
1. Abrir un chat y en menú de etiqueta crear recordatorio.
2. Ver badge con fecha en header del chat.
3. Ver badge en card del Kanban.
4. Editar recordatorio y confirmar cambio.
5. Eliminar recordatorio y confirmar que desaparece en chat/kanban.

## Rollback
### Opción A (si ya está en Git)
1. `git log --oneline -n 10`
2. `git revert <SHA_DEL_CAMBIO>`
3. `git push origin main`

### Opción B (local por archivos)
1. Restaurar:
- `shared/schema.ts`
- `server/storage.ts`
- `server/routes.ts`
- `client/src/components/ChatArea.tsx`
- `client/src/components/KanbanView.tsx`
2. Comando: `git checkout <SHA_PREVIO> -- <archivo>`

## Señales para rollback inmediato
- Error 500 al abrir conversaciones.
- Menú de etiqueta no abre o no guarda.
- Badge de recordatorio se muestra mal o no se elimina.
