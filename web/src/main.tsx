import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { registerServiceWorker } from "./registerServiceWorker";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);

void registerServiceWorker();
