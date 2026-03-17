import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const handleOpenConversationMessage = (conversationId: number) => {
  if (!Number.isInteger(conversationId) || conversationId <= 0) return;

  const params = new URLSearchParams(window.location.search);
  params.set("conversationId", String(conversationId));
  const nextUrl = `/?${params.toString()}`;
  const requiresRouteChange = window.location.pathname !== "/";
  const historyState = window.history.state;

  if (requiresRouteChange) {
    window.history.pushState(historyState, "", nextUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } else {
    window.history.replaceState(historyState, "", nextUrl);
  }

  window.dispatchEvent(new CustomEvent("ryz:open-conversation", { detail: { conversationId } }));
};

const parseConversationIdFromUrl = (url: string | null | undefined): number | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    const raw = parsed.searchParams.get("conversationId");
    if (!raw) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

if (typeof navigator !== "undefined" && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: string; conversationId?: number | null; url?: string } | undefined;
    if (data?.type !== "RYZ_OPEN_CONVERSATION") return;
    const conversationId =
      typeof data.conversationId === "number" ? data.conversationId : parseConversationIdFromUrl(data?.url);
    if (typeof conversationId !== "number") return;
    handleOpenConversationMessage(conversationId);
  });
}

createRoot(document.getElementById("root")!).render(<App />);

const splash = document.getElementById("splash");
if (splash) {
  splash.classList.add("hide");
  const fastConversationLaunch =
    typeof window !== "undefined" &&
    Boolean((window as typeof window & { __FAST_CONVERSATION_LAUNCH__?: boolean }).__FAST_CONVERSATION_LAUNCH__);
  setTimeout(() => splash.remove(), fastConversationLaunch ? 0 : 400);
}
