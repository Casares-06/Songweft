import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpotifyPlaylist, exploreArtistCatalog, importSavedSpotifyTracks, importSpotifyPlaylist, searchSpotifyTrack } from "./spotifyApi";
import { trackNameKey } from "./playlist";

afterEach(() => vi.unstubAllGlobals());

describe("publicación de playlists en Spotify", () => {
  it("crea una lista privada y añade canciones en lotes de 100", async () => {
    const storage = new Map<string, string>();
    storage.set("songweft.spotify", JSON.stringify({ clientId: "a".repeat(32), accessToken: "test-token", expiresAt: Date.now() + 60 * 60_000 }));
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, json: async () => calls.length === 1 ? { id: "playlist-id", external_urls: { spotify: "https://open.spotify.com/playlist/playlist-id" } } : { snapshot_id: "snapshot" } };
    });
    const uris = Array.from({ length: 300 }, (_, index) => `spotify:track:${String(index).padStart(22, "0")}`);
    const url = await createSpotifyPlaylist("Prueba", uris);
    expect(url).toBe("https://open.spotify.com/playlist/playlist-id");
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.spotify.com/v1/me/playlists",
      "https://api.spotify.com/v1/playlists/playlist-id/items",
      "https://api.spotify.com/v1/playlists/playlist-id/items",
      "https://api.spotify.com/v1/playlists/playlist-id/items",
    ]);
    expect(JSON.parse(calls[0].init.body as string).public).toBe(false);
    expect(JSON.parse(calls[1].init.body as string).uris).toHaveLength(100);
    expect(JSON.parse(calls[2].init.body as string).uris).toHaveLength(100);
    expect(JSON.parse(calls[3].init.body as string).uris).toHaveLength(100);
  });

  it("lee canciones guardadas y playlists propias sin asignar minutos", async () => {
    const storage = new Map<string, string>();
    storage.set("songweft.spotify", JSON.stringify({ clientId: "a".repeat(32), accessToken: "test-token", expiresAt: Date.now() + 60 * 60_000 }));
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null });
    const track = { uri: "spotify:track:0123456789abcdefghijkl", name: "Tema", artists: [{ name: "Artista" }], album: { name: "Álbum" } };
    vi.stubGlobal("fetch", async (url: string) => ({ ok: true, json: async () => url.includes("/me/tracks") ? { items: [{ track }], next: null } : { items: [{ item: track }], next: null } }));
    const saved = await importSavedSpotifyTracks();
    const playlist = await importSpotifyPlaylist("https://open.spotify.com/playlist/0123456789abcdefghijkl");
    expect(saved).toMatchObject([{ item: "Tema", creator: "Artista", uri: track.uri }]);
    expect(playlist).toMatchObject([{ item: "Tema", creator: "Artista", uri: track.uri }]);
    expect("minutes" in saved[0]).toBe(false);
  });

  it("solo acepta una coincidencia exacta al buscar canciones para publicar", async () => {
    const storage = new Map<string, string>();
    storage.set("songweft.spotify", JSON.stringify({ clientId: "a".repeat(32), accessToken: "test-token", expiresAt: Date.now() + 60 * 60_000 }));
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null });
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ tracks: { items: [{ name: "Otro tema", artists: [{ name: "Artista" }], uri: "spotify:track:wrong" }, { name: "Tema", artists: [{ name: "Artista" }], uri: "spotify:track:correct" }] } }) }));
    expect(await searchSpotifyTrack("Tema", "Artista")).toBe("spotify:track:correct");
  });

  it("descarta escuchadas por URI o nombre y versiones duplicadas al explorar", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => JSON.stringify({ clientId: "a".repeat(32), accessToken: "test-token", expiresAt: Date.now() + 60 * 60_000 }) });
    const track = (id: number, name: string, artist = "artist-id") => ({ uri: `spotify:track:${String(id).padStart(22, "0")}`, name, artists: [{ id: artist, name: "Artista" }] });
    const entries = [track(1, "Ya escuchada"), track(2, "Sin URI en el ZIP"), track(3, "Nueva"), track(4, "Nueva"), track(5, "Otro artista", "other-id")];
    vi.stubGlobal("fetch", async (url: string) => ({ ok: true, json: async () => url.includes("/artists/") ? { items: [{ id: "album-id", name: "Álbum" }], next: null } : { items: entries, next: null } }));
    const found = await exploreArtistCatalog("Artista", new Set([entries[0].uri]), new Set([trackNameKey("Artista", "Sin URI en el ZIP")]), "artist-id", 300);
    expect(found.map((item) => item.item)).toEqual(["Nueva"]);
  });

  it("puede descubrir más de 24 temas y continúa la paginación de álbumes", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => JSON.stringify({ clientId: "a".repeat(32), accessToken: "test-token", expiresAt: Date.now() + 60 * 60_000 }) });
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      const firstPage = url.includes("offset=0");
      const payload = url.includes("/artists/") ? { items: [{ id: firstPage ? "first" : "second", name: "Álbum" }], next: firstPage ? "next" : null } : { items: Array.from({ length: 20 }, (_, index) => ({ uri: `spotify:track:${String(index + (url.includes("/first/") ? 0 : 20)).padStart(22, "0")}`, name: `Tema ${index + (url.includes("/first/") ? 0 : 20)}`, artists: [{ id: "artist-id", name: "Artista" }] })), next: null };
      return { ok: true, json: async () => payload };
    });
    const found = await exploreArtistCatalog("Artista", new Set(), new Set(), "artist-id", 35);
    expect(found).toHaveLength(35);
    expect(calls.some((url) => url.includes("/artists/") && url.includes("offset=20"))).toBe(true);
  });
});
