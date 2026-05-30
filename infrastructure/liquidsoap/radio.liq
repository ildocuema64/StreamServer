# =============================================================================
# Liquidsoap Radio Script - StreamServer
# =============================================================================
# Professional radio automation with AutoDJ, jingle insertion,
# live input support, metadata handling, and recording.
# =============================================================================

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
settings.server.telnet := true
settings.server.telnet.bind_addr := "0.0.0.0"
settings.server.telnet.port := 1234

# Environment configuration
icecast_host = environment.get("ICECAST_HOST", default="icecast")
icecast_port = int_of_string(environment.get("ICECAST_PORT", default="8000"))
icecast_password = environment.get("ICECAST_SOURCE_PASSWORD", default="sourcepass")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
settings.log.file.path := "/var/log/liquidsoap/radio.log"
settings.log.level := 3

# ---------------------------------------------------------------------------
# Audio Sources
# ---------------------------------------------------------------------------

# Silence fallback (absolute last resort)
silence = blank(id="silence")

# Music playlist (AutoDJ)
music = playlist(
  id="music",
  mode="randomize",
  reload=3600,
  reload_mode="rounds",
  "/var/media/music"
)
music = fallback(id="music_safe", track_sensitive=false, [music, silence])

# Jingles playlist
jingles = playlist(
  id="jingles",
  mode="randomize",
  reload=3600,
  "/var/media/jingles"
)

# Advertisements
ads = playlist(
  id="ads",
  mode="randomize",
  reload=1800,
  "/var/media/ads"
)

# ---------------------------------------------------------------------------
# AutoDJ Assembly
# ---------------------------------------------------------------------------

# Insert jingle every 4 songs
autodj = rotate(
  id="autodj_rotation",
  weights=[4, 1],
  [music, jingles]
)

# Insert ads every 8 tracks
autodj = rotate(
  id="autodj_with_ads",
  weights=[8, 1],
  [autodj, ads]
)

# Apply crossfade transitions
autodj = crossfade(
  id="autodj_crossfade",
  duration=5.0,
  autodj
)

# Normalize volume
autodj = normalize(id="autodj_normalized", autodj)

# ---------------------------------------------------------------------------
# Live Input (BUTT / External Encoders via Harbor)
# ---------------------------------------------------------------------------
live = input.harbor(
  id="live_input",
  port=8005,
  password=icecast_password,
  "/live",
  max=60.0,
  on_connect={fun(~headers, ~uri, ~protocol, _) ->
    log("Live DJ connected: #{uri}")
    # Notify backend via HTTP
    ignore(http.post(
      data='{"event":"live_connect","mount":"/live"}',
      headers=[("Content-Type", "application/json")],
      timeout=5.0,
      "http://backend:3000/api/internal/stream-event"
    ))
  },
  on_disconnect={fun() ->
    log("Live DJ disconnected")
    ignore(http.post(
      data='{"event":"live_disconnect","mount":"/live"}',
      headers=[("Content-Type", "application/json")],
      timeout=5.0,
      "http://backend:3000/api/internal/stream-event"
    ))
  }
)

# ---------------------------------------------------------------------------
# Main Radio Source (Live takes priority over AutoDJ)
# ---------------------------------------------------------------------------
radio = fallback(
  id="main_switch",
  track_sensitive=false,
  transitions=[
    fun(a, b) -> add(normalize=false, [
      fade.initial(duration=1.0, b),
      fade.final(duration=3.0, a)
    ])
  ],
  [live, autodj]
)

# ---------------------------------------------------------------------------
# Metadata Handling
# ---------------------------------------------------------------------------
radio = on_metadata(
  id="metadata_handler",
  fun(m) -> begin
    title = m["title"]
    artist = m["artist"]
    log("Now playing: #{artist} - #{title}")
    # Send metadata to backend
    ignore(http.post(
      data='{"title":"#{title}","artist":"#{artist}","mount":"/live"}',
      headers=[("Content-Type", "application/json")],
      timeout=5.0,
      "http://backend:3000/api/internal/metadata"
    ))
  end,
  radio
)

# ---------------------------------------------------------------------------
# Recording (optional, controlled via telnet)
# ---------------------------------------------------------------------------
is_recording = ref(false)

server.register(
  "recording.start",
  fun(_) -> begin
    is_recording := true
    "Recording started"
  end
)

server.register(
  "recording.stop",
  fun(_) -> begin
    is_recording := false
    "Recording stopped"
  end
)

timestamp = fun() -> time.string("%Y%m%d_%H%M%S")

radio_for_recording = switch(
  id="recording_switch",
  [
    ({!is_recording}, radio)
  ]
)

output.file(
  %mp3(bitrate=192),
  fun() -> '/var/recordings/recording_#{timestamp()}.mp3',
  fallible=true,
  on_start={fun() -> log("Recording started to file")},
  on_stop={fun() -> log("Recording stopped")},
  radio_for_recording
)

# ---------------------------------------------------------------------------
# Output to Icecast - MP3 Stream (Main)
# ---------------------------------------------------------------------------
output.icecast(
  %mp3(bitrate=128, samplerate=44100, stereo=true),
  host=icecast_host,
  port=icecast_port,
  password=icecast_password,
  mount="/autodj",
  name="StreamServer AutoDJ",
  description="Automated Music Programming",
  genre="Various",
  url="https://radio.example.com",
  public=true,
  encoding="UTF-8",
  fallible=true,
  on_start={fun() -> log("MP3 stream started")},
  on_stop={fun() -> log("MP3 stream stopped")},
  on_error={fun(msg) ->
    log("MP3 stream error: #{msg}")
    3.0
  },
  radio
)

# ---------------------------------------------------------------------------
# Output to Icecast - HQ AAC Stream
# ---------------------------------------------------------------------------
output.icecast(
  %fdkaac(bitrate=256, samplerate=44100, channels=2),
  host=icecast_host,
  port=icecast_port,
  password=icecast_password,
  mount="/autodj-hq",
  name="StreamServer AutoDJ HQ",
  description="High Quality AAC Stream",
  genre="Various",
  url="https://radio.example.com",
  public=true,
  fallible=true,
  on_error={fun(msg) ->
    log("AAC stream error: #{msg}")
    3.0
  },
  radio
)

# ---------------------------------------------------------------------------
# Output to Icecast - OGG Vorbis Stream
# ---------------------------------------------------------------------------
output.icecast(
  %vorbis(quality=0.6, samplerate=44100, channels=2),
  host=icecast_host,
  port=icecast_port,
  password=icecast_password,
  mount="/autodj-ogg",
  name="StreamServer AutoDJ OGG",
  description="OGG Vorbis Stream",
  genre="Various",
  url="https://radio.example.com",
  public=true,
  fallible=true,
  on_error={fun(msg) ->
    log("OGG stream error: #{msg}")
    3.0
  },
  radio
)

# ---------------------------------------------------------------------------
# Output to Icecast - Mobile Low Bitrate
# ---------------------------------------------------------------------------
output.icecast(
  %mp3(bitrate=64, samplerate=22050, stereo=false),
  host=icecast_host,
  port=icecast_port,
  password=icecast_password,
  mount="/mobile",
  name="StreamServer Mobile",
  description="Low Bandwidth Stream",
  genre="Various",
  url="https://radio.example.com",
  public=true,
  fallible=true,
  on_error={fun(msg) ->
    log("Mobile stream error: #{msg}")
    3.0
  },
  radio
)

# ---------------------------------------------------------------------------
# Telnet Commands for External Control
# ---------------------------------------------------------------------------
server.register(
  "autodj.skip",
  fun(_) -> begin
    source.skip(music)
    "Track skipped"
  end
)

server.register(
  "autodj.reload",
  fun(_) -> begin
    # Trigger playlist reload
    "Playlist reload requested"
  end
)

server.register(
  "status",
  fun(_) -> begin
    live_status = if source.is_ready(live) then "LIVE" else "OFF" end
    "Live: #{live_status}"
  end
)
