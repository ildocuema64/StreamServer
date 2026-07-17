// =============================================================================
// streamUrls — Icecast host resolution (BUTT vs listen URL)
// =============================================================================

const ORIGINAL_ENV = { ...process.env };

function loadStreamUrls(env = {}) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return require('./streamUrls');
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getIcecastSetupStatus', () => {
  it('does not use Vercel APP_URL as Icecast host', () => {
    const { getIcecastSetupStatus } = loadStreamUrls({
      NODE_ENV: 'production',
      APP_URL: 'https://stream-server-rouge.vercel.app',
      PUBLIC_STREAM_URL: 'https://stream-server-rouge.vercel.app'
    });

    const status = getIcecastSetupStatus();
    expect(status.configured).toBe(false);
    expect(status.reason).toBe('missing_public_icecast_host');
    expect(status.connectHost).toBeNull();
  });

  it('uses PUBLIC_ICECAST_HOST when set', () => {
    const { getIcecastSetupStatus, getIcecastConnectHostname } = loadStreamUrls({
      NODE_ENV: 'production',
      PUBLIC_ICECAST_HOST: 'icecast.example.com',
      APP_URL: 'https://stream-server-rouge.vercel.app'
    });

    expect(getIcecastConnectHostname()).toBe('icecast.example.com');
    expect(getIcecastSetupStatus().configured).toBe(true);
  });

  it('rejects frontend hosts in explicit icecast config', () => {
    const { getIcecastSetupStatus } = loadStreamUrls({
      NODE_ENV: 'production',
      PUBLIC_ICECAST_HOST: 'stream-server-rouge.vercel.app'
    });

    const status = getIcecastSetupStatus();
    expect(status.configured).toBe(false);
    expect(status.reason).toBe('missing_public_icecast_host');
  });

  it('allows localhost in development', () => {
    const { getIcecastSetupStatus } = loadStreamUrls({
      NODE_ENV: 'development',
      ICECAST_HOST: 'localhost'
    });

    expect(getIcecastSetupStatus().configured).toBe(true);
    expect(getIcecastSetupStatus().connectHost).toBe('localhost');
  });
});

describe('buildListenUrl vs buildDirectListenUrl', () => {
  it('listen URL uses Vercel; direct URL uses Icecast VM', () => {
    const { buildListenUrl, buildDirectListenUrl } = loadStreamUrls({
      NODE_ENV: 'production',
      APP_URL: 'https://stream-server-rouge.vercel.app',
      PUBLIC_ICECAST_HOST: 'icecast.example.com',
      ICECAST_PORT: '8000'
    });

    expect(buildListenUrl('/radio-chipcity/live', {})).toBe(
      'https://stream-server-rouge.vercel.app/stream/radio-chipcity/live'
    );
    expect(buildDirectListenUrl('/radio-chipcity/live')).toBe(
      'http://icecast.example.com:8000/radio-chipcity/live'
    );
  });
});
