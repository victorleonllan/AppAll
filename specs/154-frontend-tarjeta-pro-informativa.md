# Spec 154 — Tarjeta «Sonópolis Pro» informativa en los paneles de local y de músico

> Estado: aplicado (29-oct-2026) — `tsc` limpio en los archivos del spec, export web limpio, criterio 6 (grep) sin salida y criterio 4 verificado con un script sobre `src/lib/pro.ts` en hora de Chile (30 días, 3 días, 1 día, `9999-12-31`). Pendientes en dispositivo: 3, 5, 7 y V-candidata 154-a
> Capa: FRONTEND. `src/components/TarjetaPro.tsx` (nuevo), `src/screens/DashboardLocalScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`.
> Depende de: spec 148
> Hermano en la web: `components/CardSonopolisPro.js` (W-052, W-186, W-222, W-243).

> **En una frase:** el panel del local y el del músico muestran una tarjeta que dice si la
> cuenta tiene Sonópolis Pro, hasta cuándo y si vence pronto, sin precio, sin botón de
> compra y sin ningún llamado a comprar o renovar fuera de la app.

## Contexto

La web pone `CardSonopolisPro` en `/local` y `/musico`
(`app/(private)/local/page.js:315`, `app/(private)/musico/page.js:107`). La app no muestra
Pro en ningún lado: sin esto, quien tiene Pro no sabe por qué ve funciones nuevas en el 155
y el 156, y quien no lo tiene no sabe por qué no las ve.

**Qué se deja afuera de la tarjeta de la web, y por qué:** la decisión de producto es que
Pro no se vende en la app. Apple y Google exigen su compra integrada para desbloquear
funciones digitales, y prohíben dirigir a la persona a pagar por fuera desde la app. Por
eso no entra nada de esto, aunque la web lo tenga (`CardSonopolisPro.js:83-129`):

- el precio y «Se cobra cada mes…» (W-222);
- `BotonSuscribirmePro` (Mercado Pago);
- «Escríbenos a … para activarlo» y «… para renovarlo antes de que venza»: también son un
  llamado a comprar por fuera, solo que por correo.

**Qué pantalla es el panel de cada uno:** `DashboardLocalScreen` es la raíz de
`MiLocalStack` («Mi Local») y `PerfilMusicoScreen` es la raíz de `MusicoStack` («Mi
Perfil»): es el panel propio del músico, con su resumen, acciones y eventos
(`PerfilMusicoScreen.tsx:180-310`). El perfil público del músico es `VerMusicoScreen`, que
no se toca.

**Riesgo a revisar al publicar (no lo decide este spec):** la guía 3.1.3(b) de Apple pide
que lo que se desbloquea con una compra hecha en otra plataforma también se pueda comprar
dentro de la app. La tarjeta minimiza el riesgo (no menciona dónde ni cómo se compra), pero
la revisión de la tienda puede preguntar.

## Diseño

### `src/components/TarjetaPro.tsx` (nuevo)

```ts
interface Props {
  tenant: { sonopolisProHasta?: string | null };
  etiqueta: string;            // «tu local» | «tu banda», igual que `tenantLabel` de la web
  onVerContactos?: () => void; // el 155 lo pasa; sin él no se dibuja el enlace
}
```

Usa `esPro`, `esProSinVencimiento`, `diasRestantesPro` y `fechaHastaPro` del spec 148.
`porVencer = activo && dias !== null && dias <= 7`, la misma regla de la web.

Una tarjeta (`colors.cardBackground`, `borderRadius.lg`, borde `colors.border`) con:

1. **Título** «Sonópolis Pro» en negrita, y a su derecha, solo si `porVencer`, una
   etiqueta «VENCE PRONTO» (fondo `colors.warning`, texto blanco, `fontSize.xs`).
2. **Con Pro:**
   - Sin vencimiento → «Activo, sin fecha de vencimiento.»
   - Si no → «Activo hasta el {fechaHastaPro}.» y, si `porVencer`, «Activo hasta el
     {fecha} — quedan {dias} día(s).» con singular para 1.
   - Si viene `onVerContactos`: un `TouchableOpacity` con el texto «Ver tus contactos →»
     (color `colors.accent`, negrita).
   - Una línea: «Avisa a tus seguidores por WhatsApp desde la ficha de cada evento.» Es el
     equivalente del enlace «Avisar a tus seguidores desde un evento →» de la web, que en
     la app no tiene a dónde saltar: los eventos ya están listados en el mismo panel.
3. **Sin Pro:**
   - «Con Sonópolis Pro ves en un solo lugar a tu público: quienes compran entradas para
     {etiqueta}, quienes te siguen y quienes dejan su WhatsApp.»
   - «Tu cuenta no tiene Sonópolis Pro activo.» (color `colors.muted`).
   - Nada más: sin botón, sin enlace, sin correo de contacto.

No hay estado ni llamadas: la tarjeta solo lee el tenant que le pasan.

### `DashboardLocalScreen.tsx`

`<TarjetaPro tenant={miVenue} etiqueta="tu local" />` en el `ListHeaderComponent`, justo
después de la fila de «Resumen» y antes de «+ Crear evento», con el mismo margen
horizontal que `resumenRow`. Solo existe en la rama con `miVenue`: sin local no hay de quién
hablar. El `Venue` trae `sonopolisProHasta` desde el spec 148.

### `PerfilMusicoScreen.tsx`

`<TarjetaPro tenant={perfil} etiqueta="tu banda" />` justo después de la tarjeta
«Resumen», solo si `!esMock`: un perfil de muestra no tiene fila real y mostraría «sin Pro»
de una cuenta que no existe.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Un local con `sonopolis_pro_hasta` nulo ve el texto sin Pro y «Tu cuenta no tiene
   Sonópolis Pro activo.», sin botón.
4. Con la fecha a 30 días: «Activo hasta el <fecha>.» sin etiqueta; a 3 días: etiqueta
   «VENCE PRONTO» y «— quedan 3 días»; con `9999-12-31`: «Activo, sin fecha de
   vencimiento.» sin etiqueta.
5. El mismo comportamiento en el panel de un músico (`profiles.sonopolis_pro_hasta`).
6. `grep -niE "mercado ?pago|suscrib|escr[ií]benos|mailto|se cobra|al mes|renov" src/components/TarjetaPro.tsx`
   → nada.
7. Sin `onVerContactos` no aparece «Ver tus contactos →».

## Fuera de alcance

- La entrada a Contactos desde los paneles y pasar `onVerContactos`: spec 155.
- Comprar, renovar o pedir Pro desde la app, o cualquier texto que lleve a hacerlo fuera
  (decisión de producto).
- Refrescar el Pro mientras el panel está abierto (ver spec 148).

## Verificación manual

- **V-candidata 154-a:** en un iPhone y un Android, con un local de prueba en los tres
  estados (sin Pro, vence en 3 días, sin vencimiento) cambiados desde `/admin/crm`,
  confirmar los textos de la tarjeta y que no hay nada que se pueda tocar salvo «Ver tus
  contactos →» (cuando exista, spec 155).
