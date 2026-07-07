/* ═══════════════════════════════════════════════════════════════
   wm_rubbellos • script.js
   Reine Anzeige-Logik. Der Client kennt nur das Ergebnis, das der
   Server bereits entschieden hat – hier wird nichts "gewürfelt".
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const app        = document.getElementById('app');
const grid       = document.getElementById('grid');
const result     = document.getElementById('result');
const prizesEl   = document.getElementById('prizes-panel');
const prizesList = document.getElementById('prizes-list');

const RESOURCE = (window.GetParentResourceName && GetParentResourceName()) || 'wm_rubbellos';

let state = null;
let revealedCount = 0;
let resultShown = false;
let audioCtx = null;
let lastScratchSound = 0;

/* ───────────────────────── NUI Bridge ───────────────────────── */

function post(name, data = {}) {
    fetch(`https://${RESOURCE}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(data),
    }).catch(() => {});
}

window.addEventListener('message', ({ data }) => {
    if (data.action === 'show') open(data);
    if (data.action === 'hide') hide();
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') post(resultShown ? 'claim' : 'close');
});

/* ───────────────────────── Sounds (WebAudio, keine Dateien) ──── */

function ensureAudio() {
    if (!state?.config?.sounds) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function scratchSound(intensity = 0.5) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const now = performance.now();
    if (now - lastScratchSound < 35) return;
    lastScratchSound = now;

    const vol = 0.06 + Math.min(0.14, intensity * 0.18);
    const len = Math.floor(ctx.sampleRate * (0.04 + intensity * 0.03));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch  = buf.getChannelData(0);

    for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = (1 - t) * (1 - t);
        ch[i] = (Math.random() * 2 - 1) * vol * env;
    }

    const src = ctx.createBufferSource();
    const hp  = ctx.createBiquadFilter();
    const bp  = ctx.createBiquadFilter();
    const g   = ctx.createGain();

    hp.type = 'highpass';
    hp.frequency.value = 900 + intensity * 1400;
    bp.type = 'bandpass';
    bp.frequency.value = 2200 + intensity * 1800;
    bp.Q.value = 0.7;
    g.gain.value = 1;

    src.buffer = buf;
    src.connect(hp).connect(bp).connect(g).connect(ctx.destination);
    src.start();
}

function resultSound(win) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [220, 174.61];
    notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = win ? 'triangle' : 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.5);
        osc.connect(g).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.55);
    });
}

/* ───────────────────────── Öffnen / Schließen ────────────────── */

function open(data) {
    state = data;
    revealedCount = 0;
    resultShown = false;
    lastScratchSound = 0;

    applyLocale(data.config.locale);
    buildPrizesList(data.config.prizes, data.config.locale);

    document.getElementById('btn-reveal').classList.toggle('hidden', !data.config.revealAll);
    document.getElementById('btn-reveal').disabled = false;

    result.classList.add('hidden');
    prizesEl.classList.add('hidden');
    app.classList.remove('hidden');
    requestAnimationFrame(() => {
        buildGrid(data.fields);
        app.classList.add('visible');
    });
}

function hide() {
    app.classList.remove('visible');
    setTimeout(() => {
        app.classList.add('hidden');
        grid.innerHTML = '';
        state = null;
    }, 350);
}

function applyLocale(L) {
    document.getElementById('ui-title').textContent         = L.title;
    document.getElementById('ui-brand').textContent         = L.brand;
    document.getElementById('ui-sub').textContent           = L.subtitle;
    document.getElementById('ui-prizes-label').textContent  = L.prizesButton;
    document.getElementById('ui-prizes-header').textContent = L.prizesHeader;
    document.getElementById('ui-close-label').textContent = L.closeButton;
    document.getElementById('ui-continue-label').textContent = L.continueButton;
    document.getElementById('btn-reveal').textContent       = L.revealAll;
}

function buildPrizesList(prizes) {
    prizesList.innerHTML = '';
    prizes.forEach((p) => {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'plabel';
        label.textContent = p.label;
        const chance = document.createElement('span');
        chance.className = 'chance';
        chance.textContent = `${p.chance}%`;
        li.append(label, chance);
        prizesList.appendChild(li);
    });
}

/* ───────────────────────── Rubbelfelder ──────────────────────── */

function buildGrid(fields) {
    grid.innerHTML = '';
    fields.forEach((label, index) => {
        const field = document.createElement('div');
        field.className = 'field';
        if (index === 0) field.classList.add('hint-scratch');

        const value = document.createElement('div');
        value.className = 'field-value' + (label === 'NIETE' ? ' is-blank' : '');
        value.textContent = label;

        const progress = document.createElement('div');
        progress.className = 'field-progress';
        progress.innerHTML = '<span></span>';

        const dust = document.createElement('div');
        dust.className = 'scratch-dust';

        const canvas = document.createElement('canvas');

        field.append(value, progress, dust, canvas);
        grid.appendChild(field);

        initScratchLayer(field, canvas, dust, progress.querySelector('span'));
    });
}

/* Realistische Silber-Rubbelschicht (metallisch + holografisch) */
function paintScratchCoating(ctx, w, h) {
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#d4dce6');
    base.addColorStop(0.22, '#eef2f7');
    base.addColorStop(0.48, '#a8b4c4');
    base.addColorStop(0.72, '#e2e8f0');
    base.addColorStop(1, '#98a6b8');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // Holografische Streifen
    for (let i = 0; i < 9; i++) {
        const stripe = ctx.createLinearGradient(0, 0, w, h);
        const hue = 195 + i * 7;
        stripe.addColorStop(0, `hsla(${hue}, 72%, 68%, 0)`);
        stripe.addColorStop(0.45, `hsla(${hue + 18}, 80%, 74%, 0.16)`);
        stripe.addColorStop(1, `hsla(${hue + 32}, 70%, 62%, 0)`);
        ctx.save();
        ctx.translate(w * (0.08 + i * 0.1), h * 0.5);
        ctx.rotate(-0.55 + i * 0.08);
        ctx.fillStyle = stripe;
        ctx.fillRect(-w * 0.35, -h * 1.2, w * 0.12, h * 2.4);
        ctx.restore();
    }

    // Feine Kratzertextur
    for (let i = 0; i < 480; i++) {
        const alpha = 0.02 + Math.random() * 0.07;
        ctx.strokeStyle = Math.random() > 0.5
            ? `rgba(255,255,255,${alpha})`
            : `rgba(30,48,68,${alpha * 0.9})`;
        ctx.lineWidth = 0.4 + Math.random() * 1.1;
        ctx.beginPath();
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 6);
        ctx.stroke();
    }

    // Fragezeichen-Muster wie echtes Rubbellos
    ctx.save();
    ctx.fillStyle = 'rgba(22, 140, 255, 0.14)';
    ctx.font = `700 ${Math.floor(h * 0.18)}px 'Chakra Petch', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cols = 5;
    const rows = 3;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = (col + 0.5) * (w / cols);
            const y = (row + 0.5) * (h / rows);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((Math.random() - 0.5) * 0.35);
            ctx.fillText('?', 0, 0);
            ctx.restore();
        }
    }
    ctx.restore();

    // Mittiges Wasserzeichen
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.08);
    ctx.font = `700 ${Math.floor(h * 0.38)}px 'Chakra Petch', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(22, 140, 255, 0.12)';
    ctx.fillText('RL', 0, 0);
    ctx.restore();

    // Glanz-Highlight oben
    const shine = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    shine.addColorStop(0, 'rgba(255,255,255,0.42)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, w, h * 0.55);
}

function spawnDust(dustLayer, x, y, intensity, fieldRect) {
    const count = 1 + Math.floor(intensity * 3);
    for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.className = 'dust-particle';
        const size = 2 + Math.random() * 4;
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.left = `${x + (Math.random() - 0.5) * 18}px`;
        p.style.top = `${y + (Math.random() - 0.5) * 18}px`;
        p.style.setProperty('--dx', `${(Math.random() - 0.5) * 36}px`);
        p.style.setProperty('--dy', `${-8 - Math.random() * 28}px`);
        p.style.setProperty('--dur', `${0.35 + Math.random() * 0.35}s`);
        dustLayer.appendChild(p);
        p.addEventListener('animationend', () => p.remove(), { once: true });
    }

    while (dustLayer.children.length > 48) {
        dustLayer.firstChild.remove();
    }
}

function initScratchLayer(field, canvas, dustLayer, progressBar) {
    const rect = field.getBoundingClientRect();
    const width = rect.width || field.clientWidth || 260;
    const height = rect.height || field.clientHeight || 160;
    const scale = window.devicePixelRatio || 1;
    canvas.width  = Math.max(2, Math.floor(width * scale));
    canvas.height = Math.max(2, Math.floor(height * scale));

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    paintScratchCoating(ctx, canvas.width, canvas.height);

    let scratching = false;
    let last = null;
    let checkQueued = false;
    let scratchMoves = 0;
    const brush = canvas.width * 0.038;
    const minMoves = 18;

    const toCanvas = (e) => {
        const r = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvas.width / r.width),
            y: (e.clientY - r.top) * (canvas.height / r.height),
        };
    };

    const stampSoft = (x, y, size, alpha = 1) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, size);
        g.addColorStop(0, `rgba(0,0,0,${alpha})`);
        g.addColorStop(0.45, `rgba(0,0,0,${alpha * 0.85})`);
        g.addColorStop(0.75, `rgba(0,0,0,${alpha * 0.35})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    };

    const erase = (p, intensity = 0.5) => {
        ctx.globalCompositeOperation = 'destination-out';

        if (last) {
            const dist = Math.hypot(p.x - last.x, p.y - last.y);
            const steps = Math.max(1, Math.ceil(dist / (brush * 0.28)));
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const x = last.x + (p.x - last.x) * t;
                const y = last.y + (p.y - last.y) * t;
                stampSoft(x, y, brush * (0.85 + intensity * 0.08), 0.92);
            }
        } else {
            stampSoft(p.x, p.y, brush * 0.9, 1);
        }

        last = p;
        scratchMoves++;
        field.classList.remove('hint-scratch');
        field.classList.add('scratching');

        const r = canvas.getBoundingClientRect();
        spawnDust(
            dustLayer,
            (p.x / canvas.width) * r.width,
            (p.y / canvas.height) * r.height,
            intensity,
        );

        if (!checkQueued) {
            checkQueued = true;
            requestAnimationFrame(() => {
                checkQueued = false;
                checkProgress(field, canvas, ctx, progressBar, scratchMoves, minMoves);
            });
        }
    };

    canvas.addEventListener('pointerdown', (e) => {
        if (resultShown) return;
        scratching = true;
        last = null;
        canvas.setPointerCapture(e.pointerId);
        erase(toCanvas(e), 0.7);
        scratchSound(0.7);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!scratching || resultShown) return;
        const point = toCanvas(e);
        const intensity = last
            ? Math.min(1, Math.hypot(point.x - last.x, point.y - last.y) / (brush * 1.8))
            : 0.4;
        erase(point, intensity);
        if (intensity > 0.15) scratchSound(intensity);
    });

    const stop = () => {
        scratching = false;
        last = null;
        field.classList.remove('scratching');
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', () => { last = null; });
}

function checkProgress(field, canvas, ctx, progressBar, scratchMoves, minMoves) {
    if (field.classList.contains('revealed')) return;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    let total = 0;
    const step = 4 * 8;

    for (let i = 3; i < data.length; i += step) {
        total++;
        if (data[i] < 24) clear++;
    }

    const pct = (clear / total) * 100;
    if (progressBar) progressBar.style.width = `${Math.min(100, pct)}%`;

    if (scratchMoves < minMoves) return;
    if (pct >= state.config.threshold) revealField(field);
}

function revealField(field) {
    if (field.classList.contains('revealed')) return;
    field.classList.add('revealed', 'revealing');
    revealedCount++;

    const canvas = field.querySelector('canvas');
    if (canvas) {
        canvas.style.transition = 'opacity 0.45s ease';
        canvas.style.opacity = '0';
        setTimeout(() => {
            canvas.style.pointerEvents = 'none';
        }, 460);
    }

    setTimeout(() => field.classList.remove('revealing'), 500);

    if (revealedCount >= 6) {
        setTimeout(showResult, 800);
    }
}

/* ───────────────────────── Ergebnis ──────────────────────────── */

function showResult() {
    if (resultShown || !state) return;
    resultShown = true;

    const L = state.config.locale;
    const win = state.win;

    result.classList.toggle('win', win);
    document.getElementById('result-emoji').textContent   = win ? '🤑' : '😞';
    document.getElementById('result-tagline').textContent = win ? L.winTagline : L.loseTagline;
    document.getElementById('result-title').textContent   = win ? L.winTitle : L.loseTitle;
    document.getElementById('result-sub').textContent     = win
        ? L.winSub.replace('%s', state.label)
        : L.loseSub;

    document.getElementById('btn-reveal').disabled = true;
    result.classList.remove('hidden');
    resultSound(win);
}

/* ───────────────────────── Buttons ───────────────────────────── */

document.getElementById('btn-reveal').addEventListener('click', () => {
    if (resultShown) return;
    document.querySelectorAll('.field').forEach((f, i) => {
        setTimeout(() => revealField(f), i * 90);
    });
});

document.getElementById('btn-close').addEventListener('click', () => {
    post(resultShown ? 'claim' : 'close');
});

document.getElementById('btn-continue').addEventListener('click', () => post('claim'));

document.getElementById('btn-prizes').addEventListener('click', () => {
    prizesEl.classList.toggle('hidden');
});
