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
    buildPrizesList(data.config.prizes);
    document.getElementById('card-serial').textContent =
        'Nr. ' + String(Math.floor(Math.random() * 9000000) + 1000000);

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
    document.getElementById('ui-title').textContent          = L.title;
    document.getElementById('ui-brand').textContent          = L.brand;
    document.getElementById('ui-sub').textContent            = L.subtitle;
    if (document.getElementById('ui-rules')) {
        document.getElementById('ui-rules').textContent = L.rules;
    }
    document.getElementById('ui-prizes-label').textContent   = L.prizesButton;
    document.getElementById('ui-prizes-header').textContent  = L.prizesHeader;
    document.getElementById('ui-close-label').textContent  = L.closeButton;
    document.getElementById('ui-continue-label').textContent = L.continueButton;
    document.getElementById('btn-reveal').textContent        = L.revealAll;
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
        let valueClass = 'field-value';
        if (label === 'NIETE') valueClass += ' is-blank';
        else if (label === 'JACKPOT') valueClass += ' is-jackpot';
        value.className = valueClass;
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

/* Silber-Rubbelschicht wie auf echten Rubbelkarten */
function paintScratchCoating(ctx, w, h) {
    const base = ctx.createLinearGradient(0, 0, w * 0.3, h);
    base.addColorStop(0, '#d8dfe6');
    base.addColorStop(0.4, '#eef2f6');
    base.addColorStop(0.6, '#b8c4d0');
    base.addColorStop(1, '#a8b4c0');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 400; i++) {
        const alpha = 0.04 + Math.random() * 0.1;
        ctx.strokeStyle = Math.random() > 0.5
            ? `rgba(255,255,255,${alpha})`
            : `rgba(40,55,70,${alpha * 0.8})`;
        ctx.lineWidth = 0.3 + Math.random() * 0.8;
        ctx.beginPath();
        const x = Math.random() * w;
        const y = Math.random() * h;
        const len = 3 + Math.random() * 12;
        const ang = Math.random() * Math.PI;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(80, 95, 110, 0.1)';
    ctx.font = `700 ${Math.floor(h * 0.14)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
            ctx.fillText('?', (col + 0.5) * (w / 4), (row + 0.5) * (h / 2));
        }
    }
    ctx.restore();

    const shine = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    shine.addColorStop(0, 'rgba(255,255,255,0.4)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, w, h * 0.45);
}

/* Text-Zone in der Mitte des Feldes (wo der Gewinn steht) */
function getTextZone(canvas) {
    return {
        x: Math.floor(canvas.width * 0.12),
        y: Math.floor(canvas.height * 0.18),
        w: Math.floor(canvas.width * 0.76),
        h: Math.floor(canvas.height * 0.64),
    };
}

/* Einzelner Kratz-Strich wie mit Münzkante */
function scratchSegment(ctx, from, to, coinW, pressure) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.3) return;

    const angle = Math.atan2(dy, dx);
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const w = coinW * (0.85 + pressure * 0.2);

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Hauptfurche – harte Kante, kein weicher Kreis
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Seitliche Mikro-Kratzer von der Münzkante
    const offsets = [-w * 0.55, w * 0.55];
    ctx.lineWidth = w * 0.28;
    ctx.globalAlpha = 0.9;
    for (const off of offsets) {
        const jx = (Math.random() - 0.5) * w * 0.12;
        const jy = (Math.random() - 0.5) * w * 0.12;
        ctx.beginPath();
        ctx.moveTo(from.x + perpX * off + jx, from.y + perpY * off + jy);
        ctx.lineTo(to.x + perpX * off - jx, to.y + perpY * off - jy);
        ctx.stroke();
    }

    ctx.restore();
}

/* Erster Kontakt: kleine harte Kratzmarke statt Kreis */
function scratchDot(ctx, x, y, coinW) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const w = coinW * 0.7;
    const h = coinW * 0.25;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function spawnDust(dustLayer, x, y, intensity, angle) {
    const count = 1 + Math.floor(intensity * 4);
    const perpX = angle != null ? Math.cos(angle) : (Math.random() - 0.5);
    const perpY = angle != null ? Math.sin(angle) : -0.8;

    for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.className = 'dust-particle';
        const w = 1.5 + Math.random() * 3;
        const h = 1 + Math.random() * 2;
        p.style.width = `${w}px`;
        p.style.height = `${h}px`;
        p.style.borderRadius = '1px';
        p.style.left = `${x + (Math.random() - 0.5) * 10}px`;
        p.style.top = `${y + (Math.random() - 0.5) * 10}px`;
        const spread = 20 + Math.random() * 24;
        p.style.setProperty('--dx', `${perpX * spread + (Math.random() - 0.5) * 12}px`);
        p.style.setProperty('--dy', `${perpY * spread - 6 - Math.random() * 16}px`);
        p.style.setProperty('--dur', `${0.25 + Math.random() * 0.3}s`);
        dustLayer.appendChild(p);
        p.addEventListener('animationend', () => p.remove(), { once: true });
    }

    while (dustLayer.children.length > 56) {
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
    const coinW = Math.max(3, canvas.width * 0.016);
    const minMoves = 8;

    const toCanvas = (e) => {
        const r = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvas.width / r.width),
            y: (e.clientY - r.top) * (canvas.height / r.height),
        };
    };

    const erase = (p, intensity = 0.5) => {
        if (last) {
            const dx = p.x - last.x;
            const dy = p.y - last.y;
            const dist = Math.hypot(dx, dy);
            const steps = Math.max(1, Math.ceil(dist / 1.8));

            for (let i = 1; i <= steps; i++) {
                const t0 = (i - 1) / steps;
                const t1 = i / steps;
                const from = { x: last.x + dx * t0, y: last.y + dy * t0 };
                const to   = { x: last.x + dx * t1, y: last.y + dy * t1 };
                scratchSegment(ctx, from, to, coinW, intensity);
            }
        } else {
            scratchDot(ctx, p.x, p.y, coinW);
        }

        const scratchAngle = last
            ? Math.atan2(p.y - last.y, p.x - last.x) + Math.PI / 2
            : null;

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
            scratchAngle,
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
            ? Math.min(1, Math.hypot(point.x - last.x, point.y - last.y) / (coinW * 3))
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

    const zone = getTextZone(canvas);
    const data = ctx.getImageData(zone.x, zone.y, zone.w, zone.h).data;
    let clear = 0;
    let total = 0;
    const step = 4 * 3;

    for (let i = 3; i < data.length; i += step) {
        total++;
        if (data[i] < 40) clear++;
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
