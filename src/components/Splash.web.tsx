import React from "react";

// Solo web: usa <div>/<img> del DOM directo (no primitivas de React Native),
// así que este archivo se resuelve exclusivamente en el build web (sufijo
// `.web.tsx`). Splash.tsx es el fallback para iOS/Android — no renderiza nada.

const KEYFRAMES = `
@keyframes son-splash-mark{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}
@keyframes son-splash-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes son-splash-glow{0%{opacity:0;transform:scale(.7)}40%{opacity:1}100%{opacity:.75;transform:scale(1)}}
@keyframes son-splash-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
`;

type SplashPhase = "in" | "out" | "gone";

interface SplashProps {
  duration?: number;
  name?: string;
  tagline?: string;
  logoSrc?: string;
  onDone?: () => void;
  mode?: "cover" | "static";
}

export function Splash({
  duration = 2000,
  name = "Sonópolis",
  tagline = "Música viva, ciudad viva",
  logoSrc = "/logo.png",
  onDone,
  mode = "cover",
}: SplashProps) {
  const [phase, setPhase] = React.useState<SplashPhase>("in");

  React.useEffect(() => {
    if (mode === "static") return;
    const t1 = setTimeout(() => setPhase("out"), duration);
    const t2 = setTimeout(() => {
      setPhase("gone");
      onDone && onDone();
    }, duration + 520);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [duration, mode, onDone]);

  if (phase === "gone") return null;
  const out = phase === "out";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#08090A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        overflow: "hidden",
        fontFamily: '"Instrument Sans", system-ui, sans-serif',
        opacity: out ? 0 : 1,
        transform: out ? "scale(1.04)" : "scale(1)",
        transition: "opacity 500ms cubic-bezier(.4,0,.2,1), transform 500ms cubic-bezier(.4,0,.2,1)",
        pointerEvents: out ? "none" : "auto",
      }}
    >
      <style>{KEYFRAMES}</style>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 460,
          height: 460,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,233,0,0.16) 0%, rgba(255,233,0,0) 68%)",
          animation: "son-splash-glow 2.4s ease-out both",
        }}
      ></div>
      <div
        style={{
          position: "relative",
          width: 168,
          height: 168,
          borderRadius: "50%",
          background: "#F6F5F4",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          animation: "son-splash-mark 900ms cubic-bezier(.16,1,.3,1) both",
        }}
      >
        <img src={logoSrc} alt={name} style={{ width: 176, height: 176, objectFit: "cover", display: "block" }} />
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div
          style={{
            fontFamily: '"Fraunces", Georgia, serif',
            fontVariationSettings: '"SOFT" 0,"WONK" 1,"opsz" 72',
            fontWeight: 600,
            fontSize: 40,
            lineHeight: 1,
            color: "#FFFFFF",
            letterSpacing: "-0.02em",
            animation: "son-splash-rise 700ms cubic-bezier(.16,1,.3,1) 240ms both",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#FFE900",
            animation: "son-splash-rise 700ms cubic-bezier(.16,1,.3,1) 400ms both",
          }}
        >
          {tagline}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 56, width: 92, height: 2, background: "#26282B", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            background: "#FFE900",
            transformOrigin: "left",
            animation: `son-splash-bar ${duration}ms cubic-bezier(.5,0,.3,1) both`,
          }}
        ></div>
      </div>
    </div>
  );
}
