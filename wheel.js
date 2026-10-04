// The wheel: a huge disc whose centre sits above the top of the screen, so
// only the lower rim and a few slices are visible. Grab it to spin it; it
// coasts with friction and ticks each time a slice passes the pointer.

const TAU = Math.PI * 2;
const POINTER_ANGLE = Math.PI / 2; // straight down from the centre
const BAND = 56; // depth of the label band at the rim
const FONT = '300 13px ui-monospace, "SF Mono", Menlo, monospace';

// Coasting: v' = -v/TAU_S - DECEL·sign(v)  (rad/s)
const TAU_S = 2.4;
const DECEL = 0.35;
const MAX_V = 22;
const STOP_V = 0.03;

export function createWheel(canvas) {
  const ctx = canvas.getContext('2d');
  const ticker = createTicker();

  let slices = [];
  let w = 0, h = 0, cx = 0, cy = 0, R = 0;
  let rot = 0;           // wheel rotation (rad, clockwise)
  let vel = 0;           // rad/s while coasting
  let drag = null;       // { lastAngle, samples: [{t, rot}] }
  let lastIndex = null;
  let settled = 1;       // 0..1 highlight of the slice under the pointer
  let raf = 0, lastFrame = 0;

  const unit = () => TAU / slices.length;
  const indexAtPointer = () =>
    Math.floor((((POINTER_ANGLE - rot) % TAU) + TAU) % TAU / unit()) % slices.length;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bottom = h * 0.5;
    R = Math.max(bottom * 1.4, w * 1.05);
    cx = w / 2;
    cy = bottom - R;
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    if (!slices.length) return;
    const u = unit();
    const sel = indexAtPointer();
    const labelR = R - BAND / 2;
    const maxText = 2 * labelR * Math.sin(u / 2) - 18;

    ctx.save();
    ctx.translate(cx, cy);

    for (let i = 0; i < slices.length; i++) {
      const a0 = rot + i * u;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0, a0 + u);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#f3f3f1' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // the chosen slice: only its label band, between hairline and rim, inverts
      if (i === sel && settled > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, R, a0, a0 + u);
        ctx.arc(0, 0, R - BAND, a0 + u, a0, true);
        ctx.closePath();
        ctx.fillStyle = `rgba(17,17,17,${settled})`;
        ctx.fill();
      }
    }

    // inner hairline ring and the rim
    ctx.beginPath();
    ctx.arc(0, 0, R - BAND, 0, TAU);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    // labels, written along the rim, upright when at the bottom
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < slices.length; i++) {
      if (!slices[i]) continue;
      const mid = rot + (i + 0.5) * u;
      ctx.save();
      ctx.rotate(mid - Math.PI / 2);
      const t = Math.round(i === sel ? settled * 255 : 0);
      ctx.fillStyle = i === sel && settled > 0 ? `rgb(${t},${t},${t})` : '#111';
      ctx.fillText(fit(slices[i], maxText), 0, labelR);
      ctx.restore();
    }
    ctx.restore();

    // pointer
    const tip = cy + R + 4;
    ctx.beginPath();
    ctx.moveTo(cx, tip);
    ctx.lineTo(cx - 6, tip + 11);
    ctx.lineTo(cx + 6, tip + 11);
    ctx.closePath();
    ctx.fillStyle = '#111';
    ctx.fill();
  }

  const fitCache = new Map();
  function fit(text, max) {
    const key = text + '|' + Math.round(max);
    if (fitCache.has(key)) return fitCache.get(key);
    let out = text;
    if (ctx.measureText(out).width > max) {
      while (out.length > 1 && ctx.measureText(out + '…').width > max) out = out.slice(0, -1);
      out = out.trimEnd() + '…';
    }
    fitCache.set(key, out);
    return out;
  }

  function checkTick() {
    const i = indexAtPointer();
    if (lastIndex !== null && i !== lastIndex) ticker.tick();
    lastIndex = i;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    let busy = false;

    if (!drag && vel !== 0) {
      rot += vel * dt;
      const decay = vel / TAU_S + DECEL * Math.sign(vel);
      const next = vel - decay * dt;
      vel = Math.abs(next) < STOP_V || Math.sign(next) !== Math.sign(vel) ? 0 : next;
      checkTick();
      busy = true;
    }
    const resting = !drag && vel === 0;
    if (resting && settled < 1) {
      settled = Math.min(1, settled + dt / 0.5);
      busy = true;
    }
    draw();
    raf = busy ? requestAnimationFrame(frame) : 0;
  }

  function animate() {
    if (!raf) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  const angleOf = (e) => Math.atan2(e.clientY - cy, e.clientX - cx);

  canvas.addEventListener('pointerdown', (e) => {
    if (!slices.length || Math.hypot(e.clientX - cx, e.clientY - cy) > R) return;
    ticker.unlock();
    canvas.setPointerCapture(e.pointerId);
    vel = 0;
    settled = 0;
    drag = { lastAngle: angleOf(e), samples: [{ t: e.timeStamp, rot }] };
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const a = angleOf(e);
    let d = a - drag.lastAngle;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    drag.lastAngle = a;
    rot += d;
    drag.samples.push({ t: e.timeStamp, rot });
    while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 100) drag.samples.shift();
    checkTick();
    draw();
  });

  function release(e) {
    if (!drag) return;
    const s = drag.samples;
    const first = s[0], last = s[s.length - 1];
    const dt = (last.t - first.t) / 1000;
    // a finger that stopped before lifting shouldn't fling the wheel
    const stale = e.timeStamp - last.t > 60;
    vel = dt > 0 && !stale ? (last.rot - first.rot) / dt : 0;
    vel = Math.max(-MAX_V, Math.min(MAX_V, vel));
    if (Math.abs(vel) < STOP_V) vel = 0;
    drag = null;
    rot %= TAU;
    animate();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  new ResizeObserver(resize).observe(canvas);

  return {
    setSlices(next) {
      // first fill: rest with the pointer in the middle of a random slice
      if (!slices.length && next.length) {
        rot = POINTER_ANGLE - (Math.floor(Math.random() * next.length) + 0.5) * (TAU / next.length);
      }
      slices = next;
      fitCache.clear();
      lastIndex = slices.length ? indexAtPointer() : null;
      draw();
    },
  };
}

// A short, soft wooden tick synthesised once and replayed.
function createTicker() {
  let ac, buffer, last = 0;

  return {
    // Audio can only start inside a user gesture on iOS.
    unlock() {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const len = Math.floor(ac.sampleRate * 0.03);
        buffer = ac.createBuffer(1, len, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const t = i / ac.sampleRate;
          const env = Math.exp(-t / 0.0035);
          data[i] = env * (0.55 * Math.sin(TAU * 1900 * t) + 0.45 * (Math.random() * 2 - 1));
        }
      }
      if (ac.state !== 'running') ac.resume();
    },
    tick() {
      if (!ac || ac.state !== 'running') return;
      const now = ac.currentTime;
      if (now - last < 0.028) return; // too fast to hear individually
      last = now;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const gain = ac.createGain();
      gain.gain.value = 0.32;
      src.connect(gain).connect(ac.destination);
      src.start();
    },
  };
}
