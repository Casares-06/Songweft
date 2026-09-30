import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, ExternalLink, Minus, Plus, Redo2, RefreshCcw, Search, Shuffle, Undo2, WandSparkles } from "lucide-react";
import { buildCatalog, deduplicateTracks, mixDiscoveredTracks, recommendTracks, recordingKey, trackNameKey, type PlaylistOptions, type Recipe, type TrackChoice } from "./playlist";
import { createSpotifyPlaylist, exploreArtistCatalog, getSpotifyTrack, searchSpotifyArtists, searchSpotifyTrack } from "./spotifyApi";
import type { ImportResult, Play } from "./types";

const recipes: { id: Recipe; title: string; copy: string }[] = [
  { id: "favorites", title: "Mis imprescindibles", copy: "Las canciones que más tiempo te han acompañado." },
  { id: "forgotten", title: "Volver a escuchar", copy: "Favoritas que llevan tiempo en silencio." },
  { id: "deepcuts", title: "Más allá de tus éxitos", copy: "Temas que tú has escuchado menos de tus artistas favoritos." },
  { id: "balanced", title: "A mi manera", copy: "Equilibrio personal entre favoritos y variedad." },
  { id: "artists", title: "Artistas elegidos", copy: "Elige varios de tu historial o del catálogo de Spotify." },
  { id: "timecapsule", title: "Cápsula temporal", copy: "Recupera la música de la etapa seleccionada." },
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

export default function Studio({ result, knownPlays, connected, onConnect }: { result: ImportResult; knownPlays: Play[]; connected: boolean; onConnect: () => void }) {
  const catalog = useMemo(() => {
    const all = buildCatalog(result.plays, result.libraryTracks);
    return knownPlays.length ? all.filter((track) => track.lastPlayed > 0) : all;
  }, [result.plays, result.libraryTracks, knownPlays.length]);
  const knownCatalog = useMemo(() => buildCatalog(knownPlays), [knownPlays]);
  const hasListeningHistory = catalog.some((track) => track.minutes > 0);
  const favoriteArtists = useMemo(() => {
    const minutes = new Map<string, number>();
    catalog.forEach((track) => minutes.set(track.creator, (minutes.get(track.creator) ?? 0) + track.minutes));
    return [...minutes].sort((a, b) => b[1] - a[1]).map(([artist]) => artist);
  }, [catalog]);
  const [options, setOptions] = useState<PlaylistOptions>({ recipe: "balanced", count: 50, maxPerArtist: 5, novelty: 30, excludedArtists: [], selectedArtists: [], allTracks: false, order: "balanced", onlyUnheard: false });
  const [step, setStep] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const [albumGroups, setAlbumGroups] = useState({ album: true, single: true, appears_on: true, compilation: false });
  const [artistQuery, setArtistQuery] = useState("");
  const [catalogArtists, setCatalogArtists] = useState<{ id: string; name: string }[]>([]);
  const [spotifyArtistIds, setSpotifyArtistIds] = useState<Record<string, string>>({});
  const [includeUnheard, setIncludeUnheard] = useState(false);
  const [artistSearching, setArtistSearching] = useState(false);
  const matchedArtists = favoriteArtists.filter((artist) => artist.toLowerCase().includes(artistQuery.toLowerCase()));
  const [excludedInput, setExcludedInput] = useState("");
  const [title, setTitle] = useState("Mi historia musical");
  const [description, setDescription] = useState("Creada con Songweft desde mi historia musical");
  const [previewQuery, setPreviewQuery] = useState("");
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
  const addUri = async () => {
    const match = extraUri.match(/(?:open\.spotify\.com\/track\/|spotify:track:)([A-Za-z0-9]{22})/);
    if (!match) { setMessage("Pega un enlace válido a una canción de Spotify."); return; }
    const uri = `spotify:track:${match[1]}`;
    if (tracks.some((track) => track.uri === uri)) { setMessage("La canción ya está en la lista."); return; }
    if (!connected) { onConnect(); return; }
    setWorking(true);
    try {
      const found = await getSpotifyTrack(uri);
      if (!found) throw new Error("Spotify no encontró esa canción.");
      const candidate: TrackChoice = { ...found, key: found.uri, minutes: 0, listens: 0, lastPlayed: 0, reason: "Añadida manualmente" };
      if (tracks.some((track) => recordingKey(track) === recordingKey(candidate))) { setMessage("Esa misma grabación ya está en la playlist, aunque tenga otro ID en Spotify."); return; }
      commit([...tracks, candidate]); setExtraUri(""); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo añadir la canción."); }
    finally { setWorking(false); }
  };
  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    download("songweft-playlist.csv", ["Posición,Canción,Artista,Spotify URI,Motivo", ...tracks.map((track, index) => [String(index + 1), track.item, track.creator, track.uri, track.reason].map(escape).join(","))].join("\r\n"), "text/csv;charset=utf-8");
  };
  const saveRecipe = () => download("songweft-receta.json", JSON.stringify({ app: "Songweft", version: 3, title, description, options, includeUnheard, albumGroups, spotifyArtistIds }, null, 2), "application/json;charset=utf-8");
  const loadRecipe = async (file?: File) => {
    if (!file || file.size > 50_000) { setMessage("La receta debe ser un JSON de menos de 50 KB."); return; }
    try {
      const saved = JSON.parse(await file.text());
      const next = saved.options as PlaylistOptions;
      if (!recipes.some((recipe) => recipe.id === next?.recipe) || !Number.isInteger(next.count) || next.count < 5 || next.count > 5000 || !Number.isInteger(next.maxPerArtist) || next.maxPerArtist < 1 || next.maxPerArtist > 10000 || !Number.isInteger(next.novelty) || next.novelty < 0 || next.novelty > 100 || !Array.isArray(next.excludedArtists) || !next.excludedArtists.every((artist) => typeof artist === "string") || (next.selectedArtists !== undefined && (!Array.isArray(next.selectedArtists) || !next.selectedArtists.every((artist) => typeof artist === "string")))) throw new Error("La receta no tiene un formato válido.");
      setTitle(typeof saved.title === "string" ? saved.title.slice(0, 100) : title);
      setDescription(typeof saved.description === "string" ? saved.description.slice(0, 300) : description);
      setExcludedInput(next.excludedArtists.join(", "));
      setIncludeUnheard(saved.includeUnheard === true);
      if (saved.albumGroups && typeof saved.albumGroups === "object") setAlbumGroups((current) => ({ ...current, ...saved.albumGroups }));
      setSpotifyArtistIds(saved.spotifyArtistIds && typeof saved.spotifyArtistIds === "object" && !Array.isArray(saved.spotifyArtistIds) ? Object.fromEntries(Object.entries(saved.spotifyArtistIds).filter(([, id]) => typeof id === "string" && /^[A-Za-z0-9]{22}$/.test(id))) as Record<string, string> : {});
      regenerate(next);
      setMessage("Receta cargada. Puedes seguir ajustándola antes de exportar.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo abrir la receta."); }
  };
  const explore = async () => {
    if (!connected) { onConnect(); return; }
    setExploring(true); setMessage("");
    try {
      const known = new Set(knownCatalog.map((track) => track.uri).filter(Boolean));
      const knownNames = new Set(knownCatalog.map((track) => trackNameKey(track.creator, track.item)));
      const items = await exploreArtistCatalog(artistToExplore, known, knownNames, undefined, { groups: ["album", "single", "appears_on"], maxTracks: 50 });
      setDiscovered(items.map((item) => ({ ...item, key: item.uri, minutes: 0, listens: 0, lastPlayed: 0, reason: `Una canción de ${artistToExplore} que no aparece en tus datos` })));
      if (!items.length) setMessage("No se encontraron canciones nuevas entre los primeros álbumes consultados.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo explorar la discografía."); }
    finally { setExploring(false); }
  };
  const searchArtists = async () => {
    if (!connected) { onConnect(); return; }
    setArtistSearching(true);
    try { setCatalogArtists(await searchSpotifyArtists(artistQuery)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo buscar artistas."); }
    finally { setArtistSearching(false); }
  };
  const toggleArtist = (name: string) => setOptions((current) => ({ ...current, selectedArtists: current.selectedArtists?.includes(name) ? current.selectedArtists.filter((artist) => artist !== name) : [...(current.selectedArtists ?? []), name] }));
  const generate = async () => {
    const next = { ...options, excludedArtists: excludedInput.split(","), maxPerArtist: options.allTracks ? 10000 : options.maxPerArtist };
    if (next.recipe === "artists" && !next.selectedArtists?.length) { setMessage("Elige al menos un artista para crear esta playlist."); return; }
    let generated = recommendTracks(catalog, next);
    if (next.recipe === "artists" && (includeUnheard || next.allTracks)) {
      if (!connected) { onConnect(); return; }
      setWorking(true); setMessage("Buscando canciones que no aparecen en tu historial…");
      try {
        const known = new Set(knownCatalog.map((track) => track.uri).filter(Boolean));
        const knownNames = new Set(knownCatalog.map((track) => trackNameKey(track.creator, track.item)));
        const unseen: TrackChoice[] = [];
        const selected = next.selectedArtists ?? [];
        for (const [index, artist] of selected.entries()) {
          setMessage(`Explorando ${artist} (${index + 1}/${selected.length})…`);
          const found = await exploreArtistCatalog(artist, known, knownNames, spotifyArtistIds[artist], {
            groups: (Object.entries(albumGroups).filter(([, enabled]) => enabled).map(([group]) => group)) as Array<"album" | "single" | "appears_on" | "compilation">,
            includeKnown: next.allTracks,
            maxTracks: next.allTracks ? Number.POSITIVE_INFINITY : Math.min(next.maxPerArtist, Math.ceil(next.count * next.novelty / 100)),
            onProgress: setMessage,
          });
          unseen.push(...found.map((item) => ({ ...item, key: item.uri, artistGroup: artist, minutes: 0, listens: 0, lastPlayed: 0, reason: `No aparece en tu historial · ${artist}` })));
        }
        generated = mixDiscoveredTracks(generated, unseen, next);
        generated = deduplicateTracks(generated);
        const newCount = generated.filter((track) => !track.lastPlayed).length;
        setMessage(`${generated.length} canciones únicas propuestas; ${newCount} no aparecen en tu historial.${!next.allTracks && generated.length < next.count ? " No hay suficientes coincidencias con estos filtros; amplía los artistas o el máximo por artista." : ""}`);
      } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo consultar el catálogo. Prueba de nuevo."); setWorking(false); return; }
      finally { setWorking(false); }
    } else setMessage(!next.allTracks && generated.length < next.count ? `Hay ${generated.length} canciones con estos filtros. Para alcanzar ${next.count}, amplía los artistas elegidos o el máximo por artista.` : `${generated.length} canciones únicas listas para editar.`);
    setOptions(next); commit(generated);
  };
  const publish = async () => {
    if (!connected) { onConnect(); return; }
    setWorking(true); setMessage(""); setPublishedUrl("");
    try {
      const uris: string[] = pendingPublication?.uris ?? [];
      const missing: string[] = pendingPublication?.missing ?? [];
      if (!pendingPublication) {
        for (const track of deduplicateTracks(tracks)) {
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
      const uniqueUris = [...new Set(uris)];
      const url = await createSpotifyPlaylist(title.trim() || "Mi playlist de Songweft", uniqueUris, { description, onProgress: (done, total) => setMessage(`Añadiendo canciones a Spotify: ${done} de ${total}…`) });
      setPendingPublication(null);
      setPublishedUrl(url ?? "");
      setMessage(`Playlist privada creada con ${uniqueUris.length} canciones únicas.${missing.length ? ` Se omitieron ${missing.length} que Spotify no encontró.` : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo publicar la playlist."); }
    finally { setWorking(false); }
  };

  const visibleTracks = tracks.map((track, index) => ({ track, index })).filter(({ track }) => `${track.item} ${track.creator}`.toLowerCase().includes(previewQuery.trim().toLowerCase()));
  const unheardCount = tracks.filter((track) => !track.lastPlayed).length;
  const removeDuplicates = () => {
    const unique = deduplicateTracks(tracks);
    commit(unique);
    setMessage(unique.length === tracks.length ? "No había grabaciones repetidas." : `Se retiraron ${tracks.length - unique.length} duplicados, incluidos IDs alternativos de la misma canción.`);
  };
  const balanceArtists = () => {
    const groups = new Map<string, TrackChoice[]>();
    tracks.forEach((track) => groups.set(track.creator, [...(groups.get(track.creator) ?? []), track]));
    const next: TrackChoice[] = [];
    while ([...groups.values()].some((group) => group.length)) for (const group of groups.values()) { const track = group.shift(); if (track) next.push(track); }
    commit(next); setMessage("Artistas alternados manteniendo todas las canciones.");
  };
  const shuffleTracks = () => commit([...tracks].sort(() => Math.random() - .5));

  return <div className="studio-page">
    <header className="page-title"><span className="kicker">Crear · 02</span><h1>Construye una playlist de verdad</h1><p>Empieza con una idea, elige el contenido y revisa cada canción. Songweft evita la misma grabación aunque Spotify la publique con IDs distintos.</p></header>
    <nav className="studio-steps" aria-label="Pasos del creador">{["Idea", "Contenido", "Mezcla", "Revisar"].map((label, index) => <button key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => setStep(index + 1)}><span>{step > index + 1 ? <Check size={15} /> : index + 1}</span>{label}</button>)}</nav>
    <div className="studio-layout">
      <aside className="panel studio-controls">
        {step === 1 && <section className="studio-step"><span className="kicker">Paso 1</span><h2>¿Qué quieres escuchar?</h2><p className="step-copy">Elige una base. Después podrás ajustar cada detalle.</p><div className="recipe-grid">{recipes.map((recipe) => <button key={recipe.id} aria-pressed={options.recipe === recipe.id} className={options.recipe === recipe.id ? "selected" : ""} disabled={working || (!hasListeningHistory && !["balanced", "artists"].includes(recipe.id))} onClick={() => setOptions({ ...options, recipe: recipe.id })}><strong>{recipe.title}</strong><small>{recipe.copy}</small></button>)}</div><button className="primary-button" onClick={() => setStep(options.recipe === "artists" ? 2 : 3)}>Continuar</button></section>}

        {step === 2 && <section className="studio-step artist-picker"><span className="kicker">Paso 2</span><h2>Elige artistas</h2><p className="step-copy">Puedes usar cualquiera de tu historial o buscarlo en Spotify. No hay límite de artistas.</p><div className="artist-search"><Search size={16} /><input disabled={working} value={artistQuery} onChange={(event) => { setArtistQuery(event.target.value); setCatalogArtists([]); }} placeholder="Buscar artista" /></div><div className="artist-choice-list">{matchedArtists.slice(0, 100).map((artist) => <label key={artist}><input disabled={working} type="checkbox" checked={options.selectedArtists?.includes(artist) ?? false} onChange={() => toggleArtist(artist)} />{artist}</label>)}{!matchedArtists.length && <p>No aparece en tu historial. Búscalo en Spotify.</p>}</div><button disabled={working || !artistQuery.trim() || artistSearching} onClick={searchArtists}>{artistSearching ? "Buscando…" : connected ? "Buscar en Spotify" : "Conectar Spotify para buscar"}</button>{catalogArtists.length > 0 && <div className="artist-choice-list spotify-results">{catalogArtists.map((artist) => <label key={artist.id}><input type="checkbox" checked={options.selectedArtists?.includes(artist.name) ?? false} onChange={() => { setSpotifyArtistIds((current) => ({ ...current, [artist.name]: artist.id })); toggleArtist(artist.name); }} />{artist.name}<a href={`https://open.spotify.com/artist/${artist.id}`} target="_blank" rel="noreferrer">Ver ↗</a></label>)}</div>}<div className="selection-summary"><strong>{options.selectedArtists?.length ?? 0}</strong><span>artistas elegidos</span></div><div className="artist-chips">{options.selectedArtists?.map((artist) => <button key={artist} onClick={() => toggleArtist(artist)}>{artist} ×</button>)}</div><div className="step-actions"><button onClick={() => setStep(1)}>Atrás</button><button className="primary-button" disabled={!options.selectedArtists?.length} onClick={() => setStep(3)}>Continuar</button></div></section>}

        {step === 3 && <section className="studio-step"><span className="kicker">Paso 3</span><h2>Afina la mezcla</h2><p className="step-copy">“Toda la selección” recorre la discografía completa y no impone un máximo de canciones.</p>{options.recipe === "artists" && <><div className="choice-cards"><button className={!options.allTracks ? "selected" : ""} onClick={() => setOptions({ ...options, allTracks: false })}><strong>Playlist medida</strong><small>Elige una cantidad aproximada.</small></button><button className={options.allTracks ? "selected" : ""} onClick={() => { setOptions({ ...options, allTracks: true, onlyUnheard: false }); setIncludeUnheard(true); }}><strong>Toda la selección</strong><small>Todas las canciones acreditadas de esos artistas.</small></button></div>{!options.allTracks && <label>Cantidad objetivo <strong>{options.count}</strong><input type="range" min="10" max="500" step="10" value={options.count} onChange={(event) => setOptions({ ...options, count: Number(event.target.value) })} /></label>}<label className="artist-new-switch"><input type="checkbox" checked={includeUnheard} onChange={(event) => setIncludeUnheard(event.target.checked)} /> Incluir canciones que no aparecen en mi historial</label>{includeUnheard && !options.allTracks && <><label>Descubrimiento <strong>{options.novelty} %</strong><input type="range" min="0" max="100" step="10" value={options.novelty} onChange={(event) => setOptions({ ...options, novelty: Number(event.target.value) })} /></label><label className="artist-new-switch"><input type="checkbox" checked={options.onlyUnheard ?? false} onChange={(event) => setOptions({ ...options, onlyUnheard: event.target.checked })} /> Solo canciones nuevas para mis datos</label></>}<fieldset className="catalog-groups"><legend>Qué publicaciones incluir</legend>{Object.entries({ album: "Álbumes", single: "Sencillos y EP", appears_on: "Colaboraciones", compilation: "Recopilatorios" }).map(([key, label]) => <label key={key}><input type="checkbox" checked={albumGroups[key as keyof typeof albumGroups]} onChange={(event) => setAlbumGroups({ ...albumGroups, [key]: event.target.checked })} />{label}</label>)}</fieldset></>}
          {!options.allTracks && <label>Máximo por artista<select value={options.maxPerArtist} onChange={(event) => setOptions({ ...options, maxPerArtist: Number(event.target.value) })}>{[1, 2, 3, 5, 10, 20, 50, 100, 500, 10000].map((count) => <option key={count} value={count}>{count === 10000 ? "Sin límite" : count}</option>)}</select></label>}
          <label>Orden inicial<select value={options.order} onChange={(event) => setOptions({ ...options, order: event.target.value as PlaylistOptions["order"] })}><option value="balanced">Alternar artistas</option><option value="ranking">Más escuchadas primero</option><option value="recent">Escuchadas recientemente</option><option value="oldest">Más antiguas primero</option><option value="random">Aleatorio</option></select></label><button className="advanced-toggle" onClick={() => setAdvanced(!advanced)}>{advanced ? "Ocultar opciones avanzadas" : "Afinar más"}</button>{advanced && <div className="advanced-panel"><label>Excluir artistas<input value={excludedInput} onChange={(event) => setExcludedInput(event.target.value)} placeholder="Separados por comas" /></label><p>Las reediciones, remasterizaciones y otros IDs de la misma grabación se agrupan automáticamente.</p></div>}<div className="step-actions"><button onClick={() => setStep(options.recipe === "artists" ? 2 : 1)}>Atrás</button><button className="primary-button" disabled={working} onClick={async () => { await generate(); setStep(4); }}>{working ? "Explorando catálogo…" : <><WandSparkles size={17} /> Crear vista previa</>}</button></div></section>}

        {step === 4 && <section className="studio-step"><span className="kicker">Paso 4</span><h2>Lista para revisar</h2><div className="review-numbers"><div><strong>{tracks.length}</strong><span>canciones</span></div><div><strong>{new Set(tracks.map((track) => track.creator)).size}</strong><span>artistas</span></div><div><strong>{unheardCount}</strong><span>nuevas en tus datos</span></div></div><button className="primary-button" onClick={() => setStep(3)}>Cambiar la mezcla</button><div className="recipe-file-actions"><button onClick={saveRecipe}><Download size={16} /> Guardar receta</button><input ref={recipeInput} type="file" accept=".json,application/json" hidden onChange={(event) => loadRecipe(event.target.files?.[0])} /><button onClick={() => recipeInput.current?.click()}>Cargar receta</button></div><details className="catalog-explore"><summary>Añadir canciones de una discografía</summary><select value={artistToExplore} onChange={(event) => setArtistToExplore(event.target.value)}>{favoriteArtists.map((artist) => <option key={artist}>{artist}</option>)}</select><button disabled={exploring || !artistToExplore} onClick={explore}>{exploring ? "Buscando…" : "Explorar"}</button>{discovered.length > 0 && <div className="catalog-results">{discovered.map((track) => <div key={track.key}><span><strong>{track.item}</strong><small>{track.creator}</small></span><button disabled={tracks.some((item) => recordingKey(item) === recordingKey(track))} onClick={() => commit(deduplicateTracks([...tracks, track]))}>+</button></div>)}</div>}</details></section>}
      </aside>

      <section className="panel studio-preview">
        <div className="studio-preview-head"><div><span className="kicker">Vista previa editable</span><h2>{tracks.length} canciones únicas</h2></div><span>{new Set(tracks.map((track) => track.creator)).size} artistas</span></div><div className="playlist-meta"><label>Nombre<input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} /></label><label>Descripción<input value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} /></label></div><div className="preview-toolbar"><div className="artist-search"><Search size={15} /><input value={previewQuery} onChange={(event) => setPreviewQuery(event.target.value)} placeholder="Buscar en la playlist" /></div><button onClick={balanceArtists}>Alternar artistas</button><button onClick={shuffleTracks}><Shuffle size={15} /> Barajar</button><button onClick={removeDuplicates}>Quitar duplicados</button></div>
        <div className="studio-track-list">{visibleTracks.map(({ track, index }) => <div className="studio-track" key={`${track.key}-${index}`}><span className="studio-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{track.item}</strong><small>{track.creator} · {track.reason}{track.uri.startsWith("spotify:track:") && <><span> · </span><a href={`https://open.spotify.com/track/${track.uri.split(":").at(-1)}`} target="_blank" rel="noreferrer">Spotify ↗</a></>}</small></div><div className="studio-track-actions"><button title="Subir" onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button title="Bajar" onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button title="Cambiar" onClick={() => replace(index)}><RefreshCcw size={16} /></button><button title="Quitar" onClick={() => commit(tracks.filter((_, position) => position !== index))}><Minus size={16} /></button></div></div>)}</div>{!tracks.length && <p className="empty-playlist">Configura la idea y pulsa “Crear vista previa”.</p>}<div className="studio-add"><input value={extraUri} onChange={(event) => setExtraUri(event.target.value)} placeholder="Enlace de una canción de Spotify" /><button disabled={working} onClick={addUri}><Plus size={17} /> Añadir</button></div><div className="studio-footer"><button disabled={!past.length} onClick={undo}><Undo2 size={17} /> Deshacer</button><button disabled={!future.length} onClick={redo}><Redo2 size={17} /> Rehacer</button><button onClick={exportCsv}><Download size={17} /> CSV</button><button className="primary-button" onClick={publish} disabled={working || !tracks.length}>{working ? "Procesando…" : connected ? pendingPublication ? `Crear con ${pendingPublication.uris.length}` : `Crear ${tracks.length} en Spotify` : "Conectar Spotify"}</button></div>{message && <p className="studio-message" role="status">{message} {publishedUrl && <a href={publishedUrl} target="_blank" rel="noreferrer">Abrir en Spotify <ExternalLink size={14} /></a>}</p>}
      </section>
    </div>
  </div>;
}
