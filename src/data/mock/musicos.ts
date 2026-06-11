import { PerfilMusico } from "../../types";

export const musicosMock: PerfilMusico[] = [
  {
    id: "m1",
    userId: "user-musico-1",
    nombre: "Juana Fe",
    genero: "Samba / MPB",
    bio: "Cantante y compositora chilena. 10 años de experiencia en escenarios de Santiago y Valparaíso. Mezclo ritmos brasileños con folclor latinoamericano.",
    instagram: "@juana_fe_musica",
    spotify: "https://open.spotify.com/artist/juanafe",
    youtube: "https://youtube.com/@juanafe",
  },
  {
    id: "m2",
    userId: "user-musico-2",
    nombre: "Los Andes Jazz",
    genero: "Jazz fusión",
    bio: "Quinteto de jazz fusión con influencias andinas. Hemos tocado en Festival de Jazz de Viña, Thelonious y Café del Cerro.",
    instagram: "@losandesjazz",
    spotify: "https://open.spotify.com/artist/andesjazz",
  },
  {
    id: "m3",
    userId: "user-musico-3",
    nombre: "María Sol Trío",
    genero: "Pop acústico",
    bio: "Trío femenino de pop acústico. Canciones originales y versiones. Sonido íntimo ideal para cafés.",
    instagram: "@mariasoltrio",
    youtube: "https://youtube.com/@mariasol",
  },
];
