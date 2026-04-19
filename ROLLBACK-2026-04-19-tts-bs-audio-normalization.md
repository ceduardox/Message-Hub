## Cambio

Normalizacion de texto solo para TTS en respuestas de audio:
- expandir `Bs` a `bolivianos` solo en la version para voz
- evitar locucion de URLs
- mantener intacto el texto escrito que ve el cliente en WhatsApp

## Backup creado antes del cambio

- Archivo respaldado: `server/routes.ts`
- Backup exacto: `backup-db/tts-bs-fix-20260419-080337/server.routes.ts.bak`
- Hash SHA256 original: `EA268ADE7277BC5B0CA7D3BEEF798C8A45739EB0F28DD1D5A12F4762F5D292BB`
- Hash SHA256 backup: `EA268ADE7277BC5B0CA7D3BEEF798C8A45739EB0F28DD1D5A12F4762F5D292BB`

## Alcance previsto

Solo debe modificarse `server/routes.ts`.

No debe cambiar:
- `PROMT ULTIMO.txt`
- logs
- configuracion de proveedor TTS
- texto persistido de mensajes
- texto enviado como mensaje escrito

## Senales de que algo se desconfiguro

- el cliente empieza a ver `bolivianos` escrito en lugar de `Bs`
- el TTS deja de enviar audio y cae a texto
- la voz lee tokens como `[BOTONES]`, `[LISTA]` o URLs
- cambios inesperados en mensajes no-audio

## Rollback rapido

1. Restaurar el archivo:

```powershell
Copy-Item -LiteralPath "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\backup-db\tts-bs-fix-20260419-080337\server.routes.ts.bak" -Destination "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\server\routes.ts" -Force
```

2. Verificar hash restaurado:

```powershell
(Get-FileHash -Algorithm SHA256 "G:\ALEJANDRO CELIS\CRM WP\Message-Hub\server\routes.ts").Hash
```

Resultado esperado:

`EA268ADE7277BC5B0CA7D3BEEF798C8A45739EB0F28DD1D5A12F4762F5D292BB`

3. Reiniciar el proceso de la app si el servidor estaba corriendo.

## Reparacion dirigida si falla solo TTS

Si el problema aparece solo en audio:
- revisar la funcion de normalizacion TTS agregada en `server/routes.ts`
- confirmar que `sendAudioResponse(...)` sigue recibiendo el texto para voz y no el texto visible
- confirmar que `storage.createMessage(...)` y `lastMessage` sigan guardando `aiResult.response`

## Nota

Este rollback devuelve exactamente el archivo previo al cambio. No toca ningun otro archivo del proyecto.
