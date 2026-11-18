import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "../i18n";

interface Props {
  title: ReactNode;
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}

/**
 * Dialog with Escape-to-close, focus moved in on open and restored on
 * close, and Tab kept inside. Becomes a bottom sheet on phones (CSS).
 */
export default function Modal({ title, label, onClose, children, wide, className }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[autofocus], input, textarea, select, button:not(.modal-x)");
    (first ?? el)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === "Tab" && el) {
        const f = Array.from(
          el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter((n) => !n.hasAttribute("disabled"));
        if (f.length === 0) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`modal ${wide ? "modal-wide" : ""} ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-small btn-ghost modal-x" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
