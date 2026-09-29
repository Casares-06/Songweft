import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { processSpotifyExport } from "./spotify";

const sample = [
  {
    ts: "2025-01-01T12:00:00Z",
    ms_played: 120_000,
    master_metadata_track_name: "Canción A",
    master_metadata_album_artist_name: "Artista A",
    master_metadata_album_album_name: "Álbum A",
    spotify_track_uri: "spotify:track:a",
    skipped: false,
  },
  {
    ts: "2025-01-01T12:03:00Z",
    ms_played: 60_000,
    master_metadata_track_name: "Canción B",
    master_metadata_album_artist_name: "Artista B",
    spotify_track_uri: "spotify:track:b",
    skipped: true,
  },
];

describe("importación privada de Spotify", () => {
  it("lee y normaliza el historial directamente desde memoria", async () => {
    const archive = zipSync({
      "Spotify Extended Streaming History/Streaming_History_Audio_2025.json": strToU8(JSON.stringify(sample)),
    });
    const bytes = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
    const result = await processSpotifyExport(new Blob([bytes]));
    expect(result.plays).toHaveLength(2);
    expect(result.plays.reduce((total, play) => total + play.minutes, 0)).toBe(3);
    expect(result.plays[0].sessionId).toBe(result.plays[1].sessionId);
  });

  it("rechaza rutas peligrosas dentro del ZIP", async () => {
    const archive = zipSync({ "../Streaming_History_Audio_2025.json": strToU8(JSON.stringify(sample)) });
    const bytes = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
    await expect(processSpotifyExport(new Blob([bytes]))).rejects.toThrow(/ruta no segura/i);
  });

  it.skipIf(!process.env.SONGWEFT_TEST_ZIP)("procesa una exportación real sin escribirla", async () => {
    const path = process.env.SONGWEFT_TEST_ZIP!;
    const bytes = new Uint8Array(await readFile(path));
    const result = await processSpotifyExport(Object.assign(new Blob([bytes]), { name: basename(path) }));
    expect(result.plays.length).toBeGreaterThan(1_000);
    expect(result.sourceFiles.some((name) => name.startsWith("Streaming_History_Audio_"))).toBe(true);
  }, 30_000);
});
