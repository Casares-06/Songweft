import { describe, expect, it } from "vitest";
import { buildCatalog, mixDiscoveredTracks, recommendTracks, type PlaylistOptions } from "./playlist";
import type { LibraryTrack, Play } from "./types";

const now = Date.UTC(2026, 8, 1);
const options: PlaylistOptions = { recipe: "balanced", count: 300, maxPerArtist: 300, novelty: 30, excludedArtists: [], selectedArtists: [] };
const play = (index: number, artist = "Artista"): Play => ({ id: index, at: new Date(now), timestamp: now, day: "2026-09-01", month: "2026-09", year: 2026, hour: 12, weekday: 1, ms: 180_000, minutes: 3, contentType: "track", uri: `spotify:track:${String(index).padStart(22, "0")}`, item: `Tema ${index}`, creator: artist, collection: "", platform: "", country: "", reasonStart: "", reasonEnd: "", shuffle: null, skipped: null, offline: null, incognito: null, sessionId: 0, sourceFile: "test.json" });

describe("playlists basadas en escuchas", () => {
  it("permite 300 canciones y más de 10 del mismo artista", () => {
    const catalog = buildCatalog(Array.from({ length: 320 }, (_, index) => play(index)));
    expect(recommendTracks(catalog, options, now)).toHaveLength(300);
  });

  it("limita la receta de artistas a los seleccionados", () => {
    const catalog = buildCatalog([play(1, "A"), play(2, "B"), play(3, "A")]);
    const selected = recommendTracks(catalog, { ...options, recipe: "artists", selectedArtists: ["A"] }, now);
    expect(selected.map((track) => track.creator)).toEqual(["A", "A"]);
  });

  it("distingue canciones escuchadas de importadas sin escuchas", () => {
    const imported: LibraryTrack = { uri: "spotify:track:9999999999999999999999", item: "Tema nuevo", creator: "A", collection: "", sourceFile: "lista.csv" };
    const catalog = buildCatalog([play(1, "A")], [imported]);
    expect(catalog.filter((track) => track.lastPlayed > 0)).toHaveLength(1);
  });

  it("aplica el límite por artista a toda la mezcla y evita duplicados", () => {
    const history = buildCatalog([play(1, "A"), play(2, "A"), play(3, "B")]);
    const discovery = buildCatalog([play(4, "A"), play(5, "B"), play(6, "B")]).map((track) => ({ ...track, lastPlayed: 0, minutes: 0 }));
    const mixed = mixDiscoveredTracks(history, [...discovery, discovery[0]], { ...options, count: 6, maxPerArtist: 2, novelty: 50 });
    expect(mixed).toHaveLength(4);
    expect(new Set(mixed.map((track) => track.uri)).size).toBe(4);
    expect(mixed.filter((track) => track.creator === "A")).toHaveLength(2);
    expect(mixed.filter((track) => track.creator === "B")).toHaveLength(2);
  });

  it("respeta las exclusiones también en canciones del catálogo", () => {
    const discovery = buildCatalog([play(1, "A"), play(2, "B")]);
    const mixed = mixDiscoveredTracks([], discovery, { ...options, excludedArtists: ["A"] });
    expect(mixed.map((track) => track.creator)).toEqual(["B"]);
  });
});
