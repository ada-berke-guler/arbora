import { useEffect, useRef, useState } from "react";
import { subscribeToast, subscribeUndo, type UndoPayload } from "../lib/undoBus";
import { useI18n } from "../i18n";

const UNDO_MS = 6000;
const PLAIN_MS = 3200;
const MAX = 4;

type Item = (UndoPayload & { id: number; kind: "undo" }) | { id: number; kind: "plain"; message: string };

/** The single toast host. Undo toasts stack (up to 4), each on its own timer. */
export default function Toasts() {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(1);

  useEffect(() => {
    const push = (it: Item, ms: number) => {
      setItems((l) => [...l, it].slice(-MAX));
      window.setTimeout(() => setItems((l) => l.filter((i) => i.id !== it.id)), ms);
    };
    const a = subscribeUndo((p) => push({ ...p, id: next.current++, kind: "undo" }, UNDO_MS));
    const b = subscribeToast((message) => push({ id: next.current++, kind: "plain", message }, PLAIN_MS));
    return () => {
      a();
      b();
    };
  }, []);

  return (
    <div className="toast-stack" aria-live="polite">
      {items.map((it) => (
        <div key={it.id} className={`toast ${it.kind === "plain" ? "plain" : ""}`} role="status">
          <span>{it.message}</span>
          {it.kind === "undo" && (
            <button
              className="btn btn-small btn-primary"
              onClick={() => {
                it.undo();
                setItems((l) => l.filter((i) => i.id !== it.id));
              }}
            >
              {t("common.undo")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
