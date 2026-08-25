/**
 * Spec 054 — vocabulario cerrado de géneros musicales.
 *
 * Fuente: listado de géneros del formulario "Main Genre" de OffStep (distribuidora
 * digital), scrapeado el 2026-08-24 — ver en el vault:
 * `08-KNOWLEDGE/Sonopolis/2026-08-24 Géneros musicales - listado OffStep.md`.
 * 174 géneros, orden alfabético original del dropdown de OffStep.
 *
 * Agregar/quitar un género: addendum con fecha en el spec 054, nunca edición
 * silenciosa de este archivo (mismo criterio que cualquier spec aplicado).
 *
 * No hay CHECK/constraint en la base de datos que fuerce este listado — ver
 * "Decisión: constante TS, sin migración de DB" en specs/054-generos-musicales-listado-cerrado.md
 * para el motivo (datos de producción existentes en texto libre, sin normalizar).
 */
export const GENEROS_MUSICALES: string[] = [
  'Afoxé', 'African', 'Afro House', 'Afro Pop', 'Afrobeat', 'Afrobeats',
  'Alternative & Rock in Spanish', 'Amapiano', 'Ambient', 'Americana', 'Anime',
  'Arabesk', 'Avant-garde', 'Axé', 'Bachata', 'Baião', 'Baile Funk', 'Bass',
  'Bass House', 'Bluegrass', 'Blues', 'Bossa nova', 'Breakbeat', 'Breaks',
  'Britpop', 'Bugio', 'C-Pop', 'Cajun', 'Canção', 'Cantopop/HK-Pop', 'Celtic',
  'Celtic Folk', 'Chamamé', 'Chamarra', 'Chamber music', "Children's Music",
  'Chill-Out', 'Chinese', 'Chorinho', 'Choro', 'Christian', 'Classical',
  'Classical Crossover', 'Club', 'Comedy', 'Country', 'Cumbia', 'Dance',
  'Dancehall', 'Deep house', 'Deep Tech', 'Delta blues', 'Disco', 'Dixieland',
  'Downtempo', 'Drum and bass', 'Dub', 'Dubstep', 'Easy Listening',
  'Egyptian Hip-Hop', 'Egyptian Pop', 'Egyptian Rap', 'Electro',
  "Electro-Cha'abi", 'Electronic', 'Electronica', 'Emo', 'Enka', 'Experimental',
  'Fado', 'Flamenco', 'Folclórica', 'Folk', 'Forró', 'French Pop', 'Frevo',
  'Funk', 'Funky House', 'Gangsta rap', 'Gauchesca', 'German Folk',
  'German Pop', 'Gospel', 'Grunge', 'Guitarra baiana', 'Hard bop', 'Hard Dance',
  'Hard Techno', 'Hardcore', 'Heavy metal', 'Hip Hop/Rap', 'Holiday Music',
  'House', 'Indie Dance', 'Indo Pop', 'Industrial', 'Jackin House', 'Jazz',
  'Karaoke', 'Kayokyoku', 'Khaleeji', 'Khaleeji Hip-Hop', 'Khaleeji Pop',
  'Khaleeji Rap', 'Kizomba', 'Lambada', 'Latin jazz', 'Latin Rap', 'Lo-fi',
  'Lounge', 'Mahraganat', 'Mainstage', 'Melodic House', 'Melodic House & Techno',
  'Merengue', 'Milonga', 'Minimal', 'Motown', 'MPB', 'Neo Rave', 'New Age',
  'New Wave', 'Nu Disco', 'Opera', 'Pagode', 'Pop', 'Pop in Spanish',
  'Progressive House', 'Psy-Trance', 'Psychedelic', 'Punk', 'Ragtime',
  'Rancheira', 'Rap', 'Reggae', 'Reggaeton', 'Regional Mexicano', 'Reparto',
  'Rhythm & Blues', 'Rock', 'Rockabilly', 'Russian Chanson', 'Salsa',
  'Salsa Choke', 'Samba', 'Samba-canção', 'Samba-reggae', 'Sertaneja',
  'Singer-songwriter', 'Ska', 'Smooth jazz', 'Soca', 'Soul', 'Soundtrack',
  'Spoken Word', 'Surf', 'Tech House', 'Techno', 'Teen pop', 'Thai Pop',
  'Trance', 'Trap', 'Trip rock', 'Turkish', 'UK Bass', 'Underground',
  'Urban Cowboy', 'Vallenato', 'Valsa', 'Vanera', 'Vocal', 'Worldbeat', 'Xote',
  'Zydeco',
];
