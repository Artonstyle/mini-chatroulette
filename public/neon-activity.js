(() => {
  const AudioAPI = window.AudioContext || window.webkitAudioContext;
  let context;
  const meters = ['localVideo', 'remoteVideo'].map(id => ({video: document.getElementById(id), stream: null, source: null, analyser: null, hold: 0}));
  function release(meter) {
    meter.source?.disconnect();
    meter.analyser?.disconnect();
    meter.source = meter.analyser = meter.stream = null;
    meter.hold = 0;
    meter.video?.parentElement.classList.remove('neon-speaking');
  }
  function unlock() {
    if (!AudioAPI) return;
    context ||= new AudioAPI();
    if (context.state === 'suspended') context.resume().catch(() => {});
  }
  document.addEventListener('pointerdown', unlock, {passive: true});
  document.addEventListener('keydown', unlock);
  const timer = setInterval(() => {
    for (const meter of meters) {
      if (!meter.video) continue;
      const stream = meter.video.srcObject;
      const tracks = stream?.getAudioTracks?.().filter(t => t.readyState === 'live' && t.enabled && !t.muted) || [];
      if (document.hidden || !tracks.length || context?.state !== 'running') {
        release(meter);
        continue;
      }
      if (meter.stream !== stream || meter.track !== tracks[0]) {
        release(meter);
        try {
          meter.source = context.createMediaStreamSource(new MediaStream([tracks[0]]));
          meter.analyser = context.createAnalyser();
          meter.analyser.fftSize = 512;
          meter.samples = new Float32Array(512);
          meter.source.connect(meter.analyser);
          meter.stream = stream;
          meter.track = tracks[0];
        } catch { release(meter); continue; }
      }
      meter.analyser.getFloatTimeDomainData(meter.samples);
      const rms = Math.sqrt(meter.samples.reduce((sum, value) => sum + value * value, 0) / meter.samples.length);
      if (rms > 0.025) meter.hold = Date.now() + 350;
      meter.video.parentElement.classList.toggle('neon-speaking', Date.now() < meter.hold);
    }
  }, 100);
  const chat = document.getElementById('chatBox');
  let messageTimer;
  window.addEventListener('partner-message-received', () => {
    if (!chat) return;
    chat.classList.remove('neon-message');
    void chat.offsetWidth;
    chat.classList.add('neon-message');
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => chat.classList.remove('neon-message'), 1500);
  });
  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    clearTimeout(messageTimer);
    meters.forEach(release);
    context?.close().catch(() => {});
  }, {once: true});
})();
