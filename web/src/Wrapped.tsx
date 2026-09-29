import { Download, Share2 } from "lucide-react";
import { ranking, sumMinutes } from "./analytics";
import type { Play } from "./types";

const fmt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

function drawCard(plays: Play[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1350;
  const context = canvas.getContext("2d")!;
  const background = context.createLinearGradient(0, 0, 1080, 1350);
  background.addColorStop(0, "#141a32"); background.addColorStop(.55, "#11111d"); background.addColorStop(1, "#350f38");
  context.fillStyle = background; context.fillRect(0, 0, 1080, 1350);
  context.strokeStyle = "#ffffff20";
  for (let i = 0; i < 8; i += 1) { context.beginPath(); context.arc(885, 215, 120 + i * 35, 0, Math.PI * 2); context.stroke(); }
  const music = plays.filter((play) => play.contentType === "track");
  const artists = ranking(music, (play) => play.creator, (play) => play.creator).slice(0, 5);
  const years = [...new Set(plays.map((play) => play.year))];
  const period = years.length === 1 ? String(years[0]) : `${Math.min(...years)}—${Math.max(...years)}`;
  context.fillStyle = "#d8ff3e"; context.font = "bold 38px Arial"; context.fillText("SONGWEFT", 76, 110);
  context.font = "30px Arial"; context.fillText(`MI MÚSICA · ${period}`, 76, 215);
  context.fillStyle = "#ffffff"; context.font = "bold 120px Arial"; context.fillText(fmt.format(sumMinutes(plays)), 70, 420);
  context.fillStyle = "#d8ff3e"; context.font = "bold 56px Arial"; context.fillText("MINUTOS ESCUCHADOS", 76, 490);
  context.fillStyle = "#ffffff"; context.font = "bold 42px Arial"; context.fillText("Mis artistas", 76, 620);
  artists.forEach((artist, index) => {
    context.fillStyle = index === 0 ? "#d8ff3e" : "#ffffff";
    context.font = "bold 36px Arial";
    const name = artist.name.length > 29 ? `${artist.name.slice(0, 27)}…` : artist.name;
    context.fillText(`${index + 1}. ${name}`, 80, 710 + index * 88);
  });
  context.fillStyle = "#ffffffa8"; context.font = "27px Arial";
  context.fillText("Hecho con mis datos. Compartido por elección.", 76, 1240);
  return canvas;
}

export default function Wrapped({ plays }: { plays: Play[] }) {
  const music = plays.filter((play) => play.contentType === "track");
  const artists = ranking(music, (play) => play.creator, (play) => play.creator).slice(0, 5);
  const topTrack = ranking(music, (play) => play.uri, (play) => play.item, (play) => play.creator)[0];
  const save = () => {
    const anchor = document.createElement("a");
    anchor.href = drawCard(plays).toDataURL("image/png");
    anchor.download = "songweft-mi-musica.png";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };
  return <section className="wrapped-page"><header className="page-title"><span className="kicker">Compartir · 03</span><h1>Tu historia en una tarjeta</h1><p>Elige un año en la parte superior. La imagen se crea aquí mismo y solo se comparte si tú la descargas.</p></header>
    <div className="wrapped-layout"><div className="wrapped-card"><span className="wrapped-brand">SONGWEFT</span><span className="wrapped-period">MI MÚSICA · {plays[0]?.year === plays.at(-1)?.year ? plays[0]?.year : `${plays[0]?.year}—${plays.at(-1)?.year}`}</span><strong>{fmt.format(sumMinutes(plays))}</strong><em>MINUTOS ESCUCHADOS</em><div><h2>Mis artistas</h2>{artists.map((artist, index) => <p key={artist.key}><b>{index + 1}.</b> {artist.name}</p>)}</div><small>Hecho con mis datos. Compartido por elección.</small></div>
      <div className="wrapped-side"><span className="kicker">Un recuerdo a tu medida</span><h2>Lo que más sonó merece su propia portada.</h2><p>La tarjeta incluye tus minutos y cinco artistas principales. No incluye tu nombre, fechas exactas ni información de cuenta.</p>{topTrack && <div className="wrapped-highlight"><span>Tu canción más escuchada</span><strong>{topTrack.name}</strong><small>{topTrack.secondary}</small></div>}<button className="primary-button" onClick={save}><Download size={18} /> Descargar PNG</button><p className="wrapped-privacy"><Share2 size={16} /> Después podrás subirla a la red social que prefieras. Songweft no publica nada por ti.</p></div>
    </div></section>;
}
