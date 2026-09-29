# Songweft

Songweft reúne tu historial musical en una web gratuita: primero puedes visualizarlo, después convertirlo en playlists editables y crear una tarjeta para compartir. Creado por Iñigo Casares.

## Cómo nació

Empecé preguntándome cuántos minutos había escuchado realmente a mis artistas favoritos. Pedí mis datos a Spotify y construí un análisis que funcionara sin entregar el ZIP a otra plataforma. Al explorar mis años de escucha descubrí canciones olvidadas y quise crear listas con ellas de una forma más sencilla. Así nació Songweft.

## Web pública

[Abrir Songweft](https://casares-06.github.io/Songweft/)

La web está alojada en GitHub Pages y no necesita servidor ni base de datos. GitHub Pages es gratuito para este repositorio público.

## Qué puedes hacer

- Importar varios ZIP de Spotify, archivos JSON de historial y CSV de canciones. El importador acepta el historial ampliado y el historial normal de cuenta.
- Añadir más fuentes durante la misma sesión y retirar escuchas exactamente duplicadas.
- Ver minutos, rankings, evolución, hábitos, sesiones, descubrimiento, podcasts y calidad de datos.
- Crear playlists con recetas de favoritos, canciones olvidadas, temas poco escuchados de tus artistas y una mezcla ajustable.
- Controlar número de canciones, límite por artista y artistas excluidos. Reordenar, quitar, sustituir o añadir canciones con un enlace de Spotify.
- Descargar la playlist como CSV.
- Crear una playlist privada en Spotify si conectas una app personal autorizada.
- Descargar una tarjeta PNG con minutos y cinco artistas para compartir por tu cuenta.

Los CSV y las canciones guardadas de Spotify amplían la biblioteca, pero no aportan minutos históricos. Solo el historial de escuchas sirve para calcularlos.

## Privacidad

- Los archivos se procesan en la memoria del navegador. No se suben al alojamiento de la web ni se guardan en `localStorage` o IndexedDB.
- Al recargar o cerrar la pestaña, el historial cargado desaparece. Las descargas PNG y CSV se guardan únicamente si pulsas sus botones.
- Al conectar Spotify, la autorización temporal se guarda en `sessionStorage` de esa pestaña. El navegador se comunica directamente con Spotify para leer la biblioteca o crear una playlist. Puedes desconectarlo desde Conexiones.
- El repositorio ignora los ZIP, los Parquet y las tablas con datos personales.

## Conectar tu Spotify personal

1. Crea una app Web API en [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Copia el `Client ID` (nunca el Client Secret).
3. Registra como URI de redirección la dirección que muestra la ventana de conexión de Songweft. En local se usa `http://127.0.0.1:5173/Songweft/`; en la web pública, `https://casares-06.github.io/Songweft/`.
4. En Songweft, abre **Conexiones** y pega el Client ID. Autoriza los permisos en la ventana oficial de Spotify.
5. En **Fuentes** puedes añadir canciones guardadas o una playlist propia. En **Estudio** puedes crear una playlist privada.

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
