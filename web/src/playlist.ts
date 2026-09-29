import type { LibraryTrack, Play } from "./types";

export type Recipe = "favorites" | "forgotten" | "deepcuts" | "balanced";
export interface TrackChoice extends LibraryTrack {
  key: string;
  minutes: number;
  listens: number;
  lastPlayed: number;
  reason: string;
}
export interface PlaylistOptions {
  recipe: Recipe;
  count: number;
  maxPerArtist: number;
  novelty: number;
  excludedArtists: string[];
}

export function buildCatalog(plays: Play[], imported: LibraryTrack[] = []): TrackChoice[] {
  const catalog = new Map<string, TrackChoice>();
  for (const play of plays) {
    if (play.contentType !== "track" || play.item === "Sin título") continue;
    const key = play.uri.startsWith("spotify:track:") ? play.uri : `${play.creator.toLowerCase()}\u001f${play.item.toLowerCase()}`;
    const track = catalog.get(key) ?? { key, uri: play.uri.startsWith("spotify:track:") ? play.uri : "", item: play.item, creator: play.creator, collection: play.collection, sourceFile: play.sourceFile, minutes: 0, listens: 0, lastPlayed: 0, reason: "" };
    track.minutes += play.minutes;
    if (play.ms >= 30_000) track.listens += 1;
    track.lastPlayed = Math.max(track.lastPlayed, play.timestamp);
    catalog.set(key, track);
  }
  for (const item of imported) {
    const key = item.uri || `${item.creator.toLowerCase()}\u001f${item.item.toLowerCase()}`;
    if (!catalog.has(key)) catalog.set(key, { ...item, key, minutes: 0, listens: 0, lastPlayed: 0, reason: "Importada desde tu biblioteca" });
  }
  return [...catalog.values()];
}

export function recommendTracks(catalog: TrackChoice[], options: PlaylistOptions, now = Date.now()): TrackChoice[] {
  const excluded = new Set(options.excludedArtists.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const candidates = catalog.filter((track) => !excluded.has(track.creator.toLowerCase()) && (options.recipe !== "forgotten" || track.listens > 0));
  const maxMinutes = Math.max(1, ...candidates.map((track) => track.minutes));
  const artistMinutes = new Map<string, number>();
  candidates.forEach((track) => artistMinutes.set(track.creator, (artistMinutes.get(track.creator) ?? 0) + track.minutes));
  const maxArtist = Math.max(1, ...artistMinutes.values());
  const scored = candidates.map((track) => {
    const familiarity = Math.log1p(track.minutes) / Math.log1p(maxMinutes);
    const affinity = Math.log1p(artistMinutes.get(track.creator) ?? 0) / Math.log1p(maxArtist);
    const days = track.lastPlayed ? Math.max(0, (now - track.lastPlayed) / 86_400_000) : 3650;
    const forgotten = Math.min(1, days / 365);
    const underplayed = 1 - familiarity;
    let score = 0;
    let reason = "";
    if (options.recipe === "favorites") { score = familiarity * 0.85 + affinity * 0.15; reason = `${Math.round(track.minutes)} min escuchados · ${track.listens} reproducciones`; }
    if (options.recipe === "forgotten") { score = familiarity * 0.55 + forgotten * 0.45; reason = track.lastPlayed ? `Hace ${Math.round(days)} días que no la escuchas` : "Guardada y pendiente de escuchar"; }
    if (options.recipe === "deepcuts") { score = affinity * 0.7 + underplayed * 0.3; reason = `Un tema poco escuchado de ${track.creator}`; }
    if (options.recipe === "balanced") { score = familiarity * (1 - options.novelty / 100) + underplayed * (options.novelty / 100) * 0.7 + affinity * 0.3; reason = track.minutes ? `${Math.round(track.minutes)} min en tu historial` : "Desde una biblioteca importada"; }
    return { ...track, score, reason };
  }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const artistCount = new Map<string, number>();
  const selected: TrackChoice[] = [];
  for (const track of scored) {
    const count = artistCount.get(track.creator) ?? 0;
    if (count >= options.maxPerArtist) continue;
    selected.push(track);
    artistCount.set(track.creator, count + 1);
    if (selected.length >= options.count) break;
  }
  const arranged: TrackChoice[] = [];
  const remaining = [...selected];
  while (remaining.length) {
    const lastArtist = arranged.at(-1)?.creator;
    const nextIndex = remaining.findIndex((track) => track.creator !== lastArtist);
    arranged.push(...remaining.splice(nextIndex < 0 ? 0 : nextIndex, 1));
  }
  return arranged;
}
