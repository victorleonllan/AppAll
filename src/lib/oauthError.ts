// Lee el error que Supabase agrega como query param al volver del login con
// Google cuando el intercambio falla (state expirado, cancelado, etc. — ver
// AuthContext.tsx signInWithGoogle). Solo aplica a web: en nativo el flujo
// nunca deja al usuario parado sobre una URL con query params.
export function getOAuthErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  if (!params.get("error")) return null;

  return params.get("error_description")?.replace(/\+/g, " ") ?? params.get("error");
}
