import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

const splash = document.getElementById("splash");
if (splash) {
  splash.classList.add("hide");
  const fastConversationLaunch =
    typeof window !== "undefined" &&
    Boolean((window as typeof window & { __FAST_CONVERSATION_LAUNCH__?: boolean }).__FAST_CONVERSATION_LAUNCH__);
  setTimeout(() => splash.remove(), fastConversationLaunch ? 0 : 400);
}
