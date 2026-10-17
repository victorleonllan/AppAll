import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Image,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMusicos } from '../hooks/useMusicos';
import { usePais } from '../context/PaisContext';
import { PAISES, banderaPais } from '../constants/paises';
import { TIPO_PROYECTO_LABEL } from '../lib/profiles';
import { PerfilMusico } from '../types';
import { colors, spacing, borderRadius, fontSize } from '../theme';
import { LocalesStackParamList } from '../navigation/LocalesStack';

type NavigationProp = NativeStackNavigationProp<LocalesStackParamList, 'DirectorioMusicos'>;

// Spec 122 — hermano de /musicos de la web (W-040, W-203, W-207): los músicos
// del país activo, buscables por nombre. Sin filtro de género: la web lo apagó
// (24-ago-2026) porque no es lo principal de esta pantalla.
export default function DirectorioMusicosScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { pais } = usePais();
  const { musicos, loading, error, refrescar } = useMusicos({ pais });
  const [q, setQ] = useState('');

  const filtrados = useMemo(
    () => musicos.filter((m) => m.nombre.toLowerCase().includes(q.toLowerCase())),
    [musicos, q],
  );
  const nombrePais = PAISES[pais]?.nombre ?? pais;

  const encabezado = (
    <View style={styles.encabezado}>
      <Text style={styles.titulo}>Músicos</Text>
      <Text style={styles.subtitulo}>
        Quién está tocando en la ciudad. Sigue a los que te gusten para no perderles la pista.
      </Text>
      <TextInput
        style={styles.buscador}
        placeholder="Buscar por nombre"
        placeholderTextColor={colors.muted}
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
      />
      {musicos.length > 0 && (
        <Text style={styles.contador}>
          {filtrados.length} {filtrados.length === 1 ? 'músico' : 'músicos'}
        </Text>
      )}
    </View>
  );

  if (loading && musicos.length === 0 && !error) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centro}>
        <Text style={styles.aviso}>No se pudieron cargar los músicos.</Text>
        <TouchableOpacity style={styles.boton} onPress={refrescar}>
          <Text style={styles.textoBoton}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={filtrados}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={encabezado}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refrescar} />}
      ListEmptyComponent={
        musicos.length === 0 ? (
          <View style={styles.vacio}>
            <Text style={styles.aviso}>Todavía no hay músicos en {nombrePais}.</Text>
            <Text style={styles.avisoSecundario}>
              Sé el primero del directorio: crea tu perfil y la gente de tu ciudad podrá seguirte.
            </Text>
          </View>
        ) : (
          <View style={styles.vacio}>
            <Text style={styles.aviso}>Ningún músico coincide</Text>
            <TouchableOpacity style={styles.boton} onPress={() => setQ('')}>
              <Text style={styles.textoBoton}>Limpiar</Text>
            </TouchableOpacity>
          </View>
        )
      }
      renderItem={({ item }) => (
        <TarjetaMusico
          musico={item}
          onPress={() => navigation.navigate('VerMusico', { musicoId: item.id })}
        />
      )}
    />
  );
}

function TarjetaMusico({ musico, onPress }: { musico: PerfilMusico; onPress: () => void }) {
  const imagen = musico.foto ?? musico.avatar;
  const tipo = musico.tipoProyecto ? TIPO_PROYECTO_LABEL[musico.tipoProyecto] : null;
  const lugar = [banderaPais(musico.pais), musico.ciudad].filter(Boolean).join(' ');
  const tieneMusica = !!(musico.spotify || musico.youtube);

  return (
    <TouchableOpacity style={styles.tarjeta} onPress={onPress}>
      {imagen ? (
        <Image source={{ uri: imagen }} style={styles.imagen} resizeMode="cover" />
      ) : (
        <View style={[styles.imagen, styles.sinFoto]}>
          <Text style={styles.sinFotoIcono}>👤</Text>
          <Text style={styles.sinFotoTexto}>Sin foto</Text>
        </View>
      )}
      <View style={styles.cuerpo}>
        <Text style={styles.nombre}>{musico.nombre}</Text>
        {/* «Sin completar» mira tipo y ciudad, no la bandera: sin ellos no
            hay nada que contar del perfil aunque el país esté. */}
        {tipo || musico.ciudad ? (
          <Text style={styles.contexto}>{[tipo, lugar].filter(Boolean).join(' · ')}</Text>
        ) : (
          <Text style={styles.incompleto}>Perfil sin completar</Text>
        )}
        {!!musico.bio && (
          <Text style={styles.bio} numberOfLines={2}>{musico.bio}</Text>
        )}
        {/* Pie con espacio a la derecha: ahí va el botón de seguir del spec 124. */}
        <View style={styles.pie}>
          {tieneMusica ? (
            <Text style={styles.escuchar}>🎵 Escuchar</Text>
          ) : (
            <Text style={styles.incompleto}>Sin música aún</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  centro: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  encabezado: { marginBottom: spacing.xs },
  titulo: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary },
  subtitulo: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.xs, lineHeight: 22 },
  buscador: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.primary,
    marginTop: spacing.md,
  },
  contador: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm },
  tarjeta: { backgroundColor: colors.cardBackground, borderRadius: borderRadius.md, overflow: 'hidden' },
  imagen: { width: '100%', aspectRatio: 4 / 3 },
  sinFoto: { backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  sinFotoIcono: { fontSize: fontSize.xxl },
  sinFotoTexto: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs },
  cuerpo: { padding: spacing.md },
  nombre: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary },
  contexto: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  incompleto: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  bio: { fontSize: fontSize.sm, color: colors.secondary, marginTop: spacing.sm, lineHeight: 18 },
  pie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  escuchar: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  vacio: { alignItems: 'center', marginTop: spacing.lg },
  aviso: { fontSize: fontSize.md, color: colors.muted, textAlign: 'center' },
  avisoSecundario: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  boton: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: borderRadius.sm, marginTop: spacing.md },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.sm },
});
