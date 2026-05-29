import { useEffect, useRef } from "react";

const TYPE_COLORS = {
  info:    "#94A3B8",
  success: "#34D399",
  error:   "#F87171",
  data:    "#A78BFA",
  warn:    "#FCD34D",
};

export default function LogTerminal({ logs = [], maxHeight = 220 }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div style={{
      background: "#020408", border: "1px solid #0D1117", borderRadius: 8,
      padding: "10px 12px", maxHeight, overflowY: "auto",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    }}>
      {logs.length === 0 && (
        <div style={{ fontSize: 11, color: "#1E293B", fontStyle: "italic" }}>
          En attente d'exécution…
        </div>
      )}
      {logs.map((l, i) => (
        <div key={i} style={{ fontSize: 11, lineHeight: 1.7, display: "flex", gap: 8 }}>
          <span style={{ color: "#1E293B", flexShrink: 0, userSelect: "none" }}>
            [{l.ts}]
          </span>
          <span style={{ color: TYPE_COLORS[l.type] || TYPE_COLORS.info }}>
            {l.msg}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
