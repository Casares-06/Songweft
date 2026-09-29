import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  DatabaseZap,
  Disc3,
  FileArchive,
  Flame,
  Headphones,
  History,
  Info,
  ListMusic,
  LockKeyhole,
  Music2,
  Podcast,
  RotateCcw,
  Search,
  ShieldCheck,
  Share2,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import {
  breakdown,
  daily,
  discoveries,
  longestStreak,
  percentage,
  ranking,
  sessions,
  sumMinutes,
  timeSeries,
} from "./analytics";
import { importSources, mergeImportResults, parsePastedTracks } from "./sources";
import Studio from "./Studio";
import Wrapped from "./Wrapped";
import { connectSpotify, disconnectSpotify, finishSpotifyLogin, importSavedSpotifyTracks, importSpotifyPlaylist, listenForSpotifyConnection, spotifyConnected } from "./spotifyApi";
import type { ImportResult, LibraryTrack, Play, RankingRow } from "./types";

type Page = "Resumen" | "Rankings" | "Historia" | "Hábitos" | "Sesiones" | "Descubrimiento" | "Podcasts" | "Explorar" | "Fuentes" | "Estudio" | "Tarjeta" | "Conexiones" | "Calidad" | "Información";

const pages: { name: Page; icon: typeof Activity }[] = [
  { name: "Resumen", icon: Activity },
  { name: "Rankings", icon: BarChart3 },
  { name: "Historia", icon: History },
  { name: "Hábitos", icon: Clock3 },
  { name: "Sesiones", icon: Flame },
  { name: "Descubrimiento", icon: Compass },
  { name: "Podcasts", icon: Podcast },
  { name: "Explorar", icon: Search },
  { name: "Fuentes", icon: FileArchive },
  { name: "Estudio", icon: ListMusic },
  { name: "Tarjeta", icon: Share2 },
  { name: "Conexiones", icon: DatabaseZap },
  { name: "Calidad", icon: ShieldCheck },
  { name: "Información", icon: Info },
];

const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const compactDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });
const fullDate = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const logoUrl = `${import.meta.env.BASE_URL}logo.svg`;

function formatMinutes(minutes: number) {
  if (minutes >= 60) return `${decimal.format(minutes / 60)} h`;
  return `${decimal.format(minutes)} min`;
}

function Stat({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: ReactNode }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </article>
  );
}

function MiniBars({ data, labels = true, valueKind = "duration" }: { data: { label: string; value: number }[]; labels?: boolean; valueKind?: "duration" | "artists" | "tracks" }) {
  const [unit, setUnit] = useState<"minutes" | "hours">("minutes");
  const [selected, setSelected] = useState<number | null>(null);
  const visible = data.slice(-18);
  const max = Math.max(...visible.map((point) => point.value), 1);
  const active = selected === null ? null : visible[selected];
  const displayValue = (value: number) => {
    if (valueKind === "artists") return `${number.format(value)} ${value === 1 ? "artista" : "artistas"}`;
    if (valueKind === "tracks") return `${number.format(value)} ${value === 1 ? "canción" : "canciones"}`;
    return unit === "hours" ? `${decimal.format(value / 60)} h` : `${number.format(value)} min`;
  };
  return (
    <div className="chart-shell">
      <div className={`chart-controls ${valueKind === "duration" ? "" : "count-mode"}`} aria-label={valueKind === "duration" ? "Unidad del gráfico" : "Detalle del gráfico"}>
        {valueKind === "duration" && <>
          <button className={unit === "minutes" ? "active" : ""} onClick={() => setUnit("minutes")}>Min</button>
          <button className={unit === "hours" ? "active" : ""} onClick={() => setUnit("hours")}>Horas</button>
        </>}
        <span>{active ? <><strong>{active.label}</strong> · {displayValue(active.value)}</> : "Pulsa una barra para ver el detalle"}</span>
      </div>
      <div className="mini-chart" role="group" aria-label="Gráfico interactivo de tiempo escuchado">
        {visible.map((point, index) => (
          <button
            type="button"
            className={`mini-column ${selected === index ? "selected" : ""}`}
            key={point.label}
            title={`${point.label}: ${displayValue(point.value)}`}
            aria-label={`${point.label}: ${displayValue(point.value)}`}
            onClick={() => setSelected(selected === index ? null : index)}
          >
            <span className="bar-value">{point.value > max * 0.35 ? displayValue(point.value) : ""}</span>
            <span className="bar" style={{ height: `${Math.max(3, (point.value / max) * 100)}%`, animationDelay: `${index * 35}ms` }} />
            {labels && <small>{point.label.length > 7 ? point.label.slice(2) : point.label}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Podium({ rows, title }: { rows: RankingRow[]; title: string }) {
  const positions = [rows[1], rows[0], rows[2]];
  return (
    <section className="podium-panel">
      <span className="kicker">Podio</span>
      <h2>{title}</h2>
      <div className="podium">
        {positions.map((row, index) => row && (
          <article className={`podium-place place-${index}`} key={row.key}>
            <div className="podium-medal">{index === 1 ? "1" : index === 0 ? "2" : "3"}</div>
            <strong>{row.name}</strong>
            {row.secondary && <small>{row.secondary}</small>}
            <span>{formatMinutes(row.minutes)}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

const storyScenes = [
  { eyebrow: "01 · Mira", title: "Cada escucha deja una señal", copy: "Songweft convierte años de reproducciones en una historia que puedes recorrer, comparar y entender." },
  { eyebrow: "02 · Crea", title: "Tus etapas vuelven a sonar", copy: "Usa tus artistas y canciones para crear playlists, editarlas y decidir qué merece volver a sonar." },
  { eyebrow: "03 · Comparte", title: "Tu historia, tus reglas", copy: "Tu archivo se analiza aquí. Elige qué guardar, qué conectar y qué parte de tu historia compartir." },
];

function CinematicStory() {
  const [active, setActive] = useState(0);
  const items = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(Number((visible.target as HTMLElement).dataset.scene));
    }, { threshold: [0.35, 0.65], rootMargin: "-15% 0px -20%" });
    items.current.forEach((item) => item && observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="cinematic-story" id="descubrir">
      <div className={`story-visual scene-${active}`} aria-hidden="true">
        <div className="stage-light stage-light-a" />
        <div className="stage-light stage-light-b" />
        <div className="visual-disc"><Disc3 /></div>
        <div className="visual-equalizer">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ animationDelay: `${index * -90}ms` }} />)}</div>
        <div className="scene-counter">0{active + 1}<span>/ 03</span></div>
        <p>{active === 0 ? "RITMO" : active === 1 ? "MEMORIA" : "PRIVACIDAD"}</p>
      </div>
      <div className="story-copy-list">
        {storyScenes.map((scene, index) => (
          <article
            className={active === index ? "active" : ""}
            data-scene={index}
            key={scene.title}
            ref={(node) => { items.current[index] = node; }}
          >
            <span>{scene.eyebrow}</span>
            <h2>{scene.title}</h2>
            <p>{scene.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function InformationContent({ landing = false }: { landing?: boolean }) {
  return (
    <section className={landing ? "landing-information" : "information-page"} id={landing ? "informacion" : undefined}>
      <div className="information-heading">
        <span className="kicker">Información</span>
        <h2>Una historia que también puedes escuchar.</h2>
        <p>Songweft reúne tus datos musicales, muestra cómo has escuchado y te ayuda a convertirlos en playlists propias.</p>
      </div>
      <div className="steps-grid">
        <article><span>01</span><h3>Añade</h3><p>Importa ZIP, JSON o CSV, o pega tus canciones. Puedes combinar las fuentes.</p></article>
        <article><span>02</span><h3>Visualiza</h3><p>Consulta minutos reales, rankings, hábitos, sesiones y evolución.</p></article>
        <article><span>03</span><h3>Crea</h3><p>Genera, ajusta y exporta playlists. Conecta Spotify solo si quieres publicarlas allí.</p></article>
      </div>
      <div className="information-grid">
        <article className="privacy-manifesto">
          <ShieldCheck />
          <span className="kicker">Privacidad verificable</span>
          <h3>El archivo se queda en tu navegador.</h3>
          <p>El historial se procesa en memoria y desaparece al cerrar o recargar. GitHub puede registrar la visita a la página, pero no recibe tus archivos. Si conectas Spotify, el navegador guarda temporalmente la autorización en esta pestaña y se comunica directamente con Spotify. La tarjeta solo sale de aquí cuando tú la descargas.</p>
        </article>
        <article className="creator-card">
          <div className="creator-avatar">IC</div>
          <div><span className="kicker">Por Iñigo Casares</span><h3>Cómo nació Songweft</h3><p>Empecé con una pregunta sencilla: ¿cuántos minutos había escuchado realmente a mis artistas favoritos? Pedí mis datos a Spotify y construí una forma de verlos sin subir el ZIP. Al explorar mi historial descubrí que quería algo más: recuperar canciones olvidadas y crear listas a mi manera. De esa necesidad nació Songweft.</p></div>
        </article>
      </div>
      <p className="accuracy-note"><Info /> Los minutos se calculan con el campo real <code>ms_played</code>. Una reproducción se considera stream cuando alcanza 30 segundos, pero el tiempo completo siempre se conserva.</p>
    </section>
  );
}

function RankList({ rows, limit = 10 }: { rows: RankingRow[]; limit?: number }) {
  const top = rows.slice(0, limit);
  const max = top[0]?.minutes || 1;
  return (
    <div className="rank-list">
      {top.map((row, index) => (
        <div className="rank-row" key={row.key}>
          <span className="rank-position">{String(index + 1).padStart(2, "0")}</span>
          <div className="rank-copy">
            <strong>{row.name}</strong>
            {row.secondary && <small>{row.secondary}</small>}
            <div className="rank-track"><span style={{ width: `${(row.minutes / max) * 100}%` }} /></div>
          </div>
          <div className="rank-value">
            <strong>{formatMinutes(row.minutes)}</strong>
            <small>{number.format(row.streams)} reproducciones</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function UploadScreen({ onFiles, onAddLibrary, busy, progress, error }: { onFiles: (files: File[]) => void; onAddLibrary: (tracks: LibraryTrack[], source: string) => void; busy: boolean; progress: string; error: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState("");
  const addPasted = () => {
    try { const tracks = parsePastedTracks(pasted); onAddLibrary(tracks, "Lista pegada"); setPasted(""); setPasteError(""); }
    catch (caught) { setPasteError(caught instanceof Error ? caught.message : "No se pudo leer la lista."); }
  };
  const choose = (event: ChangeEvent<HTMLInputElement>) => event.target.files?.length && onFiles([...event.target.files]);
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (files.length) onFiles(files);
  };

  return (
    <main className="welcome-shell">
      <header className="welcome-header">
        <a className="brand" href="#inicio" aria-label="Songweft, volver al inicio"><span className="brand-mark"><img src={logoUrl} alt="" /></span><strong>Songweft</strong></a>
        <nav className="landing-nav" aria-label="Navegación principal"><a href="#descubrir">Descubrir</a><a href="#informacion">Información</a></nav>
        <div className="privacy-pill"><LockKeyhole size={15} /> Privado · Local · 0 €</div>
      </header>
      <section className="welcome-grid" id="inicio">
        <div className="hero-ambient" aria-hidden="true"><i /><i /><i /></div>
        <div className="intro-copy">
          <div className="eyebrow"><Sparkles size={15} /> Tu historial, bajo tu control</div>
          <h1>Tu música cuenta una historia. <em>Conviértela en algo nuevo.</em></h1>
          <p>Importa tu historial y tus listas. Visualiza tus escuchas, crea playlists a tu manera y comparte solo lo que elijas.</p>
          <div className="trust-grid">
            <div><ShieldCheck /><span><strong>Privado de verdad</strong><small>Tu archivo nunca se transfiere</small></span></div>
            <div><DatabaseZap /><span><strong>Varias fuentes</strong><small>ZIP, JSON, CSV o texto</small></span></div>
            <div><BarChart3 /><span><strong>Visualiza y crea</strong><small>Datos, playlists y tarjeta</small></span></div>
          </div>
        </div>
        <div
          className={`drop-zone ${dragging ? "dragging" : ""} ${busy ? "busy" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <input ref={input} type="file" accept=".zip,.json,.csv,application/zip,application/json,text/csv" onChange={choose} multiple hidden />
          <div className="upload-orbit"><FileArchive size={36} /></div>
          <h2>{busy ? "Uniendo tus datos" : "Añade tus archivos musicales"}</h2>
          <p>{busy ? progress : "Arrastra uno o varios ZIP, JSON o CSV. Cada archivo se procesa en este navegador."}</p>
          {busy ? <div className="loader"><span /></div> : <button className="primary-button" onClick={() => input.current?.click()}><UploadCloud size={18} /> Seleccionar archivos</button>}
          <small className="local-note"><LockKeyhole size={13} /> Historial solo en memoria · ZIP hasta 250 MB cada uno</small>
          {error && <div className="error-box" role="alert">{error}</div>}
          <div className="paste-entry"><span className="kicker">Otra forma de empezar</span><h2>Pega tus canciones</h2><p>Una por línea: <strong>Artista — Canción</strong>. Sirven para crear playlists, pero no suman minutos escuchados.</p><textarea value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={"Artista — Canción\nOtro artista — Otra canción"} rows={4} maxLength={30_000} /><button onClick={addPasted} disabled={!pasted.trim()}>Añadir canciones</button>{pasteError && <p className="error-box" role="alert">{pasteError}</p>}</div>
        </div>
        <a className="scroll-cue" href="#descubrir"><span>Descubre Songweft</span><ArrowDown /></a>
      </section>
      <CinematicStory />
      <InformationContent landing />
      <section className="final-cta">
        <span className="kicker">Tu historia empieza con tus canciones</span>
        <h2>¿Qué quieres descubrir y crear?</h2>
        <button className="primary-button" onClick={() => input.current?.click()}><UploadCloud /> Añadir mis archivos</button>
      </section>
      <footer className="welcome-footer"><span>Creado por <strong>Iñigo Casares</strong></span><span>Código abierto, cálculos transparentes y ningún rastreador.</span></footer>
    </main>
  );
}

function Overview({ plays }: { plays: Play[] }) {
  const music = plays.filter((play) => play.contentType === "track");
  const artists = ranking(music, (p) => p.creator, (p) => p.creator, undefined, (p) => p.uri);
  const tracks = ranking(music, (p) => p.uri, (p) => p.item, (p) => p.creator);
  const days = daily(plays);
  const streak = longestStreak(plays);
  const uniqueTracks = new Set(music.map((play) => play.uri)).size;
  return (
    <>
      <section className="hero-summary">
        <div><span>Tu universo sonoro</span><h1>{number.format(sumMinutes(plays))} <em>minutos</em></h1><p>Entre {compactDate.format(plays[0].at)} y {compactDate.format(plays.at(-1)!.at)}</p></div>
        <div className="record-disc"><Disc3 /><span>{plays.at(-1)!.year}</span></div>
      </section>
      <div className="artist-marquee" aria-label="Artistas más escuchados"><div>{[...artists.slice(0, 8), ...artists.slice(0, 8)].map((artist, index) => <span key={`${artist.key}-${index}`}>{artist.name}<i>✦</i></span>)}</div></div>
      <div className="stats-grid">
        <Stat label="Tiempo total" value={`${number.format(sumMinutes(plays) / 60)} h`} hint={`${number.format(sumMinutes(plays) / 60 / 24)} días seguidos`} icon={<Clock3 />} />
        <Stat label="Reproducciones" value={number.format(plays.filter((p) => p.ms >= 30_000).length)} hint="De al menos 30 segundos" icon={<Headphones />} />
        <Stat label="Canciones únicas" value={number.format(uniqueTracks)} hint={`${number.format(artists.length)} artistas`} icon={<Music2 />} />
        <Stat label="Mejor racha" value={`${streak.longest} días`} hint={streak.bestStart ? `${streak.bestStart} — ${streak.bestEnd}` : "—"} icon={<Flame />} />
      </div>
      <section className="panel chart-panel"><div className="panel-heading"><div><span className="kicker">Ritmo histórico</span><h2>Tu escucha por mes</h2></div><CalendarDays /></div><MiniBars data={timeSeries(plays, "month")} /></section>
      <div className="two-column">
        <section className="panel"><div className="panel-heading"><div><span className="kicker">Top artistas</span><h2>Las voces de tu historia</h2></div><span className="panel-total">{artists.length}</span></div><RankList rows={artists} /></section>
        <section className="panel"><div className="panel-heading"><div><span className="kicker">Top canciones</span><h2>Las que más han sonado</h2></div><span className="panel-total">{tracks.length}</span></div><RankList rows={tracks} /></section>
      </div>
      <section className="panel record-day"><span className="kicker">Tu día récord</span><h2>{days[0]?.day}</h2><strong>{formatMinutes(days[0]?.minutes ?? 0)}</strong><p>{number.format(days[0]?.events ?? 0)} eventos registrados</p></section>
    </>
  );
}

function Rankings({ plays }: { plays: Play[] }) {
  const [limit, setLimit] = useState(15);
  const music = plays.filter((play) => play.contentType === "track");
  const artists = ranking(music, (p) => p.creator, (p) => p.creator, undefined, (p) => p.uri);
  const tracks = ranking(music, (p) => p.uri, (p) => p.item, (p) => p.creator);
  const albums = ranking(music, (p) => `${p.creator}\u001f${p.collection}`, (p) => p.collection, (p) => p.creator, (p) => p.uri);
  return <><PageTitle eyebrow="Rankings" title="Tus imprescindibles" copy="Ordenados por tiempo real de escucha, no por simples aperturas." /><div className="ranking-toolbar"><span>Mostrar</span>{[10, 15, 25].map((value) => <button className={limit === value ? "active" : ""} key={value} onClick={() => setLimit(value)}>Top {value}</button>)}</div><div className="two-column podium-grid"><Podium rows={artists} title="Artistas que lideran tu historia" /><Podium rows={tracks} title="Canciones que más tiempo ocuparon" /></div><div className="three-column"><section className="panel"><h2>Artistas</h2><RankList rows={artists} limit={limit} /></section><section className="panel"><h2>Canciones</h2><RankList rows={tracks} limit={limit} /></section><section className="panel"><h2>Álbumes</h2><RankList rows={albums} limit={limit} /></section></div></>;
}

function HistoryPage({ plays }: { plays: Play[] }) {
  const years = timeSeries(plays, "year");
  const byYear = years.map(({ label, value }) => ({ year: label, minutes: value, artists: new Set(plays.filter((p) => String(p.year) === label).map((p) => p.creator)).size, tracks: new Set(plays.filter((p) => String(p.year) === label && p.contentType === "track").map((p) => p.uri)).size }));
  return <><PageTitle eyebrow="Historia" title="Tu música a través del tiempo" copy="Cada año cuenta una etapa distinta de tu vida musical." /><section className="panel chart-panel"><MiniBars data={years} /></section><section className="panel table-wrap"><table><thead><tr><th>Año</th><th>Minutos</th><th>Horas</th><th>Artistas</th><th>Canciones</th></tr></thead><tbody>{byYear.map((row) => <tr key={row.year}><td><strong>{row.year}</strong></td><td>{number.format(row.minutes)}</td><td>{number.format(row.minutes / 60)}</td><td>{number.format(row.artists)}</td><td>{number.format(row.tracks)}</td></tr>)}</tbody></table></section></>;
}

function Habits({ plays }: { plays: Play[] }) {
  const byHour = timeSeries(plays, "hour").map((p) => ({ ...p, label: `${p.label}h` }));
  const byWeekday = timeSeries(plays, "weekday").map((p) => ({ ...p, label: weekdays[Number(p.label)] }));
  const cards = [{ title: "Plataformas", rows: breakdown(plays, "platform") }, { title: "Países", rows: breakdown(plays, "country") }, { title: "Cómo empiezas", rows: breakdown(plays, "reasonStart") }, { title: "Cómo terminas", rows: breakdown(plays, "reasonEnd") }];
  return <><PageTitle eyebrow="Hábitos" title="Cómo, cuándo y dónde escuchas" copy="Patrones construidos a partir de todas tus reproducciones." /><div className="stats-grid"><Stat label="Modo aleatorio" value={`${decimal.format(percentage(plays, "shuffle"))} %`} icon={<ListMusic />} /><Stat label="Saltadas" value={`${decimal.format(percentage(plays, "skipped"))} %`} icon={<Activity />} /><Stat label="Modo offline" value={`${decimal.format(percentage(plays, "offline"))} %`} icon={<DatabaseZap />} /><Stat label="Sesión privada" value={`${decimal.format(percentage(plays, "incognito"))} %`} icon={<LockKeyhole />} /></div><div className="two-column"><section className="panel"><h2>Horas del día</h2><MiniBars data={byHour} /></section><section className="panel"><h2>Días de la semana</h2><MiniBars data={byWeekday} /></section></div><div className="four-column">{cards.map((card) => <section className="panel breakdown" key={card.title}><h2>{card.title}</h2>{card.rows.slice(0, 6).map((row) => <div key={row.name}><span>{row.name}</span><strong>{formatMinutes(row.minutes)}</strong></div>)}</section>)}</div></>;
}

function SessionsPage({ plays }: { plays: Play[] }) {
  const rows = sessions(plays);
  const days = daily(plays);
  const streak = longestStreak(plays);
  return <><PageTitle eyebrow="Sesiones" title="Rachas y maratones" copy="Una sesión nueva comienza después de 30 minutos sin actividad." /><div className="stats-grid"><Stat label="Sesiones" value={number.format(rows.length)} icon={<Headphones />} /><Stat label="Mejor racha" value={`${streak.longest} días`} icon={<Flame />} /><Stat label="Sesión más larga" value={formatMinutes(rows[0]?.minutes ?? 0)} icon={<Clock3 />} /><Stat label="Día más intenso" value={formatMinutes(days[0]?.minutes ?? 0)} hint={days[0]?.day} icon={<CalendarDays />} /></div><div className="two-column"><section className="panel"><h2>Sesiones principales</h2><div className="simple-list">{rows.slice(0, 15).map((row, i) => <div key={row.id}><span>{i + 1}</span><p><strong>{fullDate.format(row.start)}</strong><small>{row.events} eventos · {row.artists.size} artistas</small></p><b>{formatMinutes(row.minutes)}</b></div>)}</div></section><section className="panel"><h2>Días principales</h2><div className="simple-list">{days.slice(0, 15).map((row, i) => <div key={row.day}><span>{i + 1}</span><p><strong>{row.day}</strong><small>{row.events} eventos</small></p><b>{formatMinutes(row.minutes)}</b></div>)}</div></section></div></>;
}

function Discovery({ plays }: { plays: Play[] }) {
  const music = plays.filter((p) => p.contentType === "track");
  const artists = discoveries(music, "creator");
  const tracks = discoveries(music, "uri");
  const first = [...new Map(music.map((p) => [p.creator, p])).values()].slice(0, 20);
  return <><PageTitle eyebrow="Descubrimiento" title="Cuándo creció tu universo musical" copy="La primera aparición registrada de cada artista y canción." /><div className="two-column"><section className="panel"><h2>Nuevos artistas por mes</h2><MiniBars data={artists} valueKind="artists" /></section><section className="panel"><h2>Nuevas canciones por mes</h2><MiniBars data={tracks} valueKind="tracks" /></section></div><section className="panel"><h2>Tus primeros artistas registrados</h2><div className="artist-cloud">{first.map((play, i) => <span key={play.creator}><b>{i + 1}</b>{play.creator}<small>{play.day}</small></span>)}</div></section></>;
}

function Podcasts({ plays }: { plays: Play[] }) {
  const podcasts = plays.filter((p) => p.contentType === "episode");
  const shows = ranking(podcasts, (p) => p.creator, (p) => p.creator, undefined, (p) => p.uri);
  const episodes = ranking(podcasts, (p) => p.uri, (p) => p.item, (p) => p.creator);
  return <><PageTitle eyebrow="Podcasts" title="Tus historias habladas" copy={podcasts.length ? `${number.format(podcasts.length)} eventos de podcast encontrados.` : "No hay episodios de podcast en este período."} /><div className="stats-grid"><Stat label="Tiempo en podcasts" value={formatMinutes(sumMinutes(podcasts))} icon={<Podcast />} /><Stat label="Programas" value={number.format(shows.length)} icon={<ListMusic />} /><Stat label="Episodios" value={number.format(episodes.length)} icon={<Headphones />} /></div>{podcasts.length > 0 && <div className="two-column"><section className="panel"><h2>Programas</h2><RankList rows={shows} limit={15} /></section><section className="panel"><h2>Episodios</h2><RankList rows={episodes} limit={15} /></section></div>}</>;
}

function Explorer({ plays }: { plays: Play[] }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("es");
  const matches = normalized ? plays.filter((p) => `${p.item} ${p.creator} ${p.collection}`.toLocaleLowerCase("es").includes(normalized)).slice().reverse().slice(0, 100) : plays.slice().reverse().slice(0, 100);
  return <><PageTitle eyebrow="Explorar" title="Busca dentro de tu historia" copy="Los resultados permanecen únicamente en la memoria de esta pestaña." /><label className="search-box"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Canción, artista, álbum o podcast…" /></label><section className="panel table-wrap"><table><thead><tr><th>Fecha</th><th>Contenido</th><th>Artista / programa</th><th>Escucha</th></tr></thead><tbody>{matches.map((play) => <tr key={play.id}><td>{fullDate.format(play.at)}</td><td><strong>{play.item}</strong><small className="table-sub">{play.collection}</small></td><td>{play.creator}</td><td>{formatMinutes(play.minutes)}</td></tr>)}</tbody></table></section></>;
}

function SourceList({ sources, title }: { sources: string[]; title: string }) {
  return <section className="panel file-list"><h2>{title}</h2>{sources.map((name, index) => <span className={name.startsWith("Error:") ? "source-error" : ""} key={`${name}-${index}`}>{name.startsWith("Error:") ? <Info /> : <CheckCircle2 />}{name}</span>)}</section>;
}

function Quality({ result }: { result: ImportResult }) {
  const ratio = result.compressedBytes ? result.expandedBytes / result.compressedBytes : 0;
  const acceptedSources = result.sourceFiles.filter((name) => !name.startsWith("Error:")).length;
  return <>
    <PageTitle eyebrow="Calidad" title="Qué hemos contado y cómo" copy="Songweft elimina duplicados exactos y coincidencias entre exportaciones con distinta precisión horaria. Conserva escuchas cortas para distinguir minutos, eventos y streams de 30 segundos." />
    <div className="stats-grid"><Stat label="Registros originales" value={number.format(result.rawAudioRecords)} icon={<FileArchive />} /><Stat label="Registros analizados" value={number.format(result.plays.length)} icon={<CheckCircle2 />} /><Stat label="Duplicados retirados" value={number.format(result.duplicateRecords)} icon={<DatabaseZap />} /><Stat label="Fechas no válidas" value={number.format(result.invalidRecords)} icon={<Activity />} /></div>
    <div className="two-column">
      <section className="panel methodology"><h2>Privacidad verificable</h2><ul><li>Los archivos no se envían al alojamiento.</li><li>No usamos analítica ni rastreadores propios.</li><li>GitHub Pages puede registrar visitas a la web.</li><li>El historial se mantiene en memoria durante esta pestaña.</li><li>Si conectas Spotify, la autorización temporal se guarda en la sesión de esta pestaña y el navegador se comunica con Spotify.</li></ul></section>
      <section className="panel methodology"><h2>Fuentes importadas</h2><dl><div><dt>Fuentes aceptadas</dt><dd>{acceptedSources}</dd></div><div><dt>Vídeos separados</dt><dd>{number.format(result.videoRecords)}</dd></div><div><dt>Tamaño de entrada</dt><dd>{decimal.format(result.compressedBytes / 1_048_576)} MB</dd></div><div><dt>Expansión ZIP declarada</dt><dd>{ratio ? `${decimal.format(ratio)}×` : "—"}</dd></div><div><dt>Zona horaria</dt><dd>{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd></div></dl></section>
    </div>
    <SourceList sources={result.sourceFiles} title="Fuentes de esta sesión" />
  </>;
}

function SourcesPage({ result, onAdd, onAddLibrary, busy, progress, error, connected, onConnect }: { result: ImportResult; onAdd: (files: File[]) => void; onAddLibrary: (tracks: LibraryTrack[], source: string) => void; busy: boolean; progress: string; error: string; connected: boolean; onConnect: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [pasteMessage, setPasteMessage] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const sync = async (kind: "saved" | "playlist") => {
    if (!connected) { onConnect(); return; }
    setSyncBusy(true); setSyncMessage("");
    try {
      const tracks = kind === "saved" ? await importSavedSpotifyTracks(setSyncMessage) : await importSpotifyPlaylist(playlistUrl, setSyncMessage);
      onAddLibrary(tracks, kind === "saved" ? "Spotify · Canciones guardadas" : "Spotify · Playlist");
      setSyncMessage(`${tracks.length} canciones añadidas a tu biblioteca. No cuentan como minutos escuchados.`);
    } catch (caught) { setSyncMessage(caught instanceof Error ? caught.message : "No se pudo leer Spotify."); }
    finally { setSyncBusy(false); }
  };
  return <><PageTitle eyebrow="Tus datos · 00" title="Fuentes de tu biblioteca" copy="Añade más exportaciones cuando quieras. Unimos los archivos y retiramos duplicados y coincidencias entre formatos." />
    <section className="panel sources-panel"><FileArchive size={34} /><div><h2>Importar más archivos</h2><p>ZIP o JSON de Spotify y CSV con columnas de canción y artista. Los CSV añaden canciones a la biblioteca; no inventan minutos de escucha.</p><input ref={input} type="file" multiple accept=".zip,.json,.csv" hidden onChange={(event) => event.target.files?.length && onAdd([...event.target.files])} /><button className="primary-button" disabled={busy} onClick={() => input.current?.click()}><UploadCloud size={17} /> {busy ? progress : "Añadir archivos"}</button>{error && <p className="error-box" role="alert">{error}</p>}</div></section>
    <section className="panel pasted-source"><span className="kicker">Sin archivo</span><h2>Pega una lista de canciones</h2><p>Una por línea en formato <strong>Artista — Canción</strong>. No se añaden minutos ficticios.</p><textarea value={pasted} onChange={(event) => setPasted(event.target.value)} rows={5} maxLength={30_000} placeholder={"Artista — Canción\nOtro artista — Otra canción"} /><button onClick={() => { try { const tracks = parsePastedTracks(pasted); onAddLibrary(tracks, "Lista pegada"); setPasted(""); setPasteMessage(`${tracks.length} canciones añadidas.`); } catch (caught) { setPasteMessage(caught instanceof Error ? caught.message : "No se pudo leer la lista."); } }} disabled={!pasted.trim()}>Añadir a mi biblioteca</button>{pasteMessage && <p role="status">{pasteMessage}</p>}</section>
    <div className="stats-grid"><Stat label="Escuchas" value={number.format(result.plays.length)} icon={<Headphones />} /><Stat label="Canciones importadas" value={number.format(result.libraryTracks?.length ?? 0)} icon={<Music2 />} /><Stat label="Duplicados retirados" value={number.format(result.duplicateRecords)} icon={<DatabaseZap />} /><Stat label="Fuentes aceptadas" value={number.format(result.sourceFiles.filter((name) => !name.startsWith("Error:")).length)} icon={<FileArchive />} /></div>
    <section className="panel spotify-source"><span className="kicker">Fuente conectada</span><h2>Tu biblioteca de Spotify</h2><p>Añade tus canciones guardadas o una playlist propia. Estas canciones amplían el Estudio; la API no proporciona sus minutos de escucha históricos.</p><div className="spotify-source-actions"><button disabled={syncBusy} onClick={() => sync("saved")}>Añadir canciones guardadas</button><input value={playlistUrl} onChange={(event) => setPlaylistUrl(event.target.value)} placeholder="Enlace de una playlist propia" /><button disabled={syncBusy} onClick={() => sync("playlist")}>Añadir playlist</button></div><small>{connected ? "Spotify conectado" : "Al pulsar se te pedirá conectar Spotify primero."}</small>{syncMessage && <p role="status">{syncMessage}</p>}</section>
    <SourceList sources={result.sourceFiles} title="Fuentes de esta sesión" />
  </>;
}

function ConnectionsPage({ connected, onConnect, onDisconnect }: { connected: boolean; onConnect: () => void; onDisconnect: () => void }) {
  return <><PageTitle eyebrow="Spotify · Opcional" title="Conecta solo cuando te venga bien" copy="Puedes crear y descargar playlists sin cuenta. La conexión sirve para guardarlas en tu Spotify." />
    <section className="panel connection-panel"><div><span className="kicker">Estado de la conexión</span><h2>{connected ? "Spotify conectado" : "Sin conectar"}</h2><p>El inicio de sesión se hace en Spotify. Songweft solo recibe permisos para consultar tu biblioteca y crear playlists privadas. La autorización se guarda temporalmente en esta pestaña; nunca guardamos tu contraseña.</p><p className="connection-caveat">Para conectar una app personal necesitas un Client ID de Spotify Developer. Spotify exige Premium al propietario de una app en modo desarrollo y limita sus usuarios. El análisis de archivos y la exportación CSV siguen disponibles sin esta conexión.</p></div><button className="primary-button" onClick={connected ? onDisconnect : onConnect}>{connected ? "Desconectar Spotify" : "Configurar conexión"}</button></section>
  </>;
}

function PageTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="page-title"><span className="kicker">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></header>;
}

function Dashboard({ result, onReset, onAdd, onAddLibrary, busy, progress, error, connected, onConnect, onDisconnect }: { result: ImportResult; onReset: () => void; onAdd: (files: File[]) => void; onAddLibrary: (tracks: LibraryTrack[], source: string) => void; busy: boolean; progress: string; error: string; connected: boolean; onConnect: () => void; onDisconnect: () => void }) {
  const [page, setPage] = useState<Page>(result.plays.length ? "Resumen" : "Estudio");
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const years = useMemo(() => [...new Set(result.plays.map((p) => p.year))].sort((a, b) => b - a), [result.plays]);
  const [year, setYear] = useState("all");
  const filtered = useMemo(() => year === "all" ? result.plays : result.plays.filter((p) => p.year === Number(year)), [result.plays, year]);
  const content: Record<Page, ReactNode> = {
    Resumen: <Overview plays={filtered} />,
    Rankings: <Rankings plays={filtered} />,
    Historia: <HistoryPage plays={filtered} />,
    Hábitos: <Habits plays={filtered} />,
    Sesiones: <SessionsPage plays={filtered} />,
    Descubrimiento: <Discovery plays={filtered} />,
    Podcasts: <Podcasts plays={filtered} />,
    Explorar: <Explorer plays={filtered} />,
    Fuentes: <SourcesPage result={result} onAdd={onAdd} onAddLibrary={onAddLibrary} busy={busy} progress={progress} error={error} connected={connected} onConnect={onConnect} />,
    Estudio: null,
    Tarjeta: <Wrapped plays={filtered} />,
    Conexiones: <ConnectionsPage connected={connected} onConnect={onConnect} onDisconnect={onDisconnect} />,
    Calidad: <Quality result={result} />,
    Información: <><PageTitle eyebrow="Songweft" title="Información y privacidad" copy="Cómo comenzó el proyecto y qué sucede con tus datos." /><InformationContent /></>,
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><img src={logoUrl} alt="" /></span><strong>Songweft</strong></div>
        <nav><span className="nav-group-label">Visualizar</span>{pages.slice(0, 8).map(({ name, icon: Icon }) => <button key={name} className={page === name ? "active" : ""} onClick={() => setPage(name)}><Icon /> <span>{name}</span></button>)}<span className="nav-group-label">Crear y compartir</span>{pages.slice(8, 12).map(({ name, icon: Icon }) => <button key={name} className={page === name ? "active" : ""} onClick={() => setPage(name)}><Icon /> <span>{name}</span></button>)}<span className="nav-group-label">Proyecto</span>{pages.slice(12).map(({ name, icon: Icon }) => <button key={name} className={page === name ? "active" : ""} onClick={() => setPage(name)}><Icon /> <span>{name}</span></button>)}</nav>
        <div className="sidebar-foot"><p className="creator-credit">Creado por<br /><strong>Iñigo Casares</strong></p><div><LockKeyhole /><span><strong>Solo en memoria</strong><small>Nada se ha subido</small></span></div><button onClick={onReset}><RotateCcw /> Cerrar historial</button></div>
      </aside>
      <main className="dashboard">
        <header className="topbar"><div><span className="live-dot" /> Historial listo <small>{number.format(result.plays.length)} registros</small></div><label>Período<select value={year} onChange={(e) => setYear(e.target.value)}><option value="all">Todo el historial</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></header>
        <div className="mobile-nav">{pages.map(({ name, icon: Icon }) => <button aria-label={name} title={name} key={name} className={page === name ? "active" : ""} onClick={() => setPage(name)}><Icon /></button>)}</div>
        <div className="content">{page !== "Estudio" && (filtered.length || ["Información", "Calidad", "Fuentes", "Conexiones"].includes(page) ? content[page] : <div className="empty-state"><Music2 /><h2>No hay escuchas en este período</h2><p>Prueba con otro año.</p></div>)}<div hidden={page !== "Estudio"}><Studio key={year} result={{ ...result, plays: filtered }} connected={connected} onConnect={onConnect} /></div></div>
      </main>
    </div>
  );
}

export default function App() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(spotifyConnected());
  const [connectOpen, setConnectOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [connectError, setConnectError] = useState("");

  useEffect(() => {
    const stop = listenForSpotifyConnection();
    const update = () => { setConnected(spotifyConnected()); setConnectOpen(false); };
    window.addEventListener("songweft-connected", update);
    finishSpotifyLogin().then((finished) => { if (finished) update(); }).catch((caught) => setError(caught instanceof Error ? caught.message : "No se pudo conectar Spotify."));
    return () => { stop(); window.removeEventListener("songweft-connected", update); };
  }, []);

  const handleFiles = async (files: File[]) => {
    setError("");
    setBusy(true);
    setProgress("Comprobando los archivos…");
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const incoming = await importSources(files, setProgress);
      setResult((current) => current ? mergeImportResults(current, incoming) : incoming);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo analizar el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const startConnection = async () => {
    setConnectError("");
    try { await connectSpotify(clientId); }
    catch (caught) { setConnectError(caught instanceof Error ? caught.message : "No se pudo iniciar Spotify."); }
  };

  const addLibrary = (tracks: LibraryTrack[], source: string) => setResult((current) => {
    const libraryTracks = [...new Map([...(current?.libraryTracks ?? []), ...tracks].map((track) => [track.uri || `${track.creator.toLowerCase()}\u001f${track.item.toLowerCase()}`, track])).values()];
    return current ? { ...current, libraryTracks, sourceFiles: [...current.sourceFiles, `${source} · ${tracks.length} canciones`] } : { plays: [], libraryTracks, rawAudioRecords: 0, duplicateRecords: 0, invalidRecords: 0, videoRecords: 0, sourceFiles: [`${source} · ${tracks.length} canciones`], compressedBytes: 0, expandedBytes: 0 };
  });

  return <>{result ? <Dashboard result={result} onReset={() => setResult(null)} onAdd={handleFiles} onAddLibrary={addLibrary} busy={busy} progress={progress} error={error} connected={connected} onConnect={() => setConnectOpen(true)} onDisconnect={() => { disconnectSpotify(); setConnected(false); }} /> : <UploadScreen onFiles={handleFiles} onAddLibrary={addLibrary} busy={busy} progress={progress} error={error} />}
    {connectOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setConnectOpen(false)}><div className="connection-modal" role="dialog" aria-modal="true" aria-labelledby="connect-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setConnectOpen(false)} aria-label="Cerrar">×</button><span className="kicker">Conexión opcional</span><h2 id="connect-title">Conecta tu Spotify</h2><p>Crea una app personal en <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify Developer</a>, copia su Client ID y registra esta dirección de retorno:</p><code>{location.origin}{location.pathname}</code><p>La app se abrirá en una ventana de Spotify. Se solicitará permiso para leer tu biblioteca y crear playlists privadas. Tu archivo de escuchas seguirá en este navegador.</p><label>Client ID<input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="32 caracteres" /></label>{connectError && <p className="error-box" role="alert">{connectError}</p>}<button className="primary-button" onClick={startConnection}>Continuar con Spotify</button><small>Spotify exige Premium al propietario de una app en modo desarrollo. El uso personal no requiere contratar alojamiento adicional.</small></div></div>}
  </>;
}
