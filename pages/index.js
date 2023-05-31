import { useState, useEffect, useRef } from 'react';

import Head from 'next/head';

import styles from '../styles/Home.module.css';

/* Blatantly stolen from https://github.com/cwilso/PitchDetect */
const autoCorrelate = (buffer, sampleRate) => {
  // Perform a quick root-mean-square to see if we have enough signal
  let size = buffer.length;
  let sumOfSquares = 0;
  for (let i = 0; i < size; i++) {
    const val = buffer[i];
    sumOfSquares += val * val;
  }
  const rootMeanSquare = Math.sqrt(sumOfSquares / size)
  if (rootMeanSquare < 0.01) {
    return -1;
  }

  // Find a range in the buffer where the values are below a given threshold.
  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.2;

  // Walk up for r1
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i;
      break;
    }
  }

  // Walk down for r2
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < threshold) {
      r2 = size - i;
      break;
    }
  }

  // Trim the buffer to these ranges and update size.
  buffer = buffer.slice(r1, r2);
  size = buffer.length

  // Create a new array of the sums of offsets to do the autocorrelation
  const c = new Array(size).fill(0);
  // For each potential offset, calculate the sum of each buffer value times its offset value
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size - i; j++) {
      c[i] = c[i] + buffer[j] * buffer[j + i]
    }
  }

  // Find the last index where that value is greater than the next one (the dip)
  let d = 0;
  while (c[d] > c[d + 1]) {
    d++;
  }

  // Iterate from that index through the end and find the maximum sum
  let maxValue = -1;
  let maxIndex = -1;
  for (let i = d; i < size; i++) {
    if (c[i] > maxValue) {
      maxValue = c[i];
      maxIndex = i;
    }
  }

  let T0 = maxIndex;

  // Not as sure about this part, don't @ me
  // From the original author:
  // interpolation is parabolic interpolation. It helps with precision. We suppose that a parabola pass through the
  // three points that comprise the peak. 'a' and 'b' are the unknowns from the linear equation system and b/(2a) is
  // the "error" in the abscissa. Well x1,x2,x3 should be y1,y2,y3 because they are the ordinates.
  let x1 = c[T0 - 1];
  let x2 = c[T0];
  let x3 = c[T0 + 1]

  let a = (x1 + x3 - 2 * x2) / 2;
  let b = (x3 - x1) / 2
  if (a) {
    T0 = T0 - b / (2 * a);
  }

  return sampleRate / T0;
}

const getInputStream = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  return stream;
}

const getAudioContext = () => {
  const AudioContext = window.AudioContext ?? window.webkitAudioContext ?? null;
  if (AudioContext == null) throw new Error('Web Audio API not supported');
  return new AudioContext();
}

const connect = (audioContext, inputStream, onReadVolume, onReadPitch) => {
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
  analyser.smoothingTimeConstant = 0.85;
  mediaStreamSource.connect(analyser);
  // Start with a bufferLength of the analyser's FFT size
  const bufferLength = analyser.fftSize;
  const analyseFrequency = () => {
    window.requestAnimationFrame(analyseFrequency);
    // Actually create the buffer
    const buffer = new Float32Array(bufferLength);
    // Populate the buffer with the time domain data
    analyser.getFloatTimeDomainData(buffer);
    const frequency = autoCorrelate(buffer, audioContext.sampleRate)
    onReadPitch(frequency === -1 ? null : frequency);
  }
  analyseFrequency();
}

const MAX_VOLUME = 0.25;
const MIN_PITCH = 80;
const MAX_PITCH = 255;
const getCoordsFromVolumeAndPitch = (canvas, volume, pitch) => {
  if (volume == null || pitch == null) return [0, 0];

  const { width, height } = canvas;
  // `volume` is sort of scaled from 0.00-1.00, but in practice it seems very difficult to get
  // higher than ~0.4, so scale it
  const clampedVolume = Math.min(MAX_VOLUME, volume);
  const scaledVolume = clampedVolume / MAX_VOLUME;
  const x = scaledVolume * (width - 1);
  // `pitch` is a frequency in hertz, so scale it to a typical human vocal range
  const clampedPitch = Math.min(MAX_PITCH, Math.max(pitch, MIN_PITCH));
  const scaledPitch = Math.max(0, clampedPitch - MIN_PITCH) / (MAX_PITCH - MIN_PITCH);
  const y = scaledPitch * (height - 1);
  return [x, y];
}

export default function Home() {
  const [isActive, setIsActive] = useState(false);
  const [volume, setVolume] = useState(null);
  const [pitch, setPitch] = useState(null);

  const canvasRef = useRef(null);

  const draw = (canvas, volume, pitch) => {
    const [x, y] = getCoordsFromVolumeAndPitch(canvas, volume, pitch);
    const ctx = canvas.getContext('2d')
    ctx.reset();
    // TODO making this 3x3 makes it slightly off...
    // ctx.fillRect(x, y, 3, 3);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI, true);
    ctx.strokeStyle = 'blue';
    ctx.stroke();
    ctx.fillStyle = 'blue';
    ctx.fill();
  }

  useEffect(() => {
    draw(canvasRef.current, volume, pitch);
  }, [draw])

  const handleReadVolume = (newVolume) => {
    // Always keep most recent value, don't overwrite with null
    if (newVolume != null) setVolume(newVolume);
  }

  const handleReadPitch = (newPitch) => {
    // Always keep most recent value, don't overwrite with null
    if (newPitch != null) setPitch(newPitch);
  }

  const handleClickStart = async () => {
    setIsActive(true);
    const inputStream = await getInputStream();
    const audioContext = getAudioContext();
    connect(audioContext, inputStream, handleReadVolume, handleReadPitch);
  };

  const handleClickStop = () => {
    setIsActive(false);
    // TODO something else probably, e.g. stop listening
  };

  const displayPitch = pitch ? pitch.toFixed(2) : '?';
  const displayVolume = volume ? volume.toFixed(2) : '?';

  return (
    <div className={styles.container}>
      <Head>
        <title>Mouthse: use your mouth as your mouse</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className={styles.title}>
          Mouthse: use your mouth as your mouse
        </h1>

        <p className={styles.description}>
          Modulate your <em>pitch</em> to control the <em>y</em> axis ↕
        </p>

        <p className={styles.description}>
          Modulate your <em>volume</em> to control the <em>x</em> axis ↔
        </p>

        {isActive
          ? <button onClick={handleClickStop}>Stop</button>
          : <button onClick={handleClickStart}>Start</button>
        }

        <section>
          <p><code>Pitch: {displayPitch}</code></p>
          <p><code>Volume: {displayVolume}</code></p>

          <canvas ref={canvasRef}></canvas>
        </section>
      </main>

      <footer>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <img src="/vercel.svg" alt="Vercel" className={styles.logo} />
        </a>
      </footer>

      <style jsx>{`
        main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        main button {
          width: 10em;
          height: 2em;
          font-size: 2em;
        }
        main code {
          font-size: 5em;
        }
        main canvas {
          width: 600px;
          height: 400px;
          border: 2px dashed black;
        }
        footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        footer img {
          margin-left: 0.5rem;
        }
        footer a {
          display: flex;
          justify-content: center;
          align-items: center;
          text-decoration: none;
          color: inherit;
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  )
}
