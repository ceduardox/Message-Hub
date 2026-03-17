function extractConversationIdFromNotification(notification) {
  const data = notification?.data || {};
  const custom = data?.custom || {};
  const additional = custom?.a || {};
  const candidate = data?.conversationId || additional?.conversationId;
  const id = Number(candidate);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function extractTargetUrlFromNotification(notification, conversationId) {
  const data = notification?.data || {};
  const custom = data?.custom || {};
  const additional = custom?.a || {};
  const rawUrl =
    data?.url ||
    data?.deep_link ||
    custom?.u ||
    additional?.url ||
    "";

  if (rawUrl) {
    return new URL(rawUrl, self.location.origin).toString();
  }

  if (conversationId) {
    return new URL(`/?conversationId=${conversationId}`, self.location.origin).toString();
  }

  return new URL("/", self.location.origin).toString();
}

self.addEventListener("notificationclick", (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  event.notification?.close?.();

  const conversationId = extractConversationIdFromNotification(event.notification);
  const resolvedUrl = extractTargetUrlFromNotification(event.notification, conversationId);

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const sameOriginClient = windowClients.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (sameOriginClient) {
        await sameOriginClient.focus();
        sameOriginClient.postMessage({
          type: "RYZ_OPEN_CONVERSATION",
          url: resolvedUrl,
          conversationId,
          source: "onesignal-notification-click",
        });
        return;
      }

      await clients.openWindow(resolvedUrl);
    })(),
  );
});

importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
