const KEY = "songweft.spotify";
const AUTHORIZE = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";
import type { LibraryTrack } from "./types";

interface Session { clientId: string; accessToken?: string; refreshToken?: string; expiresAt?: number; verifier?: string; state?: string }

function read(): Session {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch { return { clientId: "" }; }
}
function save(session: Session) { sessionStorage.setItem(KEY, JSON.stringify(session)); }

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function spotifyConnected() { return Boolean(read().accessToken); }
export function disconnectSpotify() { sessionStorage.removeItem(KEY); }

export function listenForSpotifyConnection() {
  const listener = (event: MessageEvent) => {
    if (event.origin !== location.origin || event.data?.type !== "songweft-oauth") return;
    save(event.data.session as Session);
    window.dispatchEvent(new Event("songweft-connected"));
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

export async function connectSpotify(clientId: string) {
  if (!/^[a-f\d]{32}$/i.test(clientId.trim())) throw new Error("Introduce un Client ID de Spotify válido.");
  const popup = window.open("", "songweft-spotify-login", "popup=yes,width=520,height=720");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  save({ clientId: clientId.trim(), verifier, state });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId.trim(),
    scope: "playlist-modify-private playlist-read-private user-library-read",
    redirect_uri: `${location.origin}${location.pathname}`,
    state,
    code_challenge_method: "S256",
    code_challenge: base64url(digest),
  });
  if (popup) popup.location.assign(`${AUTHORIZE}?${params}`);
  else location.assign(`${AUTHORIZE}?${params}`);
}

export async function finishSpotifyLogin() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (!code && !error) return false;
  history.replaceState({}, "", `${location.origin}${location.pathname}${location.hash}`);
  if (error) throw new Error(`Spotify rechazó la conexión: ${error}`);
  const session = read().verifier ? read() : window.opener?.sessionStorage ? JSON.parse(window.opener.sessionStorage.getItem(KEY) || "{}") as Session : read();
  if (!session.clientId || !session.verifier || !session.state || session.state !== params.get("state")) throw new Error("La verificación de Spotify ha fallado. Inicia la conexión de nuevo.");
  const response = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: session.clientId, grant_type: "authorization_code", code: code!, redirect_uri: `${location.origin}${location.pathname}`, code_verifier: session.verifier }) });
  if (!response.ok) throw new Error("Spotify no pudo completar la conexión.");
  const token = await response.json();
  const authenticated = { clientId: session.clientId, accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 };
  save(authenticated);
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: "songweft-oauth", session: authenticated }, location.origin);
    window.close();
  }
  return true;
}

async function accessToken() {
  const session = read();
  if (!session.accessToken) throw new Error("Conecta Spotify primero.");
  if ((session.expiresAt ?? 0) > Date.now() + 60_000) return session.accessToken;
  if (!session.refreshToken) throw new Error("La sesión caducó. Conecta Spotify de nuevo.");
  const response = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: session.clientId, grant_type: "refresh_token", refresh_token: session.refreshToken }) });
  if (!response.ok) throw new Error("No se pudo renovar la sesión de Spotify.");
  const token = await response.json();
  save({ ...session, accessToken: token.access_token, refreshToken: token.refresh_token || session.refreshToken, expiresAt: Date.now() + token.expires_in * 1000 });
  return token.access_token as string;
}

async function request(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
    if (response.status === 429 && attempt < 2) {
      const seconds = Number(response.headers.get("Retry-After"));
      await new Promise((resolve) => setTimeout(resolve, Math.min(30, Math.max(1, Number.isFinite(seconds) ? seconds : 3 * (attempt + 1))) * 1000));
      continue;
    }
    if (!response.ok) {
      if (response.status === 429) throw new Error("Spotify ha limitado las peticiones. Inténtalo más tarde.");
      throw new Error(`Spotify devolvió un error ${response.status}. Comprueba los permisos de tu app.`);
    }
    return response.json();
  }
  throw new Error("No se pudo completar la petición a Spotify.");
}

export async function createSpotifyPlaylist(name: string, uris: string[]) {
  if (!uris.length) throw new Error("Ninguna canción tiene enlace de Spotify. Añade canciones identificadas antes de publicar.");
  const playlist = await request("/me/playlists", { method: "POST", body: JSON.stringify({ name, public: false, description: "Creada con Songweft desde mi biblioteca musical" }) });
  for (let index = 0; index < uris.length; index += 100) {
    await request(`/playlists/${encodeURIComponent(playlist.id)}/items`, { method: "POST", body: JSON.stringify({ uris: uris.slice(index, index + 100) }) });
  }
  return playlist.external_urls?.spotify as string | undefined;
}

export async function searchSpotifyTrack(item: string, creator: string): Promise<string | null> {
  const query = encodeURIComponent(`track:${item} artist:${creator}`);
  const result = await request(`/search?q=${query}&type=track&limit=5`);
  const match = result.tracks?.items?.find((track: { name: string; artists: { name: string }[] }) => track.name.toLowerCase() === item.toLowerCase() && track.artists.some((artist) => artist.name.toLowerCase() === creator.toLowerCase()));
  return match?.uri ?? null;
}

function asLibraryTrack(entry: { uri?: string; name?: string; artists?: { name: string }[]; album?: { name: string } }, sourceFile: string): LibraryTrack | null {
  if (!entry.uri?.startsWith("spotify:track:") || !entry.name || !entry.artists?.length) return null;
  return { uri: entry.uri, item: entry.name, creator: entry.artists.map((artist) => artist.name).join(", "), collection: entry.album?.name ?? "", sourceFile };
}

export async function importSavedSpotifyTracks(onProgress?: (message: string) => void): Promise<LibraryTrack[]> {
  const tracks: LibraryTrack[] = [];
  let offset = 0;
  while (true) {
    onProgress?.(`Leyendo canciones guardadas: ${tracks.length}…`);
    const page = await request(`/me/tracks?limit=50&offset=${offset}`);
    for (const entry of page.items ?? []) {
      const track = asLibraryTrack(entry.track, "Spotify · Me gusta");
      if (track) tracks.push(track);
    }
    offset += page.items?.length ?? 0;
    if (!page.next || !page.items?.length) break;
  }
  return tracks;
}

export async function importSpotifyPlaylist(url: string, onProgress?: (message: string) => void): Promise<LibraryTrack[]> {
  const match = url.match(/(?:open\.spotify\.com\/playlist\/|spotify:playlist:)([A-Za-z0-9]{22})/);
  if (!match) throw new Error("Pega el enlace de una playlist de Spotify.");
  const tracks: LibraryTrack[] = [];
  let offset = 0;
  while (true) {
    onProgress?.(`Leyendo playlist: ${tracks.length} canciones…`);
    const page = await request(`/playlists/${match[1]}/items?limit=50&offset=${offset}`);
    for (const entry of page.items ?? []) {
      const track = asLibraryTrack(entry.item, "Spotify · Playlist");
      if (track) tracks.push(track);
    }
    offset += page.items?.length ?? 0;
    if (!page.next || !page.items?.length) break;
  }
  return tracks;
}

export async function exploreArtistCatalog(artistName: string, knownUris: Set<string>): Promise<LibraryTrack[]> {
  const found = await request(`/search?q=${encodeURIComponent(`artist:${artistName}`)}&type=artist&limit=5`);
  const artist = found.artists?.items?.find((item: { name: string }) => item.name.toLowerCase() === artistName.toLowerCase());
  if (!artist) throw new Error(`No se encontró a ${artistName} en Spotify.`);
  const albums = await request(`/artists/${artist.id}/albums?include_groups=album,single&limit=8`);
  const suggestions: LibraryTrack[] = [];
  const seen = new Set<string>();
  for (const album of (albums.items ?? []).slice(0, 5)) {
    const page = await request(`/albums/${album.id}/tracks?limit=50`);
    for (const entry of page.items ?? []) {
      const track = asLibraryTrack({ ...entry, album: { name: album.name } }, "Spotify · Discografía");
      if (!track || knownUris.has(track.uri) || seen.has(track.uri)) continue;
      seen.add(track.uri);
      suggestions.push(track);
      if (suggestions.length >= 24) return suggestions;
    }
  }
  return suggestions;
}
