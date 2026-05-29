import { useState, useEffect, useRef } from "react";
import { ENV } from "../config.js";

export default function PasswordModal({ onSuccess, onCancel }) {
  const [pwd,   setPwd]   = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    if (pwd === ENV.TRUE_PASSWORD) {
      onSuccess();
    } else {
      setError("Mot de passe incorrect. Réessaie.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPwd("");
      inputRef.current?.focus();
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#0F0F1A", border: "1px solid #2D2D40", borderRadius: 16,
        padding: "32px 28px", width: "100%", maxWidth: 380,
        animation: shake ? "shake 0.4s ease" : "none",
      }}>
        <style>{`
          @keyframes shake {
            0%,100% { transform: translateX(0); }
            20%,60%  { transform: translateX(-8px); }
            40%,80%  { transform: translateX(8px); }
          }
        `}</style>

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Accès sécurisé</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 6, lineHeight: 1.5 }}>
            Entrez le mot de passe défini dans la variable Railway{" "}
            <code style={{ color: "#A78BFA", fontSize: 11 }}>VITE_TRUE_PASSWORD</code>
          </div>
        </div>

        <input
          ref={inputRef}
          type="password"
          value={pwd}
          onChange={(e) => { setPwd(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Mot de passe…"
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10, fontSize: 14,
            background: "#1A1A28", border: `1px solid ${error ? "#EF4444" : "#2D2D40"}`,
            color: "#fff", outline: "none", fontFamily: "Inter, sans-serif",
          }}
        />
        {error && (
          <div style={{ fontSize: 11, color: "#EF4444", marginTop: 6 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "10px", borderRadius: 8, fontSize: 12, cursor: "pointer",
            background: "transparent", border: "1px solid #2D2D40", color: "#64748B",
          }}>
            Annuler
          </button>
          <button onClick={submit} style={{
            flex: 2, padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: "pointer", background: "#7C3AED", border: "none", color: "#fff",
          }}>
            Confirmer →
          </button>
        </div>
      </div>
    </div>
  );
}
