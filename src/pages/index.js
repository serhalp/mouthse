import { useState, useEffect, useRef } from 'react';

import Head from 'next/head';

import styles from '../styles/Home.module.css';
import { getInputStream, getAudioContext, connect } from '../lib/audio';

const DEFAULT_MAX_VOLUME = 0.25;
const DEFAULT_MIN_PITCH = 80;
const DEFAULT_MAX_PITCH = 255;

const getCoordsFromVolumeAndPitch = (canvas, volume, pitch, config) => {
  if (volume == null || pitch == null) return [0, 0];

  const { width, height } = canvas;
  const { minPitch, maxPitch, maxVolume } = config;
  // `volume` is sort of scaled from 0.00-1.00, but in practice it seems very difficult to get
  // higher than ~0.4, so scale it
  const clampedVolume = Math.min(maxVolume, volume);
  const scaledVolume = clampedVolume / maxVolume;
  const x = scaledVolume * (width - 1);
  // `pitch` is a frequency in hertz, so scale it to a typical human vocal range
  const clampedPitch = Math.min(maxPitch, Math.max(pitch, minPitch));
  const scaledPitch = Math.max(0, clampedPitch - minPitch) / (maxPitch - minPitch);
  const y = scaledPitch * (height - 1);
  return [x, y];
}

export default function Home() {
  const [isActive, setIsActive] = useState(false);
  const [shouldDraw, setShouldDraw] = useState(false);
  const [minPitch, setMinPitch] = useState(DEFAULT_MIN_PITCH);
  const [maxPitch, setMaxPitch] = useState(DEFAULT_MAX_PITCH);
  const [maxVolume, setMaxVolume] = useState(DEFAULT_MAX_VOLUME);
  const [volume, setVolume] = useState(null);
  const [pitch, setPitch] = useState(null);

  const canvasRef = useRef(null);

  const draw = (canvas) => {
    const [x, y] = getCoordsFromVolumeAndPitch(canvas, volume, pitch, {
      minPitch,
      maxPitch,
      maxVolume,
    });
    const ctx = canvas.getContext('2d')
    if (!shouldDraw)
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
    draw(canvasRef.current);
  }, [draw, volume, pitch, shouldDraw, minPitch, maxPitch, maxVolume])

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

  const handleChangeDrawMode = (event) => {
    setShouldDraw(event.target.checked);
  };

  const handleChangeMaxVolume = (event) => {
    setMaxVolume(event.target.value);
  };

  const handleChangeMinPitch = (event) => {
    setMinPitch(event.target.value);
  };

  const handleChangeMaxPitch = (event) => {
    setMaxPitch(event.target.value);
  };

  const displayPitch = pitch ? `${pitch.toFixed(2)} Hz` : '?';
  const displayVolume = volume ? `${volume.toFixed(2)}%` : '?';

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
          <label>
            Draw mode ✏️
            <input type="checkbox" checked={shouldDraw} onChange={handleChangeDrawMode} />
          </label>
        </section>
        <section>
          <label>
            Max. volume
            <input type="range" min="0.01" max="1" step="0.01" value={maxVolume} onChange={handleChangeMaxVolume} />
          </label>
        </section>
        <section>
          <label>
            Min. pitch
            <input type="range" min="0" max="500" step="10" value={minPitch} onChange={handleChangeMinPitch} />
          </label>
        </section>
        <section>
          <label>
            Max. pitch
            <input type="range" min="0" max="500" step="10" value={maxPitch} onChange={handleChangeMaxPitch} />
          </label>
        </section>

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
        main section {
          padding-top: 1rem;
        }
        main button {
          width: 10em;
          height: 2em;
          font-size: 2em;
        }
        main code {
          font-size: 4em;
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
