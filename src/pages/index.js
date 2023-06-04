import { useState, useEffect, useRef } from 'react';

import Head from 'next/head';

import styles from '../styles/Home.module.css';
import { getInputStream, getAudioContext, connect } from '../lib/audio';
import { fromIntPercentage, toIntPercentage } from '../lib/percentage';

const DEFAULT_MAX_VOLUME = 0.25;
const DEFAULT_MIN_PITCH = 80;
const DEFAULT_MAX_PITCH = 255;
const TARGET_X_TOLERANCE_PX = 25;
const TARGET_Y_TOLERANCE_PX = 25;
const CANVAS_WIDTH_PX = 600;
const CANVAS_HEIGHT_PX = 400;

const getCoordsFromVolumeAndPitch = (volume, pitch, config) => {
  const { minPitch, maxPitch, maxVolume } = config;
  // `volume` is sort of scaled from 0.00-1.00, but in practice it seems very difficult to get
  // higher than ~0.4, so scale it
  const clampedVolume = Math.min(maxVolume, volume);
  const scaledVolume = clampedVolume / maxVolume;
  const x = scaledVolume * (CANVAS_WIDTH_PX - 1);

  // `pitch` is a frequency in hertz, so scale it to a typical human vocal range
  const clampedPitch = Math.min(maxPitch, Math.max(pitch, minPitch));
  const scaledPitch = Math.max(0, clampedPitch - minPitch) / (maxPitch - minPitch);
  const y = scaledPitch * (CANVAS_HEIGHT_PX - 1);

  return [x, y];
}

const getRandomTarget = (config) => {
  const { minPitch, maxPitch, maxVolume } = config;
  return {
    pitch: minPitch + Math.random() * (maxPitch - minPitch),
    volume: Math.random() * maxVolume,
  };
}

export default function Home() {
  const [isActive, setIsActive] = useState(false);
  const [drawModeEnabled, setDrawModeEnabled] = useState(false);
  const [targetModeEnabled, setTargetModeEnabled] = useState(false);
  const [target, setTarget] = useState(null);
  const [minPitch, setMinPitch] = useState(DEFAULT_MIN_PITCH);
  const [maxPitch, setMaxPitch] = useState(DEFAULT_MAX_PITCH);
  const [maxVolume, setMaxVolume] = useState(DEFAULT_MAX_VOLUME);
  const [volume, setVolume] = useState(null);
  const [pitch, setPitch] = useState(null);

  const canvasRef = useRef(null);
  // TODO consider refactoring - seems a bit vague
  const config = {
    minPitch,
    maxPitch,
    maxVolume,
  };

  const draw = (canvas) => {
    const ctx = canvas.getContext('2d')

    if (!drawModeEnabled)
      ctx.reset();

    if (volume != null && pitch != null) {
      const [x, y] = getCoordsFromVolumeAndPitch(volume, pitch, config);
      drawCursor(ctx, x, y);
    }

    if (targetModeEnabled) {
      const [x, y] = getCoordsFromVolumeAndPitch(target.volume, target.pitch, config);
      drawTarget(ctx, x, y);
    }
  }

  const drawCursor = (ctx, x, y) => {
    // TODO making this larger than 1px makes it slightly off, since we aren't calculating
    // an offset, just starting at these coords. Offset it if we want to be really precise.
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI, true);
    ctx.strokeStyle = 'blue';
    ctx.stroke();
    ctx.fillStyle = 'blue';
    ctx.fill();
  }

  const drawTarget = (ctx, x, y) => {
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎯', x, y);
  };

  const verifyTargetCollision = (target, pitch, volume) => {
    const [x, y] = getCoordsFromVolumeAndPitch(volume, pitch, config);
    const [targetX, targetY] = getCoordsFromVolumeAndPitch(target.volume, target.pitch, config);
    if (
      Math.abs(targetX - x) < TARGET_X_TOLERANCE_PX
      && Math.abs(targetY - y) < TARGET_Y_TOLERANCE_PX
    ) {
      window.alert('You win!');
      setTargetModeEnabled(false);
    }
  }

  useEffect(() => {
    draw(canvasRef.current);
  }, [draw, volume, pitch, drawModeEnabled, targetModeEnabled, minPitch, maxPitch, maxVolume])

  const handleReadVolume = (newVolume) => {
    // Always keep most recent value, don't overwrite with null
    if (newVolume != null)
      setVolume(newVolume);
  }

  const handleReadPitch = (newPitch) => {
    // Always keep most recent value, don't overwrite with null
    if (newPitch != null)
      setPitch(newPitch);
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
    setDrawModeEnabled(event.target.checked);
  };

  const handleChangeTargetMode = (event) => {
    const enabled = event.target.checked;
    if (enabled) {
      setTarget(getRandomTarget(config));
    }
    setTargetModeEnabled(enabled);
  };

  const handleChangeMaxVolume = (event) => {
    // UI uses percentage for user convenience, but we manipulate 0.00-1.00
    const volume = fromIntPercentage(event.target.value);
    setMaxVolume(volume.valueOf());
  };

  const handleChangeMinPitch = (event) => {
    setMinPitch(event.target.value);
  };

  const handleChangeMaxPitch = (event) => {
    setMaxPitch(event.target.value);
  };

  if (targetModeEnabled && volume != null && pitch != null)
    verifyTargetCollision(target, pitch, volume);

  const displayPitch = pitch ? `${pitch.toFixed(2)} Hz` : '?';
  const displayVolume = volume ? `${toIntPercentage(volume).toFixed(0)}%` : '?';

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
            <input type="checkbox" checked={drawModeEnabled} onChange={handleChangeDrawMode} />
          </label>
          <label>
            Target mode 🎯
            <input type="checkbox" checked={targetModeEnabled} onChange={handleChangeTargetMode} />
          </label>
        </section>
        <section>
          <label>
            Max. volume
            {/* Render as percentage, manipulate as 0.00-1.00 */}
            <input type="range" min="1" max="100" step="1" value={toIntPercentage(maxVolume)} onChange={handleChangeMaxVolume} />
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

          <canvas ref={canvasRef} width={CANVAS_WIDTH_PX} height={CANVAS_HEIGHT_PX}></canvas>
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
