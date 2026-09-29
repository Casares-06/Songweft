import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, ExternalLink, Minus, Plus, RefreshCcw, Shuffle, WandSparkles } from "lucide-react";
import { buildCatalog, recommendTracks, type PlaylistOptions, type Recipe, type TrackChoice } from "./playlist";
import { createSpotifyPlaylist, searchSpotifyTrack } from "./spotifyApi";
import type { ImportResult } from "./types";

const recipes: { id: Recipe; title: string; copy: string }[] = [
  { id: "favorites", title: "Mis imprescindibles", copy: "Las canciones que más tiempo te han acompañado." },
  { id: "forgotten", title: "Volver a escuchar", copy: "Favoritas que llevan tiempo en silencio." },
  { id: "deepcuts", title: "Más allá de los éxitos", copy: "Pistas menos conocidas de tus artistas fuertes." },
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
  const catalog = useMemo(() => buildCatalog(result.plays, result.libraryTracks), [result]);
  const [options, setOptions] = useState<PlaylistOptions>({ recipe: "balanced", count: 30, maxPerArtist: 3, novelty: 30, excludedArtists: [] });
  const [excludedInput, setExcludedInput] = useState("");
  const [title, setTitle] = useState("Mi historia musical");
  const [tracks, setTracks] = useState<TrackChoice[]>(() => recommendTracks(catalog, options));
  const [extraUri, setExtraUri] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const regenerate = (next = options) => { setOptions(next); setTracks(recommendTracks(catalog, next)); setMessage(""); };
  const move = (index: number, step: number) => {
    const next = [...tracks];
    const destination = index + step;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    setTracks(next);
  };
  const replace = (index: number) => {
    const used = new Set(tracks.map((track) => track.key));
    const replacement = recommendTracks(catalog.filter((track) => !used.has(track.key)), { ...options, count: 1 })[0];
    if (!replacement) { setMessage("No quedan canciones distintas con estos filtros."); return; }
    setTracks(tracks.map((track, position) => position === index ? replacement : track));
  };
  const addUri = () => {
    const match = extraUri.match(/(?:open\.spotify\.com\/track\/|spotify:track:)([A-Za-z0-9]{22})/);
    if (!match) { setMessage("Pega un enlace válido a una canción de Spotify."); return; }
    const uri = `spotify:track:${match[1]}`;
    if (tracks.some((track) => track.uri === uri)) { setMessage("La canción ya está en la lista."); return; }
    setTracks([...tracks, { key: uri, uri, item: "Canción añadida", creator: "Spotify", collection: "", sourceFile: "Enlace", minutes: 0, listens: 0, lastPlayed: 0, reason: "Añadida manualmente" }]);
    setExtraUri(""); setMessage("");
  };
  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    download("songweft-playlist.csv", ["Posición,Canción,Artista,Spotify URI,Motivo", ...tracks.map((track, index) => [String(index + 1), track.item, track.creator, track.uri, track.reason].map(escape).join(","))].join("\r\n"), "text/csv;charset=utf-8");
  };
  const publish = async () => {
    if (!connected) { onConnect(); return; }
    setWorking(true); setMessage(""); setPublishedUrl("");
    try {
      const uris: string[] = [];
      const missing: string[] = [];
      for (const track of tracks) {
        if (track.uri.startsWith("spotify:track:")) { uris.push(track.uri); continue; }
        const match = await searchSpotifyTrack(track.item, track.creator);
        if (match) uris.push(match);
        else missing.push(`${track.item} — ${track.creator}`);
      }
      if (!uris.length) throw new Error("Spotify no encontró ninguna canción de la lista.");
      const url = await createSpotifyPlaylist(title.trim() || "Mi playlist de Songweft", uris);
      setPublishedUrl(url ?? "");
      setMessage(`Playlist privada creada con ${uris.length} canciones.${missing.length ? ` No se encontraron ${missing.length}; revisa el CSV exportado.` : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo publicar la playlist."); }
    finally { setWorking(false); }
  };

  return <div className="studio-page">
    <header className="page-title"><span className="kicker">Crear · 02</span><h1>Estudio de playlists</h1><p>Tu historial propone canciones. Tú decides cuáles se quedan y en qué orden.</p></header>
    <div className="studio-layout">
      <aside className="panel studio-controls">
        <h2>Tu receta</h2>
        <div className="recipe-grid">{recipes.map((recipe) => <button key={recipe.id} className={options.recipe === recipe.id ? "selected" : ""} onClick={() => regenerate({ ...options, recipe: recipe.id })}><strong>{recipe.title}</strong><small>{recipe.copy}</small></button>)}</div>
        <label>Canciones <strong>{options.count}</strong><input type="range" min="5" max="100" step="5" value={options.count} onChange={(event) => setOptions({ ...options, count: Number(event.target.value) })} /></label>
        <label>Máximo por artista <strong>{options.maxPerArtist}</strong><input type="range" min="1" max="10" value={options.maxPerArtist} onChange={(event) => setOptions({ ...options, maxPerArtist: Number(event.target.value) })} /></label>
        {options.recipe === "balanced" && <label>Variedad <strong>{options.novelty} %</strong><input type="range" min="0" max="100" step="10" value={options.novelty} onChange={(event) => setOptions({ ...options, novelty: Number(event.target.value) })} /></label>}
        <label>Excluir artistas <input value={excludedInput} onChange={(event) => setExcludedInput(event.target.value)} placeholder="Separados por comas" /></label>
        <button className="primary-button" onClick={() => regenerate({ ...options, excludedArtists: excludedInput.split(",") })}><WandSparkles size={17} /> Generar playlist</button>
        <p className="studio-help">Las sugerencias se calculan en tu navegador con minutos, frecuencia y última escucha. No requieren servicios de pago.</p>
      </aside>
      <section className="panel studio-preview">
        <div className="studio-preview-head"><div><span className="kicker">Vista previa editable</span><h2>{tracks.length} canciones</h2></div><span>{new Set(tracks.map((track) => track.creator)).size} artistas</span></div>
        <label className="playlist-title">Nombre de la playlist<input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="studio-track-list">{tracks.map((track, index) => <div className="studio-track" key={`${track.key}-${index}`}><span className="studio-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{track.item}</strong><small>{track.creator} · {track.reason}</small></div><div className="studio-track-actions"><button title="Subir" aria-label={`Subir ${track.item}`} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button title="Bajar" aria-label={`Bajar ${track.item}`} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button title="Cambiar sugerencia" aria-label={`Cambiar ${track.item}`} onClick={() => replace(index)}><RefreshCcw size={16} /></button><button title="Quitar" aria-label={`Quitar ${track.item}`} onClick={() => setTracks(tracks.filter((_, position) => position !== index))}><Minus size={16} /></button></div></div>)}</div>
        {!tracks.length && <p>No hay canciones con estos filtros. Prueba otra receta o importa más datos.</p>}
        <div className="studio-add"><input value={extraUri} onChange={(event) => setExtraUri(event.target.value)} placeholder="Pega un enlace a una canción de Spotify" /><button onClick={addUri}><Plus size={17} /> Añadir</button></div>
        <div className="studio-footer"><button onClick={() => setTracks((current) => [...current].reverse())}><Shuffle size={17} /> Invertir orden</button><button onClick={exportCsv}><Download size={17} /> Descargar CSV</button><button className="primary-button" onClick={publish} disabled={working || !tracks.length}>{working ? "Creando…" : connected ? "Crear en Spotify" : "Conectar Spotify"}</button></div>
        {message && <p className="studio-message" role="status">{message} {publishedUrl && <a href={publishedUrl} target="_blank" rel="noreferrer">Abrir en Spotify <ExternalLink size={14} /></a>}</p>}
      </section>
    </div>
  </div>;
}
