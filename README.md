# Songweft

Songweft reúne tu historial musical en una web gratuita: primero puedes visualizarlo, después convertirlo en playlists editables y crear una tarjeta para compartir. Creado por Iñigo Casares.

## Cómo nació

Empecé preguntándome cuántos minutos había escuchado realmente a mis artistas favoritos. Pedí mis datos a Spotify y construí un análisis que funcionara sin entregar el ZIP a otra plataforma. Al explorar mis años de escucha descubrí canciones olvidadas y quise crear listas con ellas de una forma más sencilla. Así nació Songweft.

## Web pública

[Abrir Songweft](https://casares-06.github.io/Songweft/)

La web está alojada en GitHub Pages y no necesita servidor ni base de datos. GitHub Pages es gratuito para este repositorio público.

## Qué puedes hacer

- Importar varios ZIP de Spotify, archivos JSON de historial, `YourLibrary.json`, `Playlist1.json` y CSV de canciones. El importador acepta el historial ampliado y el historial normal de cuenta.
- Empezar sin archivo pegando una lista `Artista — Canción` o ampliarla más tarde desde Fuentes. Las canciones pegadas tampoco se convierten en minutos ficticios.
- Añadir más fuentes durante la misma sesión y retirar escuchas exactamente duplicadas.
- Llegar a un Inicio después de importar, con información general y tres destinos: Visualizar, Crear y Compartir. Los análisis se agrupan en Panorama, Favoritos, Tu ritmo, Descubrir y Detalle.
- Ver minutos, rankings, evolución, hábitos, sesiones, descubrimiento, podcasts y calidad de datos.
- Crear playlists desde las canciones de tu historial, con recetas de favoritos, canciones olvidadas, temas poco escuchados, una mezcla ajustable y artistas elegidos. Si hay escuchas, las canciones de bibliotecas adicionales solo enriquecen sus enlaces; no se mezclan automáticamente con tus sugerencias.
- Elegir hasta 300 canciones, ampliar el máximo por artista hasta 300 y excluir artistas. Reordenar, quitar, sustituir o añadir canciones con un enlace de Spotify, con deshacer y rehacer. La edición se mantiene al visitar otras secciones y añadir fuentes; al cambiar de período se crea un borrador nuevo.
- Guardar y cargar recetas como archivos JSON locales para repetir una idea con otros datos o en otro momento.
- Elegir varios artistas de todas tus escuchas y buscar otros en el catálogo de Spotify. Con una conexión autorizada puedes incluir canciones que no aparecen en todo tu historial importado, incluso si filtras un año. No equivale a demostrar que nunca hayas escuchado esas canciones: el ZIP puede estar incompleto y Spotify puede tener distintas versiones. La consulta revisa hasta 100 álbumes por artista y se detiene cuando alcanza el número solicitado.
- Descargar la playlist como CSV.
- Crear una playlist privada en Spotify si conectas una app personal autorizada.
- Diseñar una tarjeta con año, top artistas, top canciones o resumen (minutos, artistas, canciones y días activos), tres paletas y formatos publicación (1080 × 1350) o Story (1080 × 1920). Descargar el PNG para compartir por tu cuenta.
- Navegar con transiciones, contadores, discos, ecualizadores y tarjetas animadas, sin añadir dependencias. Se respeta la preferencia del dispositivo de reducir movimiento.

Los CSV y las canciones guardadas de Spotify amplían la biblioteca, pero no aportan minutos históricos. Solo el historial de escuchas sirve para calcularlos. Si empiezas sin historial, puedes crear una lista con la biblioteca importada.

## Privacidad

- Los archivos se procesan en la memoria del navegador. No se suben al alojamiento de la web ni se guardan en `localStorage` o IndexedDB.
- GitHub Pages puede registrar visitas y peticiones de la web, como cualquier alojamiento, pero no recibe el contenido de los archivos seleccionados.
- Al recargar o cerrar la pestaña, el historial cargado desaparece. Las descargas PNG y CSV se guardan únicamente si pulsas sus botones.
- Al conectar Spotify, la autorización temporal se guarda en `sessionStorage` de esa pestaña. El navegador se comunica directamente con Spotify para leer la biblioteca, consultar el catálogo o crear una playlist. Puedes desconectarlo desde Fuentes.
- El repositorio ignora los ZIP, los Parquet y las tablas con datos personales.

## Conectar tu Spotify personal

1. Crea una app Web API en [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Copia el `Client ID` (nunca el Client Secret).
3. Registra como URI de redirección la dirección que muestra la ventana de conexión de Songweft. En local se usa `http://127.0.0.1:5173/Songweft/`; en la web pública, `https://casares-06.github.io/Songweft/`.
4. En Songweft, abre **Fuentes**, configura la conexión y pega el Client ID. Autoriza los permisos en la ventana oficial de Spotify.
5. En **Fuentes** puedes añadir canciones guardadas o una playlist propia. En **Crear** puedes crear una playlist privada. Las listas de hasta 300 canciones se envían en lotes de 100.

Spotify exige Premium al propietario de una app en modo desarrollo y limita ese modo a cinco usuarios. La parte pública de análisis e importación no depende de su API. Spotify no entrega por API todos los minutos históricos; por eso el ZIP sigue siendo la fuente de referencia. El endpoint antiguo de recomendaciones está obsoleto, así que las recetas de Songweft se calculan localmente a partir de tus datos.

## Desarrollo

```powershell
pnpm install
pnpm dev
pnpm test
pnpm build
```

La versión Python original de Streamlit se conserva en `src/` para comparar métricas. Puedes abrirla con `run_app.bat`.

Los minutos proceden de `ms_played` o `msPlayed`, según el formato. Una reproducción alcanza la categoría de stream a partir de 30 segundos, sin alterar los minutos reales.
