import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import type { ContentType, ImportResult, LibraryTrack, Play, SpotifyRecord } from "./types";

const MAX_ZIP_BYTES = 250 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 800 * 1024 * 1024;
const MAX_ENTRY_BYTES = 120 * 1024 * 1024;
const MAX_ENTRIES = 100;
const MAX_RATIO = 250;
const AUDIO_FILE = /(^|\/)Streaming_History_Audio_[^/]*\.json$/i;
const BASIC_FILE = /(^|\/)(StreamingHistory[^/]*|Streaming_History_Music_[^/]*)\.json$/i;
const VIDEO_FILE = /(^|\/)Streaming_History_Video_[^/]*\.json$/i;
const LIBRARY_FILE = /(^|\/)YourLibrary\.json$/i;
const PLAYLIST_FILE = /(^|\/)Playlist\d+\.json$/i;

const text = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const bool = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

function safeEntryName(name: string): boolean {
  const normalized = name.replaceAll("\\", "/");
  return (
    !normalized.startsWith("/") &&
    !/^[a-z]:\//i.test(normalized) &&
    !normalized.includes("\0") &&
    !normalized.split("/").includes("..")
  );
}

function fingerprint(record: SpotifyRecord): string {
  return [
    record.ts ?? record.endTime,
    record.ms_played ?? record.msPlayed,
    record.spotify_track_uri ?? `${record.artistName ?? ""}:${record.trackName ?? ""}`,
    record.spotify_episode_uri,
    record.audiobook_chapter_uri,
    record.platform,
    record.conn_country,
    record.reason_start,
    record.reason_end,
    record.shuffle,
    record.skipped,
    record.offline,
    record.incognito_mode,
  ].join("\u001f");
}

function normalizeRecord(record: SpotifyRecord, sourceFile: string, id: number): Play | null {
  const rawDate = text(record.ts) || (text(record.endTime) ? `${text(record.endTime).replace(" ", "T")}:00Z` : "");
  const at = new Date(rawDate);
  if (!rawDate || Number.isNaN(at.getTime())) return null;

  const numericMs = Number(record.ms_played ?? record.msPlayed);
  const ms = Number.isFinite(numericMs) ? Math.max(0, Math.trunc(numericMs)) : 0;
  const trackUri = text(record.spotify_track_uri);
  const episodeUri = text(record.spotify_episode_uri);
  const bookUri = text(record.audiobook_chapter_uri);
  let contentType: ContentType = "unknown";
  if (trackUri || (text(record.artistName) && text(record.trackName))) contentType = "track";
  else if (episodeUri) contentType = "episode";
  else if (bookUri) contentType = "audiobook";

  const item =
    text(record.master_metadata_track_name) ||
    text(record.trackName) ||
    text(record.episode_name) ||
    text(record.audiobook_chapter_title) ||
    "Sin título";
  const creator =
    text(record.master_metadata_album_artist_name) ||
    text(record.artistName) ||
    text(record.episode_show_name) ||
    text(record.audiobook_title) ||
    "Desconocido";
  const collection =
    text(record.master_metadata_album_album_name) ||
    text(record.episode_show_name) ||
    text(record.audiobook_title) ||
    "Sin colección";

  const year = at.getFullYear();
  const monthNumber = String(at.getMonth() + 1).padStart(2, "0");
  const dayNumber = String(at.getDate()).padStart(2, "0");

  return {
    id,
    at,
    timestamp: at.getTime(),
    day: `${year}-${monthNumber}-${dayNumber}`,
    month: `${year}-${monthNumber}`,
    year,
    hour: at.getHours(),
    weekday: (at.getDay() + 6) % 7,
    ms,
    minutes: ms / 60_000,
    contentType,
    uri: trackUri || episodeUri || bookUri || `${creator}\u001f${item}`,
    item,
    creator,
    collection,
    platform: text(record.platform) || "Desconocida",
    country: text(record.conn_country) || "—",
    reasonStart: text(record.reason_start) || "Desconocido",
    reasonEnd: text(record.reason_end) || "Desconocido",
    shuffle: bool(record.shuffle),
    skipped: bool(record.skipped),
    offline: bool(record.offline),
    incognito: bool(record.incognito_mode),
    sessionId: 0,
    sourceFile,
  };
}

function parseJsonEntry(
  file: UnzipFile,
  onRecords: (records: unknown, filename: string, isVideo: boolean) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const chunks: string[] = [];
    let outputBytes = 0;
    file.ondata = (error, data, final) => {
      if (error) {
        reject(new Error(`No se pudo descomprimir ${file.name}.`));
        return;
      }
      outputBytes += data.byteLength;
      if (outputBytes > MAX_ENTRY_BYTES) {
        file.terminate();
        reject(new Error(`El archivo ${file.name} supera el límite seguro de 120 MB.`));
        return;
      }
      chunks.push(decoder.decode(data, { stream: !final }));
      if (!final) return;
      try {
        const parsed: unknown = JSON.parse(chunks.join(""));
        onRecords(parsed, file.name.split("/").at(-1) ?? file.name, VIDEO_FILE.test(file.name));
        resolve();
      } catch {
        reject(new Error(`${file.name} no contiene un historial JSON válido.`));
      }
    };
    file.start();
  });
}

export async function processSpotifyExport(
  source: Blob & { name?: string },
  onProgress?: (message: string) => void,
): Promise<ImportResult> {
  if (source.size > MAX_ZIP_BYTES) throw new Error("El ZIP supera el límite seguro de 250 MB.");
  if (source.size < 100) throw new Error("El archivo está vacío o no parece un ZIP válido.");

  const plays: Play[] = [];
  const libraryTracks: LibraryTrack[] = [];
  const seen = new Set<string>();
  const sourceFiles: string[] = [];
  const jobs: Promise<void>[] = [];
  let entries = 0;
  let expandedBytes = 0;
  let rawAudioRecords = 0;
  let duplicateRecords = 0;
  let invalidRecords = 0;
  let videoRecords = 0;

  const unzipper = new Unzip((file) => {
    entries += 1;
    if (entries > MAX_ENTRIES) throw new Error("El ZIP contiene demasiados archivos.");
    if (!safeEntryName(file.name)) throw new Error("El ZIP contiene una ruta no segura.");

    const expected = AUDIO_FILE.test(file.name) || BASIC_FILE.test(file.name) || VIDEO_FILE.test(file.name) || LIBRARY_FILE.test(file.name) || PLAYLIST_FILE.test(file.name);
    if (!expected) return;
    if (file.originalSize !== undefined) {
      if (file.originalSize > MAX_ENTRY_BYTES) throw new Error(`${file.name} es demasiado grande.`);
      expandedBytes += file.originalSize;
      if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error("El ZIP se expande por encima del límite seguro.");
      if (file.size && file.originalSize / file.size > MAX_RATIO) {
        throw new Error("El ZIP tiene una relación de compresión sospechosa.");
      }
    }

    sourceFiles.push(file.name.split("/").at(-1) ?? file.name);
    onProgress?.(`Leyendo ${sourceFiles.at(-1)}…`);
    jobs.push(
      parseJsonEntry(file, (records, filename, isVideo) => {
        if (LIBRARY_FILE.test(filename) || PLAYLIST_FILE.test(filename)) {
          if (!records || typeof records !== "object") return;
          const data = records as Record<string, unknown>;
          const entries = LIBRARY_FILE.test(filename) ? data.tracks : Array.isArray(data.playlists) ? data.playlists.flatMap((playlist) => playlist && typeof playlist === "object" && Array.isArray(playlist.items) ? playlist.items : []) : [];
          if (!Array.isArray(entries)) return;
          entries.forEach((entry) => {
            if (!entry || typeof entry !== "object") return;
            const raw = (entry as Record<string, unknown>).track;
            const track = raw && typeof raw === "object" ? raw as Record<string, unknown> : entry as Record<string, unknown>;
            const item = text(track.trackName) || text(track.track);
            const creator = text(track.artistName) || text(track.artist);
            if (!item || !creator) return;
            const rawUri = text(track.trackUri) || text(track.uri);
            libraryTracks.push({ item, creator, collection: text(track.albumName) || text(track.album), uri: rawUri.startsWith("spotify:track:") ? rawUri : "", sourceFile: filename });
          });
          return;
        }
        if (!Array.isArray(records)) throw new Error(`${filename} no contiene una lista de escuchas.`);
        if (isVideo) {
          videoRecords += records.length;
          return;
        }
        rawAudioRecords += records.length;
        records.forEach((record) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            invalidRecords += 1;
            return;
          }
          const key = fingerprint(record);
          if (seen.has(key)) {
            duplicateRecords += 1;
            return;
          }
          seen.add(key);
          const play = normalizeRecord(record, filename, plays.length);
          if (play) plays.push(play);
          else invalidRecords += 1;
        });
      }),
    );
  });
  unzipper.register(UnzipInflate);

  try {
    const reader = source.stream().getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      unzipper.push(value, false);
    }
    unzipper.push(new Uint8Array(0), true);
    await Promise.all(jobs);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("No se pudo abrir el ZIP. Comprueba que sea la exportación original de Spotify.");
  }

  if (!sourceFiles.some((name) => AUDIO_FILE.test(name) || BASIC_FILE.test(name)) && !libraryTracks.length) {
    throw new Error("No encontramos un historial ni canciones de biblioteca en el ZIP.");
  }
  if (!plays.length && !libraryTracks.length) throw new Error("El archivo no contiene escuchas de audio ni canciones válidas.");

  plays.sort((a, b) => a.timestamp - b.timestamp);
  let sessionId = 0;
  let previousTimestamp: number | null = null;
  plays.forEach((play, index) => {
    if (previousTimestamp === null || play.timestamp - previousTimestamp > 30 * 60_000) sessionId += 1;
    play.sessionId = sessionId;
    play.id = index;
    previousTimestamp = play.timestamp;
  });

  seen.clear();
  onProgress?.("Calculando tu historia…");
  return {
    plays,
    libraryTracks,
    rawAudioRecords,
    duplicateRecords,
    invalidRecords,
    videoRecords,
    sourceFiles,
    compressedBytes: source.size,
    expandedBytes,
  };
}
