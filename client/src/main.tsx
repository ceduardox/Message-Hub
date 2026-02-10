import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

const splash = document.getElementById("splash");
if (splash) {
  splash.classList.add("hide");
  setTimeout(() => splash.remove(), 400);
}
