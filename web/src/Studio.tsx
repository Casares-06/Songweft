import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, ExternalLink, Minus, Plus, Redo2, RefreshCcw, Shuffle, Undo2, WandSparkles } from "lucide-react";
import { buildCatalog, recommendTracks, type PlaylistOptions, type Recipe, type TrackChoice } from "./playlist";
import { createSpotifyPlaylist, exploreArtistCatalog, searchSpotifyTrack } from "./spotifyApi";
import type { ImportResult } from "./types";

const recipes: { id: Recipe; title: string; copy: string }[] = [
  { id: "favorites", title: "Mis imprescindibles", copy: "Las canciones que más tiempo te han acompañado." },
  { id: "forgotten", title: "Volver a escuchar", copy: "Favoritas que llevan tiempo en silencio." },
  { id: "deepcuts", title: "Más allá de tus éxitos", copy: "Temas que tú has escuchado menos de tus artistas favoritos." },
  { id: "balanced", title: "A mi manera", copy: "Equilibrio personal entre favoritos y variedad." },
];

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Studio({ result, connected, onConnect }: { result: ImportResult; connected: boolean; onConnect: () => void }) {
  const catalog = useMemo(() => buildCatalog(result.plays, result.libraryTracks), [result.plays, result.libraryTracks]);
  const hasListeningHistory = catalog.some((track) => track.minutes > 0);
  const favoriteArtists = useMemo(() => {
    const minutes = new Map<string, number>();
    catalog.forEach((track) => minutes.set(track.creator, (minutes.get(track.creator) ?? 0) + track.minutes));
    return [...minutes].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([artist]) => artist);
  }, [catalog]);
  const [options, setOptions] = useState<PlaylistOptions>({ recipe: "balanced", count: 30, maxPerArtist: 3, novelty: 30, excludedArtists: [] });
  const [excludedInput, setExcludedInput] = useState("");
  const [title, setTitle] = useState("Mi historia musical");
  const [tracks, setTracks] = useState<TrackChoice[]>(() => recommendTracks(catalog, options));
  const [past, setPast] = useState<TrackChoice[][]>([]);
  const [future, setFuture] = useState<TrackChoice[][]>([]);
  const recipeInput = useRef<HTMLInputElement>(null);
  const [extraUri, setExtraUri] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [pendingPublication, setPendingPublication] = useState<{ uris: string[]; missing: string[] } | null>(null);
  const [artistToExplore, setArtistToExplore] = useState(favoriteArtists[0] ?? "");
  const [discovered, setDiscovered] = useState<TrackChoice[]>([]);
  const [exploring, setExploring] = useState(false);
  const previousSourceCount = useRef(result.sourceFiles.length);
  useEffect(() => {
    if (result.sourceFiles.length !== previousSourceCount.current) {
      previousSourceCount.current = result.sourceFiles.length;
      setMessage("Hay nuevas fuentes disponibles. Tu borrador sigue intacto; pulsa Generar playlist para incorporarlas.");
    }
  }, [result.sourceFiles.length]);
  const commit = (next: TrackChoice[]) => { setPast([...past.slice(-19), tracks]); setFuture([]); setPendingPublication(null); setTracks(next); };
  const regenerate = (next = options) => { setOptions(next); commit(recommendTracks(catalog, next)); setMessage(""); };
  const undo = () => { if (!past.length) return; setFuture([tracks, ...future]); setTracks(past.at(-1)!); setPast(past.slice(0, -1)); setPendingPublication(null); };
  const redo = () => { if (!future.length) return; setPast([...past, tracks]); setTracks(future[0]); setFuture(future.slice(1)); setPendingPublication(null); };
  const move = (index: number, step: number) => {
    const next = [...tracks];
    const destination = index + step;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    commit(next);
  };
  const replace = (index: number) => {
    const used = new Set(tracks.map((track) => track.key));
    const replacement = recommendTracks(catalog.filter((track) => !used.has(track.key)), { ...options, count: 1 })[0];
    if (!replacement) { setMessage("No quedan canciones distintas con estos filtros."); return; }
    commit(tracks.map((track, position) => position === index ? replacement : track));
  };
  const addUri = () => {
    const match = extraUri.match(/(?:open\.spotify\.com\/track\/|spotify:track:)([A-Za-z0-9]{22})/);
    if (!match) { setMessage("Pega un enlace válido a una canción de Spotify."); return; }
    const uri = `spotify:track:${match[1]}`;
    if (tracks.some((track) => track.uri === uri)) { setMessage("La canción ya está en la lista."); return; }
    commit([...tracks, { key: uri, uri, item: "Canción añadida", creator: "Spotify", collection: "", sourceFile: "Enlace", minutes: 0, listens: 0, lastPlayed: 0, reason: "Añadida manualmente" }]);
    setExtraUri(""); setMessage("");
  };
  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    download("songweft-playlist.csv", ["Posición,Canción,Artista,Spotify URI,Motivo", ...tracks.map((track, index) => [String(index + 1), track.item, track.creator, track.uri, track.reason].map(escape).join(","))].join("\r\n"), "text/csv;charset=utf-8");
  };
  const saveRecipe = () => download("songweft-receta.json", JSON.stringify({ app: "Songweft", version: 1, title, options }, null, 2), "application/json;charset=utf-8");
  const loadRecipe = async (file?: File) => {
    if (!file || file.size > 50_000) { setMessage("La receta debe ser un JSON de menos de 50 KB."); return; }
    try {
      const saved = JSON.parse(await file.text());
      const next = saved.options as PlaylistOptions;
      if (!recipes.some((recipe) => recipe.id === next?.recipe) || !Number.isInteger(next.count) || next.count < 5 || next.count > 100 || !Number.isInteger(next.maxPerArtist) || next.maxPerArtist < 1 || next.maxPerArtist > 10 || !Number.isInteger(next.novelty) || next.novelty < 0 || next.novelty > 100 || !Array.isArray(next.excludedArtists) || !next.excludedArtists.every((artist) => typeof artist === "string")) throw new Error("La receta no tiene un formato válido.");
      setTitle(typeof saved.title === "string" ? saved.title.slice(0, 100) : title);
      setExcludedInput(next.excludedArtists.join(", "));
      regenerate(next);
      setMessage("Receta cargada. Puedes seguir ajustándola antes de exportar.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo abrir la receta."); }
  };
  const explore = async () => {
    if (!connected) { onConnect(); return; }
    setExploring(true); setMessage("");
    try {
      const known = new Set(catalog.map((track) => track.uri).filter(Boolean));
      const items = await exploreArtistCatalog(artistToExplore, known);
      setDiscovered(items.map((item) => ({ ...item, key: item.uri, minutes: 0, listens: 0, lastPlayed: 0, reason: `Una canción de ${artistToExplore} que no aparece en tus datos` })));
      if (!items.length) setMessage("No se encontraron canciones nuevas entre los primeros álbumes consultados.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo explorar la discografía."); }
    finally { setExploring(false); }
  };
  const publish = async () => {
    if (!connected) { onConnect(); return; }
    setWorking(true); setMessage(""); setPublishedUrl("");
    try {
      const uris: string[] = pendingPublication?.uris ?? [];
      const missing: string[] = pendingPublication?.missing ?? [];
      if (!pendingPublication) {
        for (const track of tracks) {
          if (track.uri.startsWith("spotify:track:")) { uris.push(track.uri); continue; }
          const match = await searchSpotifyTrack(track.item, track.creator);
          if (match) uris.push(match);
          else missing.push(`${track.item} — ${track.creator}`);
        }
      }
      if (!uris.length) throw new Error("Spotify no encontró ninguna canción de la lista.");
      if (missing.length && !pendingPublication) {
        setPendingPublication({ uris, missing });
        setMessage(`Spotify no encontró ${missing.length} canciones: ${missing.slice(0, 3).join("; ")}${missing.length > 3 ? "…" : ""}. Revisa la lista o confirma para crearla con las ${uris.length} disponibles.`);
        return;
      }
      const url = await createSpotifyPlaylist(title.trim() || "Mi playlist de Songweft", uris);
      setPendingPublication(null);
      setPublishedUrl(url ?? "");
      setMessage(`Playlist privada creada con ${uris.length} canciones.${missing.length ? ` Se omitieron ${missing.length} que Spotify no encontró.` : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo publicar la playlist."); }
    finally { setWorking(false); }
  };

  return <div className="studio-page">
    <header className="page-title"><span className="kicker">Crear · 02</span><h1>Estudio de playlists</h1><p>Tu historial propone canciones. Tú decides cuáles se quedan y en qué orden.</p></header>
    <div className="studio-layout">
      <aside className="panel studio-controls">
        <h2>Tu receta</h2>
        <div className="recipe-grid">{recipes.map((recipe) => <button key={recipe.id} className={options.recipe === recipe.id ? "selected" : ""} disabled={!hasListeningHistory && recipe.id !== "balanced"} title={!hasListeningHistory && recipe.id !== "balanced" ? "Necesita un historial de escuchas" : undefined} onClick={() => regenerate({ ...options, recipe: recipe.id })}><strong>{recipe.title}</strong><small>{recipe.copy}</small></button>)}</div>
        {!hasListeningHistory && <p className="studio-no-history">Estas canciones no incluyen escuchas. Puedes crear y editar una lista, pero las recetas basadas en tus favoritos necesitan un historial de Spotify.</p>}
        <label>Canciones <strong>{options.count}</strong><input type="range" min="5" max="100" step="5" value={options.count} onChange={(event) => setOptions({ ...options, count: Number(event.target.value) })} /></label>
        <label>Máximo por artista <strong>{options.maxPerArtist}</strong><input type="range" min="1" max="10" value={options.maxPerArtist} onChange={(event) => setOptions({ ...options, maxPerArtist: Number(event.target.value) })} /></label>
        {options.recipe === "balanced" && <label>Variedad <strong>{options.novelty} %</strong><input type="range" min="0" max="100" step="10" value={options.novelty} onChange={(event) => setOptions({ ...options, novelty: Number(event.target.value) })} /></label>}
        <label>Excluir artistas <input value={excludedInput} onChange={(event) => setExcludedInput(event.target.value)} placeholder="Separados por comas" /></label>
        <button className="primary-button" onClick={() => regenerate({ ...options, excludedArtists: excludedInput.split(",") })}><WandSparkles size={17} /> Generar playlist</button>
        <div className="recipe-file-actions"><button onClick={saveRecipe}><Download size={16} /> Guardar receta</button><input ref={recipeInput} type="file" accept=".json,application/json" hidden onChange={(event) => loadRecipe(event.target.files?.[0])} /><button onClick={() => recipeInput.current?.click()}>Cargar receta</button></div>
        <p className="studio-help">Las sugerencias se calculan en tu navegador con minutos, frecuencia y última escucha. No requieren servicios de pago.</p>
        <div className="catalog-explore"><span className="kicker">Nuevas canciones</span><h3>Explora un artista</h3><p>Con Spotify conectado, descubre temas de su discografía que todavía no aparecen en tus datos.</p><select value={artistToExplore} onChange={(event) => setArtistToExplore(event.target.value)}>{favoriteArtists.map((artist) => <option key={artist} value={artist}>{artist}</option>)}</select><button disabled={exploring || !artistToExplore} onClick={explore}>{exploring ? "Buscando…" : connected ? "Buscar canciones" : "Conectar para descubrir"}</button>{discovered.length > 0 && <div className="catalog-results">{discovered.map((track) => <div key={track.key}><span><strong>{track.item}</strong><small>{track.collection} · <a href={`https://open.spotify.com/track/${track.uri.split(":").at(-1)}`} target="_blank" rel="noreferrer">Spotify</a></small></span><button aria-label={`Añadir ${track.item}`} onClick={() => { if (!tracks.some((item) => item.uri === track.uri)) commit([...tracks, track]); }}>+</button></div>)}</div>}</div>
      </aside>
      <section className="panel studio-preview">
        <div className="studio-preview-head"><div><span className="kicker">Vista previa editable</span><h2>{tracks.length} canciones</h2></div><span>{new Set(tracks.map((track) => track.creator)).size} artistas</span></div>
        <label className="playlist-title">Nombre de la playlist<input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="studio-track-list">{tracks.map((track, index) => <div className="studio-track" key={`${track.key}-${index}`}><span className="studio-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{track.item}</strong><small>{track.creator} · {track.reason}{track.uri.startsWith("spotify:track:") && <><span aria-hidden="true"> · </span><a href={`https://open.spotify.com/track/${track.uri.split(":").at(-1)}`} target="_blank" rel="noreferrer">Abrir en Spotify</a></>}</small></div><div className="studio-track-actions"><button title="Subir" aria-label={`Subir ${track.item}`} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button title="Bajar" aria-label={`Bajar ${track.item}`} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button title="Cambiar sugerencia" aria-label={`Cambiar ${track.item}`} onClick={() => replace(index)}><RefreshCcw size={16} /></button><button title="Quitar" aria-label={`Quitar ${track.item}`} onClick={() => commit(tracks.filter((_, position) => position !== index))}><Minus size={16} /></button></div></div>)}</div>
        {!tracks.length && <p>No hay canciones con estos filtros. Prueba otra receta o importa más datos.</p>}
        <div className="studio-add"><input value={extraUri} onChange={(event) => setExtraUri(event.target.value)} placeholder="Pega un enlace a una canción de Spotify" /><button onClick={addUri}><Plus size={17} /> Añadir</button></div>
        <div className="studio-footer"><button disabled={!past.length} onClick={undo}><Undo2 size={17} /> Deshacer</button><button disabled={!future.length} onClick={redo}><Redo2 size={17} /> Rehacer</button><button onClick={() => commit([...tracks].reverse())}><Shuffle size={17} /> Invertir orden</button><button onClick={exportCsv}><Download size={17} /> Descargar CSV</button><button className="primary-button" onClick={publish} disabled={working || !tracks.length}>{working ? "Creando…" : connected ? pendingPublication ? `Crear con ${pendingPublication.uris.length} canciones` : "Crear en Spotify" : "Conectar Spotify"}</button></div>
        {message && <p className="studio-message" role="status">{message} {publishedUrl && <a href={publishedUrl} target="_blank" rel="noreferrer">Abrir en Spotify <ExternalLink size={14} /></a>}</p>}
      </section>
    </div>
  </div>;
}
