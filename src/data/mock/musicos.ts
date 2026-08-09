import { PerfilMusico } from "../../types";

// `tipoProyecto` es vocabulario cerrado desde el spec 030 (antes texto libre).
// Lo que antes decía el label "Género" pasó a `generos`, que es el campo
// que de verdad describe el estilo musical.
export const musicosMock: PerfilMusico[] = [
  {
    id: "m1",
    userId: "user-musico-1",
    nombre: "Juana Fe",
    tipoProyecto: "solista",
    generos: ["Samba", "MPB"],
    bio: "Cantante y compositora chilena. 10 años de experiencia en escenarios de Santiago y Valparaíso. Mezclo ritmos brasileños con folclor latinoamericano.",
    ciudad: "Santiago",
    integrantes: 1,
    duracionShow: 60,
    instagram: "@juana_fe_musica",
    spotify: "https://open.spotify.com/artist/juanafe",
    youtube: "https://youtube.com/@juanafe",
  },
  {
    id: "m2",
    userId: "user-musico-2",
    nombre: "Los Andes Jazz",
    tipoProyecto: "banda",
    generos: ["Jazz fusión"],
    bio: "Quinteto de jazz fusión con influencias andinas. Hemos tocado en Festival de Jazz de Viña, Thelonious y Café del Cerro.",
    ciudad: "Santiago",
    integrantes: 5,
    duracionShow: 90,
    instagram: "@losandesjazz",
    spotify: "https://open.spotify.com/artist/andesjazz",
  },
  {
    id: "m3",
    userId: "user-musico-3",
    nombre: "María Sol Trío",
    tipoProyecto: "banda",
    generos: ["Pop acústico"],
    bio: "Trío femenino de pop acústico. Canciones originales y versiones. Sonido íntimo ideal para cafés.",
    ciudad: "Valparaíso",
    integrantes: 3,
    duracionShow: 75,
    instagram: "@mariasoltrio",
    youtube: "https://youtube.com/@mariasol",
  },
];
