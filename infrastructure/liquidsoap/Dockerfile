FROM savonet/liquidsoap:v2.2.5

# Install additional codecs and tools
RUN apt-get update && apt-get install -y \
    libmp3lame-dev \
    libfdk-aac-dev \
    libvorbis-dev \
    libogg-dev \
    libflac-dev \
    libsamplerate0-dev \
    curl \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /var/media/music \
    /var/media/jingles \
    /var/media/ads \
    /var/media/fallback \
    /var/recordings \
    /etc/liquidsoap/scripts \
    /var/log/liquidsoap

# Copy default fallback audio (silence)
COPY fallback.mp3 /var/media/fallback/silence.mp3

# Copy configuration
COPY radio.liq /etc/liquidsoap/radio.liq
COPY scripts/ /etc/liquidsoap/scripts/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD echo "version" | nc -w 2 localhost 1234 || exit 1

EXPOSE 8005 1234

ENTRYPOINT ["liquidsoap"]
CMD ["/etc/liquidsoap/radio.liq"]
