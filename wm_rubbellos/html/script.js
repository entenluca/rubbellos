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

let state = null;      // aktuelle Runde (win, label, fields, config)
let revealedCount = 0;
let resultShown = false;
let audioCtx = null;

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

/* ESC schließt die UI */
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') post(resultShown ? 'claim' : 'close');
});

/* ───────────────────────── Sounds (WebAudio, keine Dateien) ──── */

function ensureAudio() {
    if (!state?.config?.sounds) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

/* kurzes Kratz-Rauschen */
function scratchSound() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const len = ctx.sampleRate * 0.05;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch  = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * 0.12;

    const src = ctx.createBufferSource();
    const flt = ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 1800;
    src.buffer = buf;
    src.connect(flt).connect(ctx.destination);
    src.start();
}

/* Ergebnis-Sound: Dur-Arpeggio bei Gewinn, tiefer Ton bei Niete */
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
    document.getElementById('ui-title').textContent        = L.title;
    document.getElementById('ui-brand').textContent        = L.brand;
    document.getElementById('ui-sub').textContent          = L.subtitle;
    document.getElementById('ui-prizes-label').textContent = L.prizesButton;
    document.getElementById('ui-prizes-header').textContent= L.prizesHeader;
    document.getElementById('ui-close-label').textContent  = L.closeButton;
    document.getElementById('ui-continue-label').textContent = L.continueButton;
    document.getElementById('btn-reveal').textContent      = L.revealAll;
}

function buildPrizesList(prizes, L) {
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
    fields.forEach((label) => {
        const field = document.createElement('div');
        field.className = 'field';

        const value = document.createElement('div');
        value.className = 'field-value' + (label === 'NIETE' ? ' is-blank' : '');
        value.textContent = label;

        const canvas = document.createElement('canvas');

        field.append(value, canvas);
        grid.appendChild(field);

        initScratchLayer(field, canvas);
    });
}

/* Papiertextur prozedural zeichnen (kein Bild nötig) */
function paintPaper(ctx, w, h) {
    // Grundfarbe mit leichtem Verlauf
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#f4efe3');
    grad.addColorStop(1, '#d9cfb7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Knitterfalten: zufällige halbtransparente Linien
    for (let i = 0; i < 22; i++) {
        ctx.beginPath();
        const x1 = Math.random() * w, y1 = Math.random() * h;
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(
            x1 + (Math.random() - 0.5) * w * 0.7,
            y1 + (Math.random() - 0.5) * h * 0.7,
            Math.random() * w, Math.random() * h
        );
        ctx.strokeStyle = Math.random() > 0.5
            ? 'rgba(40,72,92,0.10)'
            : 'rgba(255,255,255,0.30)';
        ctx.lineWidth = 0.8 + Math.random() * 1.4;
        ctx.stroke();
    }

    // feine Sprenkel
    for (let i = 0; i < 320; i++) {
        ctx.fillStyle = `rgba(22,54,78,${0.025 + Math.random() * 0.055})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }

    // dezentes Casino-Wasserzeichen mittig
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.08);
    ctx.font = `700 ${Math.floor(h * 0.42)}px 'Chakra Petch', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(22,140,255,0.18)';
    ctx.fillText('RL', 0, 0);
    ctx.restore();
}

function initScratchLayer(field, canvas) {
    // Canvas in echter Feldauflösung rendern (scharfe Textur)
    const rect = field.getBoundingClientRect();
    const width = rect.width || field.clientWidth || 260;
    const height = rect.height || field.clientHeight || 160;
    const scale = window.devicePixelRatio || 1;
    canvas.width  = Math.max(2, Math.floor(width * scale));
    canvas.height = Math.max(2, Math.floor(height * scale));

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    paintPaper(ctx, canvas.width, canvas.height);

    let scratching = false;
    let last = null;
    let checkQueued = false;
    const brush = canvas.width * 0.075; // Radiergröße relativ zur Feldbreite

    const toCanvas = (e) => {
        const r = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvas.width / r.width),
            y: (e.clientY - r.top) * (canvas.height / r.height),
        };
    };

    const erase = (p) => {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineCap = 'round';
        ctx.lineWidth = brush * 2;
        ctx.beginPath();
        if (last) {
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }
        ctx.arc(p.x, p.y, brush, 0, Math.PI * 2);
        ctx.fill();
        last = p;

        if (!checkQueued) {           // Fortschritt gedrosselt prüfen
            checkQueued = true;
            setTimeout(() => {
                checkQueued = false;
                checkProgress(field, canvas, ctx);
            }, 120);
        }
    };

    canvas.addEventListener('pointerdown', (e) => {
        if (resultShown) return;
        scratching = true;
        last = null;
        canvas.setPointerCapture(e.pointerId);
        erase(toCanvas(e));
        scratchSound();
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!scratching || resultShown) return;
        erase(toCanvas(e));
        if (Math.random() < 0.2) scratchSound();
    });

    const stop = () => { scratching = false; last = null; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', () => { last = null; });
}

/* Anteil der freigerubbelten Pixel bestimmen (gesampelt) */
function checkProgress(field, canvas, ctx) {
    if (field.classList.contains('revealed')) return;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0, total = 0;
    for (let i = 3; i < data.length; i += 4 * 16) { // jedes 16. Pixel reicht
        total++;
        if (data[i] === 0) clear++;
    }

    const pct = (clear / total) * 100;
    if (pct >= state.config.threshold) revealField(field);
}

function revealField(field) {
    if (field.classList.contains('revealed')) return;
    field.classList.add('revealed');
    revealedCount++;

    if (revealedCount >= 6) {
        setTimeout(showResult, 650); // kurzer Moment, um die Felder zu sehen
    }
}

/* ───────────────────────── Ergebnis ──────────────────────────── */

function showResult() {
    if (resultShown || !state) return;
    resultShown = true;

    const L = state.config.locale;
    const win = state.win;

    result.classList.toggle('win', win);
    document.getElementById('result-emoji').textContent  = win ? '🤑' : '😞';
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
        setTimeout(() => revealField(f), i * 90); // gestaffeltes Aufdecken
    });
});

document.getElementById('btn-close').addEventListener('click', () => {
    // Auch beim vorzeitigen Schließen wird serverseitig eingelöst,
    // damit das bereits verbrauchte Los nicht verfällt.
    post(resultShown ? 'claim' : 'close');
});

document.getElementById('btn-continue').addEventListener('click', () => post('claim'));

document.getElementById('btn-prizes').addEventListener('click', () => {
    prizesEl.classList.toggle('hidden');
});
