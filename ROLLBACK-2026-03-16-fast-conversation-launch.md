## Rollback: Fast Launch al abrir chat desde push

Fecha: 2026-03-16

### Objetivo del cambio
- Reducir el splash inicial cuando la app se abre con `?conversationId=...`.
- Mejorar la sensacion de apertura directa al chat desde una notificacion push.

### Archivos tocados
- `client/index.html`
- `client/src/main.tsx`

### Que hace
- Si la URL trae `conversationId`, agrega la clase `fast-conversation-launch` antes de renderizar la app.
- Esa clase oculta el splash desde el primer paint.
- En `main.tsx`, el splash se elimina inmediatamente en ese caso.

### Rollback seguro
1. Quitar en `client/index.html`:
   - la regla CSS `html.fast-conversation-launch #splash`
   - el script que define `window.__FAST_CONVERSATION_LAUNCH__`
2. Restaurar en `client/src/main.tsx`:
   - `setTimeout(() => splash.remove(), 400);`

### Riesgo
- Bajo.
- No toca push, backend, OneSignal ni la logica del chat.
