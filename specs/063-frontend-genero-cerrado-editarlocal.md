# Spec 063 — `EditarLocalScreen` usa el vocabulario cerrado de géneros

**Capa: FRONTEND · `src/screens/EditarLocalScreen.tsx` · Depende de: spec 054, 056**

## Motivo

Mismo bug que W-065 en sonopolisWeb, encontrado en la misma revisión de diseño: "Estilo
musical" en `EditarLocalScreen` era un `TextInput` de texto libre mientras
`CrearEventoScreen`/`EditarEventoScreen` ya usan el listado cerrado de 174 géneros
(spec 054, `src/constants/generos.ts`) vía `GeneroPicker` (spec 056). Un local que
escribía "Jazz/Experimental" a mano (el placeholder mismo invitaba a eso) no empataba con
un músico marcado "Jazz" en ninguna búsqueda o filtro por género.

## Cambio

`GeneroPicker` en modo single, mismo patrón que el campo "Género" de `CrearEventoScreen`:

```tsx
const [pickerGeneroVisible, setPickerGeneroVisible] = useState(false);
// ...
<TouchableOpacity style={styles.input} onPress={() => setPickerGeneroVisible(true)}>
  <Text style={estilo ? styles.inputTexto : styles.inputPlaceholder}>
    {estilo || 'Seleccionar género'}
  </Text>
</TouchableOpacity>
<GeneroPicker
  visible={pickerGeneroVisible}
  onClose={() => setPickerGeneroVisible(false)}
  seleccionados={estilo ? [estilo] : []}
  onCambiar={(gs) => setEstilo(gs[0] ?? '')}
/>
```

Reemplaza el `<TextInput value={estilo} onChangeText={setEstilo} placeholder="Ej:
Jazz/Experimental">` anterior. El estado `estilo` sigue siendo un `string` — no se toca
el guardado (`estilo: estilo.trim() || undefined` en el `onSubmit`).

`inputTexto`/`inputPlaceholder` no existían en los estilos de esta pantalla (sí en
`CrearEventoScreen`) — se agregaron con los mismos valores.

## Fuera de alcance

- Migrar datos existentes con `estilo` en texto libre sin match en el listado — mismo
  motivo que W-065: `generos.ts` no tiene constraint en la base, el dato viejo no se
  pierde, solo no aparece pre-seleccionado hasta que se re-elija.
- Hacer `estilo` multi-valor — columna de texto simple, igual que en sonopolisWeb.

## Criterios de aceptación

- [x] "Estilo musical" en `EditarLocalScreen` usa `GeneroPicker`, no `TextInput` libre.
- [x] `npx tsc --noEmit` sin errores nuevos (los de `supabase/functions/*` son Deno,
      preexistentes, no relacionados).

> Estado: aplicado (2026-08-31).
