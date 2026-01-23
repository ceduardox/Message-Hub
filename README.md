# WhatsApp Mini Inbox MVP

Esta aplicación es un "mini inbox" para recibir y enviar mensajes de WhatsApp usando la Cloud API.

## Configuración de Webhook en Meta

1.  Ve a tu [Meta Developer Console](https://developers.facebook.com/).
2.  En el producto **WhatsApp** > **Configuration**.
3.  **Callback URL**: `https://<tu-url-de-replit>.replit.app/webhook`
    *   *Nota: Reemplaza `<tu-url-de-replit>` con la URL pública de tu aplicación en Replit.*
4.  **Verify Token**: `ryztor_verify_2026`
5.  **Webhook fields**: Suscríbete a `messages` y `message_status`.

## Secrets (Variables de Entorno)

Debes configurar los siguientes Secrets en el panel de Replit (Tools > Secrets):

*   `META_ACCESS_TOKEN`: Tu token de acceso (User o System User) con permisos de `whatsapp_business_messaging`.
*   `WA_PHONE_NUMBER_ID`: `1003393019513022`
*   `WA_VERIFY_TOKEN`: `ryztor_verify_2026`
*   `ADMIN_USER`: `admin`
*   `ADMIN_PASS`: (Tu contraseña segura para el panel)
*   `APP_SECRET`: (Opcional, para validar payloads)
*   `SESSION_SECRET`: (Cualquier cadena larga y aleatoria para las sesiones)

## Uso

1.  Abre la aplicación web.
2.  Inicia sesión en `/login` con tu usuario y contraseña de admin.
3.  Verás la lista de conversaciones a la izquierda (se actualiza automáticamente cada 8 segundos).
4.  Selecciona una conversación para ver el historial y enviar mensajes.
