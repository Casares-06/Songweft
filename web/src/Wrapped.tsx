import { useMemo, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { ranking, sumMinutes } from "./analytics";
import type { Play } from "./types";

type Mode = "artistas" | "canciones" | "resumen";
type Theme = "noche" | "violeta" | "aurora";
type Format = "post" | "story";
const fmt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const palettes: Record<Theme, { start: string; end: string; accent: string }> = {
  noche: { start: "#141a32", end: "#350f38", accent: "#d8ff3e" },
  violeta: { start: "#21123d", end: "#4e2069", accent: "#f3b8ff" },
  aurora: { start: "#073837", end: "#12344f", accent: "#a2ffe0" },
};

function cardData(plays: Play[], mode: Mode) {
  const music = plays.filter((play) => play.contentType === "track");
  const artists = ranking(music, (play) => play.creator, (play) => play.creator);
  const songs = ranking(music, (play) => play.uri || `${play.creator}\u001f${play.item}`, (play) => play.item, (play) => play.creator);
  const items = mode === "canciones" ? songs.slice(0, 5).map((row) => ({ name: row.name, detail: row.secondary })) : artists.slice(0, mode === "resumen" ? 3 : 5).map((row) => ({ name: row.name, detail: "" }));
  return { minutes: sumMinutes(plays), items, song: songs[0], artists: artists.length, songs: songs.length, days: new Set(plays.map((play) => play.day)).size };
}

function drawCard(data: ReturnType<typeof cardData>, mode: Mode, theme: Theme, period: string, format: Format) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = format === "story" ? 1920 : 1350;
  const stretch = canvas.height / 1350;
  const y = (position: number) => position * stretch;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador no permite crear imágenes.");
  const palette = palettes[theme];
  const background = context.createLinearGradient(0, 0, 1080, canvas.height);
  background.addColorStop(0, palette.start); background.addColorStop(1, palette.end);
  context.fillStyle = background; context.fillRect(0, 0, 1080, canvas.height);
  context.strokeStyle = "#ffffff22";
  for (let i = 0; i < 8; i += 1) { context.beginPath(); context.arc(890, 210, 115 + i * 38, 0, Math.PI * 2); context.stroke(); }
  context.fillStyle = palette.accent; context.font = "bold 38px Arial"; context.fillText("SONGWEFT", 76, y(110));
  context.font = "30px Arial"; context.fillText(`MI MÚSICA · ${period}`, 76, y(205));
  context.fillStyle = "#fff"; context.font = "bold 116px Arial"; context.fillText(fmt.format(data.minutes), 70, y(405));
  context.fillStyle = palette.accent; context.font = "bold 49px Arial"; context.fillText("MINUTOS ESCUCHADOS", 76, y(470));
  context.fillStyle = "#fff"; context.font = "bold 40px Arial";
  context.fillText(mode === "canciones" ? "Mis canciones" : mode === "resumen" ? "Mi historia en números" : "Mis artistas", 76, y(585));
  if (mode === "resumen") {
    context.font = "bold 35px Arial"; context.fillText(`${fmt.format(data.artists)} artistas · ${fmt.format(data.songs)} canciones`, 76, y(670));
    context.font = "29px Arial"; context.fillStyle = "#ffffffad"; context.fillText(`${fmt.format(data.days)} días con música`, 76, y(725));
    if (data.song) { context.fillStyle = palette.accent; context.font = "bold 29px Arial"; context.fillText("MI CANCIÓN MÁS ESCUCHADA", 76, y(800)); context.fillStyle = "#fff"; context.font = "bold 34px Arial"; context.fillText(data.song.name.slice(0, 40), 76, y(855)); }
  }
  data.items.forEach((item, index) => {
    context.fillStyle = index === 0 ? palette.accent : "#fff"; context.font = "bold 34px Arial";
    context.fillText(`${index + 1}. ${item.name.length > 35 ? `${item.name.slice(0, 33)}…` : item.name}`, 76, y((mode === "resumen" ? 955 : 675) + index * (mode === "resumen" ? 73 : 100)));
    if (mode === "canciones" && item.detail) { context.fillStyle = "#ffffffad"; context.font = "25px Arial"; context.fillText(item.detail.slice(0, 48), 112, y(706 + index * 100)); }
  });
  context.fillStyle = "#ffffffad"; context.font = "27px Arial"; context.fillText("Hecho con mis datos. Compartido por elección.", 76, y(1260));
  return canvas;
}

export default function Wrapped({ plays }: { plays: Play[] }) {
  const years = useMemo(() => [...new Set(plays.map((play) => play.year))].sort((a, b) => b - a), [plays]);
  const [year, setYear] = useState("all");
  const [mode, setMode] = useState<Mode>("artistas");
  const [theme, setTheme] = useState<Theme>("noche");
  const [format, setFormat] = useState<Format>("post");
  const [saving, setSaving] = useState(false);
  const [exportError, setExportError] = useState("");
  const selected = useMemo(() => year === "all" ? plays : plays.filter((play) => play.year === Number(year)), [plays, year]);
  const data = useMemo(() => cardData(selected, mode), [selected, mode]);
  const period = year === "all" ? years.length > 1 ? `${Math.min(...years)}—${Math.max(...years)}` : String(years[0] ?? "—") : year;
  const save = async () => {
    setSaving(true); setExportError("");
    try {
      const canvas = drawCard(data, mode, theme, period, format);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("No se pudo generar la imagen.")), "image/png"));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `songweft-${year}-${mode}-${format}.png`; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setExportError(error instanceof Error ? error.message : "No se pudo crear la tarjeta."); }
    finally { setSaving(false); }
  };
  return <section className="wrapped-page"><header className="page-title"><span className="kicker">Compartir · 03</span><h1>Tu historia, tu portada</h1><p>Selecciona el período, el enfoque y los colores. La imagen se crea en tu navegador y solo se comparte si tú quieres.</p></header>
    <div className="wrapped-controls">
      <label>Año<select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">Todo el historial</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Contenido<select value={mode} onChange={(event) => setMode(event.target.value as Mode)}><option value="artistas">Top artistas</option><option value="canciones">Top canciones</option><option value="resumen">Resumen completo</option></select></label>
      <label>Estilo<select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="noche">Noche eléctrica</option><option value="violeta">Violeta</option><option value="aurora">Aurora</option></select></label>
      <label>Formato<select value={format} onChange={(event) => setFormat(event.target.value as Format)}><option value="post">Publicación · 4:5</option><option value="story">Story · 9:16</option></select></label>
    </div>
    {selected.length ? <div className="wrapped-layout"><div key={`${year}-${mode}-${theme}-${format}`} className={`wrapped-card theme-${theme} format-${format}`}><span className="wrapped-brand">SONGWEFT</span><span className="wrapped-period">MI MÚSICA · {period}</span><strong>{fmt.format(data.minutes)}</strong><em>MINUTOS ESCUCHADOS</em><div><h2>{mode === "canciones" ? "Mis canciones" : mode === "resumen" ? "Mi historia en números" : "Mis artistas"}</h2>{mode === "resumen" && <><p>{fmt.format(data.artists)} artistas · {fmt.format(data.songs)} canciones</p><p className="wrapped-days">{fmt.format(data.days)} días con música</p>{data.song && <p>Mi canción: {data.song.name}</p>}</>}{data.items.map((item, index) => <p key={`${item.name}-${index}`}><b>{index + 1}.</b> {item.name}{mode === "canciones" && <small> · {item.detail}</small>}</p>)}</div><small>Hecho con mis datos. Compartido por elección.</small></div>
      <div className="wrapped-side"><span className="kicker">Diseña antes de compartir</span><h2>Una tarjeta que cuenta tu historia.</h2><p>Cambia el año para ver cómo evolucionó tu música. Puedes destacar artistas, canciones o un resumen con ambos.</p><div className="wrapped-highlight"><span>En esta tarjeta</span><strong>{fmt.format(data.minutes)} minutos</strong><small>{fmt.format(data.artists)} artistas · {fmt.format(data.songs)} canciones · {fmt.format(data.days)} días</small></div><button className="primary-button" disabled={saving} onClick={save}><Download size={18} /> {saving ? "Creando imagen…" : "Descargar PNG"}</button><p className="wrapped-resolution">{format === "post" ? "1080 × 1350" : "1080 × 1920"} px · PNG en alta resolución</p>{exportError && <p role="alert">{exportError}</p>}<p className="wrapped-privacy"><Share2 size={16} /> No incluye tu nombre ni publica nada automáticamente.</p></div></div> : <div className="empty-state"><h2>No hay escuchas en este año</h2><p>Elige otro período.</p></div>}</section>;
}
