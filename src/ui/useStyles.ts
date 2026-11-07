import { useEffect } from "react";
import css from "./styles.css";

const ID = "paperclip-overlord-styles";

export function useStyles() {
  useEffect(() => {
    if (document.getElementById(ID)) return;
    const style = document.createElement("style");
    style.id = ID;
    style.textContent = css;
    document.head.append(style);
  }, []);
}
