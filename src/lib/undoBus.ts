/** App-wide "Removed · Undo" toast bus. Safe no-op with no host mounted. */
export interface UndoPayload {
  message: string;
  undo: () => void;
}

let listener: ((p: UndoPayload) => void) | null = null;

export function showUndo(p: UndoPayload): void {
  listener?.(p);
}

export function subscribeUndo(fn: (p: UndoPayload) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Plain status toasts ("Backup exported"). */
let toastListener: ((msg: string) => void) | null = null;
export function showToast(msg: string): void {
  toastListener?.(msg);
}
export function subscribeToast(fn: (msg: string) => void): () => void {
  toastListener = fn;
  return () => {
    if (toastListener === fn) toastListener = null;
  };
}
