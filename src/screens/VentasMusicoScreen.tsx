import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize } from '../theme';
import type { TicketStatus } from '../types';

type Ticket = {
  id: string;
  status: TicketStatus;
  monto: number;
  cantidad: number;
  created_at: string;
  evento_id: string;
};

type EventoConTickets = {
  id: string;
  artist_name: string;
  venue_name: string;
  fecha: string;
  hora: string;
  precio: string;
  tickets: Ticket[];
};

export default function VentasMusicoScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eventos, setEventos] = useState<EventoConTickets[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);

  const cargarVentas = async () => {
    if (!user) return;
    try {
      // Traer eventos del músico
      const { data: evData, error: evError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by', user.id)
        .order('fecha', { ascending: false });

      if (evError) throw evError;

      // Traer tickets de esos eventos
      const eventoIds = (evData || []).map((e: any) => e.id);
      let ticketsData: any[] = [];
      if (eventoIds.length > 0) {
        const { data: tData, error: tError } = await supabase
          .from('tickets')
          .select('*')
          .in('evento_id', eventoIds)
          .order('created_at', { ascending: false });
        if (!tError && tData) ticketsData = tData;
      }

      // Agrupar tickets por evento
      const eventosConTickets: EventoConTickets[] = (evData || []).map((ev: any) => ({
        id: ev.id,
        artist_name: ev.artist_name,
        venue_name: ev.venue_name,
        fecha: ev.fecha,
        hora: ev.hora,
        precio: ev.precio,
        tickets: ticketsData.filter((t: any) => t.evento_id === ev.id),
      }));

      setEventos(eventosConTickets);
    } catch (err) {
      console.error('Error cargando ventas:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    cargarVentas();
  }, [user]);

  // Totales
  const todosTickets = eventos.flatMap((e) => e.tickets);
  const ticketsPagados = todosTickets.filter((t) => t.status === 'completed');
  const totalEntradas = ticketsPagados.reduce((sum, t) => sum + t.cantidad, 0);
  const totalMonto = ticketsPagados.reduce((sum, t) => sum + t.monto, 0);
  const eventosActivos = eventos.length;

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarVentas(); }} />
      }
    >
      {/* Resumen */}
      <View style={styles.resumenRow}>
        <View style={styles.resumenCard}>
          <Text style={styles.resumenNumero}>{totalEntradas}</Text>
          <Text style={styles.resumenLabel}>Entradas vendidas</Text>
        </View>
        <View style={styles.resumenCard}>
          <Text style={styles.resumenNumero}>${totalMonto.toLocaleString()}</Text>
          <Text style={styles.resumenLabel}>Monto total</Text>
        </View>
        <View style={styles.resumenCard}>
          <Text style={styles.resumenNumero}>{eventosActivos}</Text>
          <Text style={styles.resumenLabel}>Eventos</Text>
        </View>
      </View>

      {/* Lista por evento */}
      <Text style={styles.seccionTitulo}>Ventas por evento</Text>

      {eventos.length === 0 ? (
        <Text style={styles.vacio}>No tienes eventos creados todavía.</Text>
      ) : (
        eventos.map((ev) => {
          const evTickets = ev.tickets;
          const evPagados = evTickets.filter((t) => t.status === 'completed');
          const evMonto = evPagados.reduce((sum, t) => sum + t.monto, 0);
          const evCantidad = evPagados.reduce((sum, t) => sum + t.cantidad, 0);
          const isOpen = expandido === ev.id;

          return (
            <View key={ev.id} style={styles.card}>
              <TouchableOpacity
                onPress={() => setExpandido(isOpen ? null : ev.id)}
                style={styles.eventoHeader}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventoTitulo}>{ev.venue_name}</Text>
                  <Text style={styles.eventoFecha}>{ev.fecha} · {ev.hora}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{evCantidad} vendidas</Text>
                  <Text style={styles.badgeMonto}>${evMonto.toLocaleString()}</Text>
                </View>
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.ticketsContainer}>
                  {evTickets.length === 0 ? (
                    <Text style={styles.vacio}>Sin tickets todavía.</Text>
                  ) : (
                    evTickets.map((t) => (
                      <View key={t.id} style={styles.ticketRow}>
                        <View>
                          <Text style={styles.ticketStatus}>{t.status}</Text>
                          <Text style={styles.ticketFecha}>
                            {new Date(t.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={styles.ticketRight}>
                          <Text style={styles.ticketCantidad}>{t.cantidad}x</Text>
                          <Text style={styles.ticketMonto}>${t.monto.toLocaleString()}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },
  resumenRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  resumenCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  resumenNumero: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.accent },
  resumenLabel: { fontSize: fontSize.xs, color: colors.muted, marginTop: 4, textAlign: 'center' },
  seccionTitulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  eventoHeader: { flexDirection: 'row', alignItems: 'center' },
  eventoTitulo: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary },
  eventoFecha: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  badge: { alignItems: 'flex-end' },
  badgeText: { fontSize: fontSize.sm, color: colors.success, fontWeight: '600' },
  badgeMonto: { fontSize: fontSize.sm, color: colors.accent, fontWeight: 'bold' },
  ticketsContainer: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ticketStatus: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  ticketFecha: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  ticketRight: { alignItems: 'flex-end' },
  ticketCantidad: { fontSize: fontSize.sm, color: colors.secondary },
  ticketMonto: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  vacio: { fontSize: fontSize.sm, color: colors.muted, fontStyle: 'italic' },
});