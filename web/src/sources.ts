import { strToU8, zipSync } from "fflate";
import { processSpotifyExport } from "./spotify";
import type { ImportResult, LibraryTrack, Play } from "./types";

const MAX_TEXT_BYTES = 120 * 1024 * 1024;

export function parsePastedTracks(input: string): LibraryTrack[] {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Pega al menos una canción.");
  if (lines.length > 300) throw new Error("Pega como máximo 300 canciones cada vez.");
  const tracks = lines.map((line, index) => {
    const divider = line.search(/\s[—–-]\s/);
    if (divider < 1) throw new Error(`Línea ${index + 1}: usa el formato Artista — Canción.`);
    const creator = line.slice(0, divider).trim();
    const item = line.slice(divider + 3).trim();
    if (!creator || !item) throw new Error(`Línea ${index + 1}: faltan artista o canción.`);
    return { creator, item, uri: "", collection: "", sourceFile: "Lista pegada" };
  });
  return tracks;
}

function parseCsv(input: string): string[][] {
  const firstLine = input.split(/\r?\n/, 1)[0];
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  if (quoted) throw new Error("El CSV tiene comillas sin cerrar.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function csvTracks(text: string, sourceFile: string): LibraryTrack[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error(`${sourceFile} no contiene canciones.`);
  const headers = rows[0].map((name) => name.trim().toLowerCase().replace(/[ _-]+/g, ""));
  const column = (...names: string[]) => headers.findIndex((name) => names.includes(name));
  const title = column("trackname", "songname", "title", "track", "song", "cancion");
  const artist = column("artistname", "artistname(s)", "artistnames", "artist", "artists", "artista");
  const album = column("albumname", "album", "álbum");
  const uri = column("trackuri", "spotifytrackuri", "spotifyuri", "uri", "spotifyid", "trackid");
  if (title < 0 || artist < 0) throw new Error(`${sourceFile}: se necesitan columnas de canción y artista.`);
  return rows.slice(1).map((row) => {
    const item = row[title]?.trim() ?? "";
    const creator = row[artist]?.trim() ?? "";
    const rawUri = uri >= 0 ? row[uri]?.trim() ?? "" : "";
    const spotifyUri = rawUri.startsWith("spotify:track:") ? rawUri : /^[A-Za-z0-9]{22}$/.test(rawUri) ? `spotify:track:${rawUri}` : "";
    return { item, creator, collection: album >= 0 ? row[album]?.trim() ?? "" : "", uri: spotifyUri, sourceFile };
  }).filter((track) => track.item && track.creator);
}

function jsonTracks(rows: unknown[], sourceFile: string): LibraryTrack[] {
  return rows.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const item = (record.track && typeof record.track === "object" ? record.track : record) as Record<string, unknown>;
    const title = String(item.name ?? item.title ?? item.trackName ?? "").trim();
    const artists = Array.isArray(item.artists) ? item.artists.map((artist) => typeof artist === "string" ? artist : artist && typeof artist === "object" ? String((artist as Record<string, unknown>).name ?? "") : "").filter(Boolean).join(", ") : "";
    const creator = String(item.artistName ?? item.artist ?? artists).trim();
    const rawUri = String(item.uri ?? item.spotifyUri ?? "");
    const uri = rawUri.startsWith("spotify:track:") ? rawUri : "";
    if (!title || !creator) return null;
    return { item: title, creator, collection: String(item.albumName ?? (item.album && typeof item.album === "object" ? (item.album as Record<string, unknown>).name : "") ?? ""), uri, sourceFile };
  }).filter((track): track is LibraryTrack => track !== null);
}

function deduplicatePlays(plays: Play[]) {
  const seen = new Set<string>();
  const extended = new Set<string>();
  const unique: Play[] = [];
  let duplicates = 0;
  const prioritized = [...plays].sort((a, b) => Number(b.sourceFile.startsWith("Streaming_History_Audio_")) - Number(a.sourceFile.startsWith("Streaming_History_Audio_")));
  for (const play of prioritized) {
    const key = [play.timestamp, play.ms, play.uri, play.item, play.creator, play.platform, play.country].join("\u001f");
    const crossKey = [Math.floor(play.timestamp / 60_000), play.ms, play.creator.toLowerCase(), play.item.toLowerCase()].join("\u001f");
    const isBasic = /^StreamingHistory|^Streaming_History_Music_/i.test(play.sourceFile);
    if (seen.has(key) || (isBasic && extended.has(crossKey))) { duplicates += 1; continue; }
    seen.add(key);
    if (!isBasic) extended.add(crossKey);
    unique.push(play);
  }
  unique.sort((a, b) => a.timestamp - b.timestamp);
  let session = 0;
  let previous = -Infinity;
  unique.forEach((play, index) => {
    if (play.timestamp - previous > 30 * 60_000) session += 1;
    play.sessionId = session;
    play.id = index;
    previous = play.timestamp;
  });
  return { unique, duplicates };
}

export async function importSources(files: File[], onProgress?: (message: string) => void): Promise<ImportResult> {
  if (!files.length) throw new Error("Selecciona al menos un archivo.");
  const results: ImportResult[] = [];
  const libraryTracks: LibraryTrack[] = [];
  const errors: string[] = [];
  let inputBytes = 0;
  for (const file of files) {
    onProgress?.(`Abriendo ${file.name}…`);
    inputBytes += file.size;
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".csv")) {
        if (file.size > MAX_TEXT_BYTES) throw new Error("El CSV supera 120 MB.");
        libraryTracks.push(...csvTracks(await file.text(), file.name));
      } else if (name.endsWith(".json")) {
        if (file.size > MAX_TEXT_BYTES) throw new Error("El JSON supera 120 MB.");
        const content = await file.text();
        const parsed: unknown = JSON.parse(content);
        if (Array.isArray(parsed)) {
          const history = parsed.some((row) => row && typeof row === "object" && ("endTime" in row || "ts" in row));
          if (history) {
            const basic = parsed.some((row) => row && typeof row === "object" && "endTime" in row);
            const archive = zipSync({ [basic ? "StreamingHistory_0.json" : "Streaming_History_Audio_0.json"]: strToU8(content) });
            results.push(await processSpotifyExport(new Blob([archive.buffer as ArrayBuffer])));
          } else {
            const tracks = jsonTracks(parsed, file.name);
            if (!tracks.length) throw new Error("El JSON no contiene historial ni canciones reconocibles.");
            libraryTracks.push(...tracks);
          }
        } else if (parsed && typeof parsed === "object" && (Array.isArray((parsed as Record<string, unknown>).tracks) || Array.isArray((parsed as Record<string, unknown>).playlists))) {
          const entryName = Array.isArray((parsed as Record<string, unknown>).tracks) ? "YourLibrary.json" : "Playlist1.json";
          const archive = zipSync({ [entryName]: strToU8(content) });
          results.push(await processSpotifyExport(new Blob([archive.buffer as ArrayBuffer])));
        } else throw new Error("El JSON no tiene un formato de historial, biblioteca o playlist reconocible.");
      } else if (name.endsWith(".zip")) {
        results.push(await processSpotifyExport(file, onProgress));
      } else throw new Error("Formato no compatible. Usa ZIP, JSON o CSV.");
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : "No se pudo leer"}`);
    }
  }
  if (!results.length && !libraryTracks.length) throw new Error(errors.join(" ") || "No se encontraron datos compatibles.");
  const { unique, duplicates } = deduplicatePlays(results.flatMap((result) => result.plays));
  const uniqueLibrary = new Map<string, LibraryTrack>();
  [...results.flatMap((result) => result.libraryTracks ?? []), ...libraryTracks].forEach((track) => uniqueLibrary.set(track.uri || `${track.creator.toLowerCase()}\u001f${track.item.toLowerCase()}`, track));
  onProgress?.("Calculando tu biblioteca…");
  return {
    plays: unique,
    libraryTracks: [...uniqueLibrary.values()],
    rawAudioRecords: results.reduce((sum, result) => sum + result.rawAudioRecords, 0),
    duplicateRecords: results.reduce((sum, result) => sum + result.duplicateRecords, 0) + duplicates,
    invalidRecords: results.reduce((sum, result) => sum + result.invalidRecords, 0),
    videoRecords: results.reduce((sum, result) => sum + result.videoRecords, 0),
    sourceFiles: [...files.map((file) => file.name), ...errors.map((message) => `Error: ${message}`)],
    compressedBytes: inputBytes,
    expandedBytes: results.reduce((sum, result) => sum + result.expandedBytes, 0),
  };
}

export function mergeImportResults(current: ImportResult, incoming: ImportResult): ImportResult {
  const { unique, duplicates } = deduplicatePlays([...current.plays, ...incoming.plays]);
  const library = new Map<string, LibraryTrack>();
  [...(current.libraryTracks ?? []), ...(incoming.libraryTracks ?? [])].forEach((track) => library.set(track.uri || `${track.creator.toLowerCase()}\u001f${track.item.toLowerCase()}`, track));
  return {
    plays: unique,
    libraryTracks: [...library.values()],
    rawAudioRecords: current.rawAudioRecords + incoming.rawAudioRecords,
    duplicateRecords: current.duplicateRecords + incoming.duplicateRecords + duplicates,
    invalidRecords: current.invalidRecords + incoming.invalidRecords,
    videoRecords: current.videoRecords + incoming.videoRecords,
    sourceFiles: [...current.sourceFiles, ...incoming.sourceFiles],
    compressedBytes: current.compressedBytes + incoming.compressedBytes,
    expandedBytes: current.expandedBytes + incoming.expandedBytes,
  };
}
