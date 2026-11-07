import { useRef, useState, type ReactNode } from "react";
import { usePluginAction, usePluginToast } from "@paperclipai/plugin-sdk/ui";

/** Draggable pixel panel. */
export function Panel({ title, onClose, className, initial, children, footer }: {
  title: ReactNode;
  onClose: () => void;
  className?: string;
  initial?: { x: number; y: number };
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [pos, setPos] = useState(initial ?? null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const style = pos ? { left: pos.x, top: pos.y, right: "auto", transform: "none" } : undefined;
  return (
    <section
      className={`ol-panel ol-root ${className ?? ""}`}
      style={style}
      role="dialog"
      aria-label={typeof title === "string" ? title : undefined}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <header
        onPointerDown={(e) => {
          // Capturing the pointer retargets the click away from the close button, so never drag from a button.
          if ((e.target as HTMLElement).closest("button")) return;
          const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({ x: Math.max(0, e.clientX - drag.current.dx), y: Math.max(0, e.clientY - drag.current.dy) });
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <h3>{title}</h3>
        <button className="ol-x" onClick={onClose} aria-label="Close">x</button>
      </header>
      <div className="ol-body">{children}</div>
      {footer && <div className="ol-actions">{footer}</div>}
    </section>
  );
}

/** Runs a worker action; on success the god hand whips the agent, on failure a toast explains why. */
export function useCommand(onWhip: (agentId: string) => void, after?: () => void) {
  const toast = usePluginToast();
  const actions = {
    reply: usePluginAction("reply"),
    "review-again": usePluginAction("review-again"),
    wake: usePluginAction("wake"),
    pause: usePluginAction("pause"),
    resume: usePluginAction("resume"),
    "decide-approval": usePluginAction("decide-approval"),
    "respond-interaction": usePluginAction("respond-interaction"),
  };
  const [busy, setBusy] = useState(false);
  async function run(key: keyof typeof actions, params: Record<string, unknown>, agentId: string | null, whip = true) {
    setBusy(true);
    try {
      await actions[key](params);
      if (agentId && whip) onWhip(agentId);
      after?.();
      return true;
    } catch (err) {
      toast({ title: "The slave resisted", body: err instanceof Error ? err.message : String(err), tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy };
}

/** Plain textarea fallback keeps the panel usable even if the host editor is unavailable. */
export function Composer({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="ol-editor">
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}
