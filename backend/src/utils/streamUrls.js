// =============================================================================
// Stream URL & BUTT Configuration Helpers
// =============================================================================

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

function isLocalHostName(hostname) {
  if (!hostname) return true;
  return LOCAL_HOSTS.has(String(hostname).toLowerCase());
}

function isLocalUrl(url) {
  if (!url) return true;
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `http://${url}`;
    return isLocalHostName(new URL(normalized).hostname);
  } catch {
    return true;
  }
}

function stripTrailingSlash(url) {
  return String(url || '').replace(/\/$/, '');
}

function ensureHttps(url) {
  if (!url || !url.startsWith('http://')) return url;
  if (process.env.NODE_ENV !== 'production') return url;
  if (isLocalUrl(url)) return url;
  return url.replace(/^http:\/\//i, 'https://');
}

function getRequestPublicOrigin(req) {
  if (!req) return null;
  const raw = req.get('origin') || req.get('referer');
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (process.env.NODE_ENV === 'production' && isLocalHostName(u.hostname)) {
      return null;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function normalizeMount(mountpoint) {
  if (!mountpoint) return '/live';
  return mountpoint.startsWith('/') ? mountpoint : `/${mountpoint}`;
}

function getStreamHostname() {
  return (
    process.env.PUBLIC_ICECAST_HOST ||
    process.env.ICECAST_HOSTNAME ||
    process.env.PUBLIC_STREAM_HOST ||
    'localhost'
  );
}

function getIcecastConnectHostname() {
  const host = getStreamHostname();
  if (process.env.NODE_ENV === 'production' && isLocalHostName(host)) {
    return process.env.ICECAST_HOST && !isLocalHostName(process.env.ICECAST_HOST)
      ? process.env.ICECAST_HOST
      : host;
  }
  return host;
}

function getPublicBaseUrl(urlContext = {}) {
  const candidates = [
    process.env.PUBLIC_STREAM_URL,
    process.env.APP_URL,
    urlContext.origin
  ]
    .filter(Boolean)
    .map(stripTrailingSlash);

  // 1ª preferência: o primeiro candidato PÚBLICO (não-local), seja qual for o NODE_ENV.
  // Isto evita que um APP_URL=localhost mal configurado contamine os URLs públicos
  // quando o pedido vem claramente de uma origem pública (ex.: o frontend na Vercel).
  const publicBase = candidates.find((base) => !isLocalUrl(base));
  if (publicBase) return ensureHttps(publicBase);

  // 2ª preferência (dev / sem origem pública): primeiro candidato disponível, mesmo local.
  if (candidates.length > 0) return candidates[0];

  const host = getStreamHostname();
  return `http://${host}`;
}

function buildListenUrl(mountpoint, urlContext) {
  const base = getPublicBaseUrl(urlContext);
  const mount = normalizeMount(mountpoint);
  return `${base}/stream${mount}`;
}

function buildDirectListenUrl(mountpoint) {
  const host = getIcecastConnectHostname();
  const port = parseInt(process.env.ICECAST_PORT, 10) || 8000;
  const mount = normalizeMount(mountpoint);
  const useTls = process.env.ICECAST_TLS === 'true' || process.env.PUBLIC_ICECAST_TLS === 'true';
  const protocol = useTls ? 'https' : 'http';
  const portSuffix = (useTls && port === 443) || (!useTls && port === 80) ? '' : `:${port}`;
  return `${protocol}://${host}${portSuffix}${mount}`;
}

function buildPlayerUrl(mountpoint, urlContext) {
  const base = getPublicBaseUrl(urlContext);
  const mount = encodeURIComponent(normalizeMount(mountpoint));
  return `${base}/player?mount=${mount}`;
}

function buildButtFile({ hostname, port, mount, username, password, stationName, format, bitrate }) {
  const codec = format === 'mp3' ? 'mp3' : format === 'ogg' ? 'ogg' : 'aac';
  return `[main]
server = ${hostname}
port = ${port}
type = 0
mount = ${mount}
usr = ${username}
pwd = ${password}
name = ${stationName || 'StreamServer'}
codec = ${codec}
bitrate = ${bitrate}
samplerate = 44100
channel = 2
`;
}

function buildButtConfig(station, urlContext) {
  const hostname = getIcecastConnectHostname();
  const port = parseInt(process.env.ICECAST_PORT, 10) || 8000;
  const mount = normalizeMount(station.mountpoint);
  const username = 'source';
  const password = station.source_password || '';
  const format = station.format || 'mp3';
  const bitrate = station.bitrate || 128;
  const useTls = process.env.ICECAST_TLS === 'true' || process.env.PUBLIC_ICECAST_TLS === 'true';

  return {
    server: {
      hostname,
      port,
      mountpoint: mount,
      username,
      password,
      protocol: 'icecast',
      ssl: useTls
    },
    audio: {
      codec: format === 'ogg' ? 'ogg' : format === 'aac' ? 'aac' : 'mp3',
      bitrate,
      samplerate: 44100,
      channels: 2
    },
    display: {
      stationName: station.name,
      djName: station.dj_name || station.name
    },
    listen_url: buildListenUrl(mount, urlContext),
    listen_url_direct: buildDirectListenUrl(mount),
    player_url: buildPlayerUrl(mount, urlContext),
    buttFile: buildButtFile({
      hostname,
      port,
      mount,
      username,
      password,
      stationName: station.name,
      format,
      bitrate
    })
  };
}

function enrichStation(station, { includePassword = true, origin } = {}) {
  if (!station) return station;

  const urlContext = { origin };
  const mount = normalizeMount(station.mountpoint);
  const enriched = {
    ...station,
    listen_url: buildListenUrl(mount, urlContext),
    listen_url_direct: buildDirectListenUrl(mount),
    player_url: buildPlayerUrl(mount, urlContext),
    stream_url: buildListenUrl(mount, urlContext),
    codec: station.format
  };

  if (includePassword && station.source_password) {
    enriched.icecast = {
      host: getIcecastConnectHostname(),
      port: parseInt(process.env.ICECAST_PORT, 10) || 8000,
      mountpoint: mount,
      username: 'source',
      password: station.source_password,
      format: station.format || 'mp3',
      bitrate: station.bitrate || 128
    };
    enriched.butt = buildButtConfig(station, urlContext);
  } else {
    delete enriched.source_password;
  }

  return enriched;
}

function enrichStationPublic(station, urlContext) {
  const { source_password, ...rest } = station;
  return enrichStation(rest, { includePassword: false, ...urlContext });
}

function defaultMountForSlug(slug) {
  return slug === 'main' ? '/live' : `/${slug}/live`;
}

function logStreamUrlConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  const base = getPublicBaseUrl();
  const icecastHost = getIcecastConnectHostname();

  if (isLocalUrl(base)) {
    console.warn(
      '[stream] PUBLIC_STREAM_URL ou APP_URL deve ser a URL HTTPS do frontend (Vercel). ' +
        'URLs de ouvir online vão sair como localhost.'
    );
  }

  if (isLocalHostName(icecastHost)) {
    console.warn(
      '[stream] PUBLIC_ICECAST_HOST ou ICECAST_HOSTNAME deve ser o host público do Icecast ' +
        'para o BUTT transmitir em produção.'
    );
  }
}

module.exports = {
  normalizeMount,
  getStreamHostname,
  getIcecastConnectHostname,
  getPublicBaseUrl,
  getRequestPublicOrigin,
  buildListenUrl,
  buildDirectListenUrl,
  buildPlayerUrl,
  buildButtConfig,
  buildButtFile,
  enrichStation,
  enrichStationPublic,
  defaultMountForSlug,
  logStreamUrlConfig
};
