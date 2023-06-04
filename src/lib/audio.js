import autocorrelate from './autocorrelate';

export const getInputStream = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  return stream;
}

export const getAudioContext = () => {
  const AudioContext = window.AudioContext ?? window.webkitAudioContext ?? null;
  if (AudioContext == null) throw new Error('Web Audio API not supported');
  return new AudioContext();
}

export const connect = (audioContext, inputStream, onReadVolume, onReadPitch) => {
  // TODO shouldn't be necessary?
  if (audioContext == null) return;
  // TODO shouldn't be necessary?
  if (inputStream == null) return;

  const mediaStreamSource = audioContext.createMediaStreamSource(inputStream);

  /* Detect volume - stolen from TODO */
  const script = audioContext.createScriptProcessor(2048, 1, 1);
  script.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const sum = input.reduce(
      (acc, datum) => acc + datum * datum,
      0.0,
    );
    const approxVolume = Math.sqrt(sum / input.length);
    onReadVolume(approxVolume);
  };
  mediaStreamSource.connect(script);
  script.connect(audioContext.destination);

  /* Detect pitch - stolen from https://alexanderell.is/posts/tuner/ */
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;
  analyser.smoothingTimeConstant = 1.00;
  mediaStreamSource.connect(analyser);
  // Start with a bufferLength of the analyser's FFT size
  const bufferLength = analyser.fftSize;
  const analyseFrequency = () => {
    window.requestAnimationFrame(analyseFrequency);
    // Actually create the buffer
    const buffer = new Float32Array(bufferLength);
    // Populate the buffer with the time domain data
    analyser.getFloatTimeDomainData(buffer);
    const frequency = autocorrelate(buffer, audioContext.sampleRate)
    onReadPitch(frequency === -1 ? null : frequency);
  }
  analyseFrequency();
}

