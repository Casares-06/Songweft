import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { importSources, mergeImportResults, parsePastedTracks } from "./sources";
import { buildCatalog, recommendTracks } from "./playlist";

const history = [{ endTime: "2025-01-02 12:00", artistName: "Artista", trackName: "Canción", msPlayed: 120_000 }];

describe("fuentes y playlists", () => {
  it("permite empezar con una lista de texto sin inventar minutos", () => {
    const tracks = parsePastedTracks("Artista A — Canción A\nArtista B - Canción B");
    expect(tracks).toHaveLength(2);
    expect(buildCatalog([], tracks).every((track) => track.minutes === 0)).toBe(true);
    expect(() => parsePastedTracks("Sin separador")).toThrow(/Línea 1/);
  });
  it("une ZIP normal, JSON y CSV sin duplicar escuchas", async () => {
    const zip = zipSync({ "MyData/StreamingHistory_music_0.json": strToU8(JSON.stringify(history)) });
    const files = [
      new File([zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer], "spotify.zip"),
      new File([JSON.stringify(history)], "historial.json", { type: "application/json" }),
      new File(['Track Name,Artist Name,Spotify URI\n"Otra canción","Otra artista","spotify:track:0123456789abcdefghijkl"'], "lista.csv", { type: "text/csv" }),
    ];
    const result = await importSources(files);
    expect(result.plays).toHaveLength(1);
    expect(result.plays[0].minutes).toBe(2);
    expect(result.duplicateRecords).toBe(1);
    expect(result.libraryTracks).toHaveLength(1);
    expect(buildCatalog(result.plays, result.libraryTracks)).toHaveLength(2);
    expect(recommendTracks(buildCatalog(result.plays, result.libraryTracks), { recipe: "balanced", count: 2, maxPerArtist: 1, novelty: 30, excludedArtists: [] })).toHaveLength(2);
  });

  it("fusiona importaciones sucesivas sin volver a contar las mismas escuchas", async () => {
    const file = new File([JSON.stringify(history)], "historial.json");
    const first = await importSources([file]);
    const second = await importSources([file]);
    const merged = mergeImportResults(first, second);
    expect(merged.plays).toHaveLength(1);
    expect(merged.duplicateRecords).toBe(1);
  });

  it("aprovecha la biblioteca y playlists del ZIP de cuenta", async () => {
    const zip = zipSync({
      "Spotify Account Data/StreamingHistory_music_0.json": strToU8(JSON.stringify(history)),
      "Spotify Account Data/StreamingHistory_podcast_0.json": strToU8(JSON.stringify([{ endTime: "2025-01-03 12:00", podcastName: "Podcast", episodeName: "Episodio", msPlayed: 300_000 }])),
      "Spotify Account Data/YourLibrary.json": strToU8(JSON.stringify({ tracks: [{ artist: "Artista", track: "Otra", album: "Álbum", uri: "spotify:track:0123456789abcdefghijkl" }] })),
      "Spotify Account Data/Playlist1.json": strToU8(JSON.stringify({ playlists: [{ items: [{ track: { artistName: "Otro artista", trackName: "Tercera", albumName: "Otro álbum", trackUri: "spotify:track:abcdefghijkl0123456789" } }] }] })),
    });
    const file = new File([zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer], "account.zip");
    const result = await importSources([file]);
    expect(result.plays).toHaveLength(2);
    expect(result.plays.some((play) => play.contentType === "episode" && play.creator === "Podcast")).toBe(true);
    expect(result.libraryTracks).toHaveLength(2);
  });

  it("acepta YourLibrary.json y Playlist1.json sin empaquetarlos", async () => {
    const files = [
      new File([JSON.stringify({ tracks: [{ artist: "Una artista", track: "Su canción", uri: "spotify:track:0123456789abcdefghijkl" }] })], "YourLibrary.json"),
      new File([JSON.stringify({ playlists: [{ items: [{ track: { artistName: "Otro artista", trackName: "Otro tema", trackUri: "spotify:track:abcdefghijkl0123456789" } }] }] })], "Playlist1.json"),
    ];
    const result = await importSources(files);
    expect(result.plays).toHaveLength(0);
    expect(result.libraryTracks).toHaveLength(2);
  });

  it("completa con la biblioteca una URI ausente del historial sin duplicar canción", async () => {
    const result = await importSources([new File([JSON.stringify([{ ts: "2025-01-01T12:00:00Z", ms_played: 60_000, master_metadata_track_name: "Tema", master_metadata_album_artist_name: "Artista", spotify_track_uri: null }])], "escuchas.json")]);
    const catalog = buildCatalog(result.plays, [{ creator: "Artista", item: "Tema", uri: "spotify:track:0123456789abcdefghijkl", collection: "", sourceFile: "biblioteca.csv" }]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].minutes).toBe(1);
    expect(catalog[0].uri).toBe("spotify:track:0123456789abcdefghijkl");
  });
});
