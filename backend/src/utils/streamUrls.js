// =============================================================================
// Stream URL & BUTT Configuration Helpers
// =============================================================================

function normalizeMount(mountpoint) {
  if (!mountpoint) return '/live';
  return mountpoint.startsWith('/') ? mountpoint : `/${mountpoint}`;
}

function getStreamHostname() {
  return process.env.ICECAST_HOSTNAME || process.env.PUBLIC_STREAM_HOST || 'localhost';
}

function getPublicBaseUrl() {
  if (process.env.PUBLIC_STREAM_URL) {
    return process.env.PUBLIC_STREAM_URL.replace(/\/$/, '');
  }
  const appUrl = process.env.APP_URL;
  if (appUrl) return appUrl.replace(/\/$/, '');
  const host = getStreamHostname();
  return `http://${host}`;
}

function buildListenUrl(mountpoint) {
  const base = getPublicBaseUrl();
  const mount = normalizeMount(mountpoint);
  return `${base}/stream${mount}`;
}

function buildDirectListenUrl(mountpoint) {
  const host = getStreamHostname();
  const port = parseInt(process.env.ICECAST_PORT, 10) || 8000;
  const mount = normalizeMount(mountpoint);
  return `http://${host}:${port}${mount}`;
}

function buildPlayerUrl(mountpoint) {
  const base = getPublicBaseUrl();
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

function buildButtConfig(station) {
  const hostname = getStreamHostname();
  const port = parseInt(process.env.ICECAST_PORT, 10) || 8000;
  const mount = normalizeMount(station.mountpoint);
  const username = 'source';
  const password = station.source_password || '';
  const format = station.format || 'mp3';
  const bitrate = station.bitrate || 128;

  return {
    server: {
      hostname,
      port,
      mountpoint: mount,
      username,
      password,
      protocol: 'icecast',
      ssl: false
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
    listen_url: buildListenUrl(mount),
    listen_url_direct: buildDirectListenUrl(mount),
    player_url: buildPlayerUrl(mount),
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

function enrichStation(station, { includePassword = true } = {}) {
  if (!station) return station;

  const mount = normalizeMount(station.mountpoint);
  const enriched = {
    ...station,
    listen_url: buildListenUrl(mount),
    listen_url_direct: buildDirectListenUrl(mount),
    player_url: buildPlayerUrl(mount),
    stream_url: buildListenUrl(mount),
    codec: station.format
  };

  if (includePassword && station.source_password) {
    enriched.icecast = {
      host: getStreamHostname(),
      port: parseInt(process.env.ICECAST_PORT, 10) || 8000,
      mountpoint: mount,
      username: 'source',
      password: station.source_password,
      format: station.format || 'mp3',
      bitrate: station.bitrate || 128
    };
    enriched.butt = buildButtConfig(station);
  } else {
    delete enriched.source_password;
  }

  return enriched;
}

function enrichStationPublic(station) {
  const { source_password, ...rest } = station;
  return enrichStation(rest, { includePassword: false });
}

function defaultMountForSlug(slug) {
  return slug === 'main' ? '/live' : `/${slug}/live`;
}

module.exports = {
  normalizeMount,
  getStreamHostname,
  getPublicBaseUrl,
  buildListenUrl,
  buildDirectListenUrl,
  buildPlayerUrl,
  buildButtConfig,
  buildButtFile,
  enrichStation,
  enrichStationPublic,
  defaultMountForSlug
};
