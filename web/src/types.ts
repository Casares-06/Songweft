export type ContentType = "track" | "episode" | "audiobook" | "unknown";

export interface SpotifyRecord {
  ts?: unknown;
  ms_played?: unknown;
  master_metadata_track_name?: unknown;
  master_metadata_album_artist_name?: unknown;
  master_metadata_album_album_name?: unknown;
  spotify_track_uri?: unknown;
  episode_name?: unknown;
  episode_show_name?: unknown;
  spotify_episode_uri?: unknown;
  audiobook_title?: unknown;
  audiobook_chapter_title?: unknown;
  audiobook_chapter_uri?: unknown;
  platform?: unknown;
  conn_country?: unknown;
  reason_start?: unknown;
  reason_end?: unknown;
  shuffle?: unknown;
  skipped?: unknown;
  offline?: unknown;
  incognito_mode?: unknown;
  [key: string]: unknown;
}

export interface LibraryTrack {
  uri: string;
  item: string;
  creator: string;
  collection: string;
  sourceFile: string;
  isrc?: string;
  releaseDate?: string;
  albumType?: "album" | "single" | "compilation";
}

export interface Play {
  id: number;
  at: Date;
  timestamp: number;
  day: string;
  month: string;
  year: number;
  hour: number;
  weekday: number;
  ms: number;
  minutes: number;
  contentType: ContentType;
  uri: string;
  item: string;
  creator: string;
  collection: string;
  platform: string;
  country: string;
  reasonStart: string;
  reasonEnd: string;
  shuffle: boolean | null;
  skipped: boolean | null;
  offline: boolean | null;
  incognito: boolean | null;
  sessionId: number;
  sourceFile: string;
}

export interface ImportResult {
  plays: Play[];
  libraryTracks?: LibraryTrack[];
  rawAudioRecords: number;
  duplicateRecords: number;
  invalidRecords: number;
  videoRecords: number;
  sourceFiles: string[];
  compressedBytes: number;
  expandedBytes: number;
}

export interface RankingRow {
  key: string;
  name: string;
  secondary?: string;
  minutes: number;
  events: number;
  streams: number;
  unique?: number;
}
