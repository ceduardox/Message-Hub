# Rollback: Kanban Agent Filter (UI only)

Fecha: 2026-04-07
Alcance: filtro visual por agente en Kanban (sin cambios de backend ni BD).

## Si falla o no te gusta

1. Identifica el commit de este cambio:
   - `git log --oneline -n 5`
2. Revierte ese commit:
   - `git revert --no-edit <commit_sha>`
3. Sube la reversión:
   - `git push origin main`

## Verificación rápida post-rollback

1. Inbox/Kanban vuelve a mostrar todos los chats sin selector por agente.
2. No cambia la lógica de asignación de chats.
3. No hay impacto en Analytics.
