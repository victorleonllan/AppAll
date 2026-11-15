// Spec 187 — el muro de un local o banda en su perfil: los correos que mandó a su público
// y los flyers de sus eventos pasados, con comentarios de cualquiera con sesión.
// Hermano de `components/Muro.js` y `components/ComentariosMuro.js` de la web (W-280).
//
// Se dibuja como bloque dentro del `ScrollView` de la pantalla, no como `FlatList`: son
// 30 entradas como máximo (`MAX_ENTRADAS`) y una lista virtual anidada en un `ScrollView`
// da avisos y pierde la virtualización igual.

import { useState, type ReactNode } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useMuro } from '../hooks/useMuro';
import type { TipoTenant } from '../hooks/useTenantCrm';
import { MAX_COMENTARIO, type EntradaMuro } from '../lib/muro';
import { confirmar } from '../lib/confirm';
import { formatearFechaEs, separarFechaHora } from '../lib/fecha';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

interface Props {
  tipo: TipoTenant;
  id: string;
  nombreTenant: string;
  puedeModerar: boolean;
}

/** Comentarios que se ven sin desplegar: los más recientes. */
const COMENTARIOS_VISIBLES = 3;

type Resultado = { ok: true } | { ok: false; mensaje: string };

/** "15 de agosto" a partir de un ISO con hora. `formatearFechaEs` espera "YYYY-MM-DD",
 * y el día se toma en hora local (un evento de las 23:00 no se corre al día siguiente). */
function fechaCorta(iso: string): string {
  const { fechaISO } = separarFechaHora(iso);
  return fechaISO ? formatearFechaEs(fechaISO) : '';
}

export default function Muro({ tipo, id, nombreTenant, puedeModerar }: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const { user } = useAuth();
  const muro = useMuro(tipo, id);

  let contenido: ReactNode;
  if (muro.entradas === null) {
    contenido = muro.cargando ? (
      <ActivityIndicator color={colores.accent} />
    ) : (
      <Text style={styles.error}>No pudimos cargar el muro. Vuelve a intentarlo en un momento.</Text>
    );
  } else if (muro.entradas.length === 0) {
    contenido = (
      <Text style={styles.vacio}>
        {nombreTenant} todavía no tiene publicaciones. Cuando le escriba a su público o pase un evento con
        flyer, va a aparecer acá.
      </Text>
    );
  } else {
    contenido = muro.entradas.map((entrada) => (
      <TarjetaEntrada
        key={entrada.clave}
        entrada={entrada}
        nombreTenant={nombreTenant}
        usuarioId={user?.id ?? null}
        puedeModerar={puedeModerar}
        comentar={muro.comentar}
        borrarComentario={muro.borrarComentario}
        quitarPublicacion={muro.quitarPublicacion}
      />
    ));
  }

  return (
    <View>
      <Text style={styles.seccion}>Muro</Text>
      {contenido}
    </View>
  );
}

interface TarjetaProps {
  entrada: EntradaMuro;
  nombreTenant: string;
  usuarioId: string | null;
  puedeModerar: boolean;
  comentar: (destino: { publicacionId?: string; eventId?: string }, cuerpo: string) => Promise<Resultado>;
  borrarComentario: (comentarioId: string) => Promise<Resultado>;
  quitarPublicacion: (publicacionId: string) => Promise<Resultado>;
}

function TarjetaEntrada({
  entrada,
  nombreTenant,
  usuarioId,
  puedeModerar,
  comentar,
  borrarComentario,
  quitarPublicacion,
}: TarjetaProps) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  const esCorreo = entrada.tipo === 'correo';
  const total = entrada.comentarios.length;
  // Llegan del más viejo al más nuevo: los «3 más recientes» son los últimos.
  const visibles = verTodos ? entrada.comentarios : entrada.comentarios.slice(-COMENTARIOS_VISIBLES);
  const puedeEnviar = Boolean(texto.trim()) && !enviando;

  const alComentar = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    setMensaje(null);
    const destino = esCorreo ? { publicacionId: entrada.id } : { eventId: entrada.id };
    const r = await comentar(destino, texto.trim());
    setEnviando(false);
    if (r.ok) setTexto('');
    else setMensaje(r.mensaje);
  };

  const alBorrar = (comentarioId: string) =>
    confirmar(
      { title: '¿Borrar este comentario?', confirmText: 'Borrar', destructive: true },
      async () => {
        setMensaje(null);
        const r = await borrarComentario(comentarioId);
        if (!r.ok) setMensaje(r.mensaje);
      }
    );

  const alQuitar = () =>
    confirmar(
      {
        title: '¿Quitar esta publicación del muro?',
        message: 'Sus comentarios se borran con ella.',
        confirmText: 'Quitar',
        destructive: true,
      },
      async () => {
        setMensaje(null);
        const r = await quitarPublicacion(entrada.id);
        if (!r.ok) setMensaje(r.mensaje);
      }
    );

  return (
    <View style={styles.tarjeta}>
      <Text style={styles.cabecera}>
        <Text style={styles.negrita}>{esCorreo ? nombreTenant : 'Evento pasado'}</Text>
        {' · '}
        {fechaCorta(entrada.fecha)}
      </Text>

      {esCorreo ? (
        <>
          <Text style={styles.tituloEntrada}>{entrada.titulo}</Text>
          {!!entrada.cuerpo && <Text style={styles.cuerpo}>{entrada.cuerpo}</Text>}
          {puedeModerar && (
            <TouchableOpacity onPress={alQuitar}>
              <Text style={styles.enlace}>Quitar del muro</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          {!!entrada.imagen && (
            <Image
              source={{ uri: entrada.imagen }}
              style={styles.flyer}
              resizeMode="cover"
              accessibilityLabel={`Flyer de ${entrada.titulo}`}
            />
          )}
          <Text style={styles.cuerpo}>{[entrada.titulo, entrada.venue].filter(Boolean).join(' · ')}</Text>
        </>
      )}

      {total > 0 && (
        <View style={styles.comentarios}>
          {!verTodos && total > COMENTARIOS_VISIBLES && (
            <TouchableOpacity onPress={() => setVerTodos(true)}>
              <Text style={styles.enlace}>Ver los {total} comentarios</Text>
            </TouchableOpacity>
          )}
          {visibles.map((c) => (
            <View key={c.id} style={styles.comentario}>
              <Text style={styles.cabeceraComentario}>
                <Text style={styles.negrita}>{c.autorNombre}</Text>
                {' · '}
                {fechaCorta(c.fecha)}
              </Text>
              <Text style={styles.cuerpo}>{c.cuerpo}</Text>
              {(c.autorId === usuarioId || puedeModerar) && (
                <TouchableOpacity onPress={() => alBorrar(c.id)}>
                  <Text style={styles.enlaceChico}>Borrar</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {usuarioId ? (
        <View style={styles.formulario}>
          <TextInput
            style={styles.input}
            value={texto}
            onChangeText={setTexto}
            maxLength={MAX_COMENTARIO}
            multiline
            textAlignVertical="top"
            placeholder="Escribe un comentario"
            placeholderTextColor={colores.muted}
          />
          <View style={styles.filaEnviar}>
            <Text style={styles.ayuda}>
              {texto.length}/{MAX_COMENTARIO}
            </Text>
            <TouchableOpacity
              style={[styles.boton, !puedeEnviar && styles.botonDeshabilitado]}
              onPress={alComentar}
              disabled={!puedeEnviar}
            >
              <Text style={styles.botonTexto}>{enviando ? 'Enviando…' : 'Comentar'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.ayuda}>Se publica con tu nombre.</Text>
        </View>
      ) : (
        <Text style={styles.ayuda}>Inicia sesión para comentar</Text>
      )}
      {mensaje && <Text style={styles.error}>{mensaje}</Text>}
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  seccion: { fontSize: fontSize.lg, fontWeight: 'bold', color: c.primary, marginTop: spacing.lg, marginBottom: spacing.sm },
  vacio: { fontSize: fontSize.sm, color: c.muted },
  error: { color: c.danger, fontSize: fontSize.sm, marginTop: spacing.xs },
  tarjeta: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cabecera: { fontSize: fontSize.sm, color: c.secondary, marginBottom: spacing.xs },
  negrita: { fontWeight: 'bold', color: c.primary },
  tituloEntrada: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary, marginBottom: spacing.xs },
  cuerpo: { fontSize: fontSize.sm, color: c.primary },
  flyer: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    backgroundColor: c.border,
  },
  enlace: { fontSize: fontSize.sm, color: c.accent, marginTop: spacing.sm },
  enlaceChico: { fontSize: fontSize.xs, color: c.accent, marginTop: spacing.xs },
  comentarios: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.xs },
  comentario: { marginTop: spacing.sm },
  cabeceraComentario: { fontSize: fontSize.xs, color: c.secondary },
  formulario: { marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.sm,
    color: c.primary,
    backgroundColor: c.cardBackground,
    minHeight: 60,
  },
  filaEnviar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  boton: {
    backgroundColor: c.accent,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  botonDeshabilitado: { opacity: 0.5 },
  botonTexto: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.sm },
  ayuda: { fontSize: fontSize.xs, color: c.muted, marginTop: spacing.xs },
});
