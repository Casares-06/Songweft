import type { LibraryTrack, Play } from "./types";

export type Recipe = "favorites" | "forgotten" | "deepcuts" | "balanced" | "artists" | "timecapsule";
export interface TrackChoice extends LibraryTrack {
  key: string;
  minutes: number;
  listens: number;
  lastPlayed: number;
  reason: string;
  artistGroup?: string;
}

export const trackNameKey = (creator: string, item: string) => `${creator.normalize("NFKC").trim().toLowerCase()}\u001f${item.normalize("NFKC").trim().toLowerCase()}`;

const normalizedWords = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const editionWords = /\b(remaster(?:ed)?|deluxe|anniversary|expanded|bonus track|radio edit|single version|album version|mono|stereo|explicit|clean)\b/gi;
export function recordingKey(track: Pick<LibraryTrack, "item" | "creator" | "isrc">) {
  if (track.isrc) return `isrc:${track.isrc.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  const title = normalizedWords(track.item.replace(/[([][^)\]]*(?:remaster|deluxe|anniversary|expanded|bonus track|radio edit|single version|album version|mono|stereo|explicit|clean)[^)\]]*[)\]]/gi, " ").replace(editionWords, " "));
  const primaryArtist = track.creator.split(/,|&|\bfeat\.?\b|\bft\.?\b|\bwith\b/i).map(normalizedWords).find(Boolean) ?? normalizedWords(track.creator);
  return `name:${title}\u001f${primaryArtist}`;
}

export function deduplicateTracks<T extends Pick<LibraryTrack, "item" | "creator" | "uri" | "isrc">>(tracks: T[]) {
  const seenUris = new Set<string>();
  const seenRecordings = new Set<string>();
  return tracks.filter((track) => {
    const identity = recordingKey(track);
    const byName = recordingKey({ ...track, isrc: undefined });
    if ((track.uri && seenUris.has(track.uri)) || seenRecordings.has(identity) || seenRecordings.has(byName)) return false;
    if (track.uri) seenUris.add(track.uri);
    seenRecordings.add(identity); seenRecordings.add(byName);
    return true;
  });
}
export interface PlaylistOptions {
  recipe: Recipe;
  count: number;
  maxPerArtist: number;
  novelty: number;
  excludedArtists: string[];
  selectedArtists?: string[];
  allTracks?: boolean;
  order?: "balanced" | "ranking" | "recent" | "oldest" | "random";
  onlyUnheard?: boolean;
}

export function buildCatalog(plays: Play[], imported: LibraryTrack[] = []): TrackChoice[] {
  const catalog = new Map<string, TrackChoice>();
  const byName = new Map<string, TrackChoice>();
  const nameKey = trackNameKey;
  for (const play of plays) {
    if (play.contentType !== "track" || play.item === "Sin título") continue;
    const key = play.uri.startsWith("spotify:track:") ? play.uri : nameKey(play.creator, play.item);
    const track = catalog.get(key) ?? { key, uri: play.uri.startsWith("spotify:track:") ? play.uri : "", item: play.item, creator: play.creator, collection: play.collection, sourceFile: play.sourceFile, minutes: 0, listens: 0, lastPlayed: 0, reason: "" };
    track.minutes += play.minutes;
    if (play.ms >= 30_000) track.listens += 1;
    track.lastPlayed = Math.max(track.lastPlayed, play.timestamp);
    catalog.set(key, track);
    byName.set(nameKey(play.creator, play.item), track);
  }
  for (const item of imported) {
    const fallback = nameKey(item.creator, item.item);
    const exact = item.uri ? catalog.get(item.uri) : undefined;
    const named = byName.get(fallback);
    const match = exact ?? (named && (!named.uri || !item.uri) ? named : undefined);
    if (match) {
      if (!match.uri && item.uri) match.uri = item.uri;
      continue;
    }
    const key = item.uri || fallback;
    const track = { ...item, key, minutes: 0, listens: 0, lastPlayed: 0, reason: "Importada desde tu biblioteca" };
    catalog.set(key, track);
    byName.set(fallback, track);
  }
  return deduplicateTracks([...catalog.values()]);
}

export function recommendTracks(catalog: TrackChoice[], options: PlaylistOptions, now = Date.now()): TrackChoice[] {
  const excluded = new Set(options.excludedArtists.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const selectedArtists = new Set((options.selectedArtists ?? []).map((name) => name.trim().toLowerCase()));
  const candidates = catalog.filter((track) => !excluded.has(track.creator.toLowerCase()) && (options.recipe !== "forgotten" || track.listens > 0) && (options.recipe !== "artists" || selectedArtists.has(track.creator.toLowerCase())));
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
    if (options.recipe === "artists") { score = familiarity * 0.7 + affinity * 0.3; reason = track.minutes ? `${Math.round(track.minutes)} min de ${track.creator}` : `Canción de ${track.creator} aún no escuchada`; }
    if (options.recipe === "timecapsule") { score = track.lastPlayed + familiarity * 1000; reason = track.lastPlayed ? `Escuchada ${new Date(track.lastPlayed).toLocaleDateString("es-ES")}` : "De tu etapa elegida"; }
    return { ...track, score, reason };
  }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const artistCount = new Map<string, number>();
  const selected: TrackChoice[] = [];
  for (const track of scored) {
    const count = artistCount.get(track.creator) ?? 0;
    if (count >= options.maxPerArtist) continue;
    selected.push(track);
    artistCount.set(track.creator, count + 1);
    if (!options.allTracks && selected.length >= options.count) break;
  }
  const arranged: TrackChoice[] = [];
  const remaining = [...selected];
  while (remaining.length) {
    const lastArtist = arranged.at(-1)?.creator;
    const nextIndex = remaining.findIndex((track) => track.creator !== lastArtist);
    arranged.push(...remaining.splice(nextIndex < 0 ? 0 : nextIndex, 1));
  }
  if (options.order === "ranking") return selected;
  if (options.order === "recent") return selected.sort((a, b) => b.lastPlayed - a.lastPlayed);
  if (options.order === "oldest") return selected.sort((a, b) => a.lastPlayed - b.lastPlayed);
  if (options.order === "random") return selected.sort(() => Math.random() - .5);
  return deduplicateTracks(arranged);
}

export function mixDiscoveredTracks(history: TrackChoice[], discoveries: TrackChoice[], options: PlaylistOptions): TrackChoice[] {
  const excluded = new Set(options.excludedArtists.map((name) => name.trim().toLowerCase()));
  const selected: TrackChoice[] = [];
  const seen = new Set<string>();
  const artistCounts = new Map<string, number>();
  const add = (track: TrackChoice) => {
    const artist = (track.artistGroup ?? track.creator).toLowerCase();
    const key = track.uri || trackNameKey(track.creator, track.item);
    const identity = recordingKey(track);
    const name = recordingKey({ ...track, isrc: undefined });
    if ((!options.allTracks && selected.length >= options.count) || excluded.has(artist) || excluded.has(track.creator.toLowerCase()) || seen.has(key) || seen.has(identity) || seen.has(name) || (artistCounts.get(artist) ?? 0) >= options.maxPerArtist) return;
    selected.push(track); seen.add(key); seen.add(identity); seen.add(name);
    artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
  };
  const desired = options.allTracks ? Number.POSITIVE_INFINITY : options.count;
  const newTarget = options.onlyUnheard ? desired : Math.ceil(desired * options.novelty / 100);
  const groups = new Map<string, TrackChoice[]>();
  discoveries.forEach((track) => {
    const artist = track.artistGroup ?? track.creator;
    const group = groups.get(artist) ?? [];
    group.push(track); groups.set(artist, group);
  });
  const fresh = [...groups.values()];
  for (let index = 0; fresh.some((group) => index < group.length) && selected.length < newTarget; index += 1) {
    for (const group of fresh) { if (selected.length >= newTarget) break; if (group[index]) add(group[index]); }
  }
  if (!options.onlyUnheard) history.forEach(add);
  if (selected.length < options.count) discoveries.forEach(add);
  return deduplicateTracks(selected);
}
