/* -------------------------------------------------------------
 * VIRTUAL TAWAF LIVE 2D - LOGIKA UTAMA & PERSISTENSI DATA
 * ------------------------------------------------------------- */

// --- INIALISASI SYSTEM & STATE ---
const canvas = document.getElementById('tawafCanvas');
const ctx = canvas.getContext('2d');
const CENTER_X = 540;
const CENTER_Y = 960;
const TAWAF_MIN_RADIUS = 160;
const TAWAF_MAX_RADIUS = 420;
const FENCE_Y = 1680;
const QUEUE_AREA_MIN_X = 200;
const QUEUE_AREA_MAX_X = 880;
const QUEUE_AREA_MIN_Y = 1730;
const QUEUE_AREA_MAX_Y = 1860;

// Config & Settings State
let globalSettings = {
    speedMultiplier: 1.0,
    sizeScale: 1.0,
    volume: 0.8,
    isPaused: false,
    kaabaScale: 1.0,
    kaabaOffsetY: 0
};

let users = [];
let totalLapsAllUsers = 0;
let completedCountStat = 0;

// Background & Kaaba Assets
let bgImage = new Image();
let customBgLoaded = false;

let kaabaImage = new Image();
let customKaabaLoaded = false;

// Audio State
let audioElement = new Audio();
audioElement.loop = true;
let isAudioPlaying = false;

// IndexedDB for files storage
const DB_NAME = "VirtualTawafDB_v2";
let dbInstance = null;

// Catch unhandled promises globally
window.addEventListener('unhandledrejection', function(event) {
    console.warn('Unhandled promise rejection captured and handled:', event.reason);
    event.preventDefault();
});

function initDB() {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                try {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('files')) {
                        db.createObjectStore('files');
                    }
                } catch (err) {
                    console.warn("IndexedDB upgrade error:", err);
                }
            };
            request.onsuccess = (e) => {
                dbInstance = e.target.result;
                resolve(dbInstance);
            };
            request.onerror = (e) => {
                console.warn("IndexedDB open error:", e);
                resolve(null);
            };
        } catch (e) {
            console.warn("IndexedDB init catch:", e);
            resolve(null);
        }
    });
}

async function saveFileToDB(key, data) {
    try {
        if (!dbInstance) await initDB();
        if (!dbInstance) return;
        return new Promise((resolve) => {
            try {
                const tx = dbInstance.transaction('files', 'readwrite');
                const store = tx.objectStore('files');
                const req = store.put(data, key);
                req.onsuccess = () => resolve();
                req.onerror = (err) => {
                    console.warn("IndexedDB Put Error:", err);
                    resolve();
                };
                tx.oncomplete = () => resolve();
                tx.onerror = (err) => {
                    console.warn("Transaction Error:", err);
                    resolve();
                };
            } catch (e) {
                console.warn("Transaction exception:", e);
                resolve();
            }
        });
    } catch (err) {
        console.warn("saveFileToDB outer error:", err);
    }
}

async function getFileFromDB(key) {
    try {
        if (!dbInstance) await initDB();
        if (!dbInstance) return null;
        return new Promise((resolve) => {
            try {
                const tx = dbInstance.transaction('files', 'readonly');
                const store = tx.objectStore('files');
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = (err) => {
                    console.warn("IndexedDB Get Error:", err);
                    resolve(null);
                };
            } catch (e) {
                console.warn("Transaction get exception:", e);
                resolve(null);
            }
        });
    } catch (err) {
        console.warn("getFileFromDB outer error:", err);
        return null;
    }
}

function saveStateToStorage() {
    try {
        localStorage.setItem('vt_settings', JSON.stringify(globalSettings));
        localStorage.setItem('vt_users', JSON.stringify(users));
        localStorage.setItem('vt_total_laps', totalLapsAllUsers.toString());
        localStorage.setItem('vt_completed_count', completedCountStat.toString());
    } catch (e) {
        console.warn("Failed to save state to localStorage:", e);
    }
}

async function loadStateFromStorage() {
    try {
        const savedSettings = localStorage.getItem('vt_settings');
        if (savedSettings) {
            globalSettings = { ...globalSettings, ...JSON.parse(savedSettings) };
            if (document.getElementById('slider-speed')) {
                document.getElementById('slider-speed').value = globalSettings.speedMultiplier;
                document.getElementById('val-speed-multiplier').innerText = globalSettings.speedMultiplier.toFixed(1) + 'x';
                document.getElementById('slider-size').value = globalSettings.sizeScale * 100;
                document.getElementById('val-size-scale').innerText = Math.round(globalSettings.sizeScale * 100) + '%';
                document.getElementById('slider-volume').value = globalSettings.volume * 100;
                document.getElementById('val-sound-vol').innerText = Math.round(globalSettings.volume * 100) + '%';
                document.getElementById('slider-kaaba-scale').value = globalSettings.kaabaScale * 100;
                document.getElementById('slider-kaaba-offset-y').value = globalSettings.kaabaOffsetY;
            }
            audioElement.volume = globalSettings.volume;
        }

        const savedUsers = localStorage.getItem('vt_users');
        if (savedUsers) users = JSON.parse(savedUsers);

        const savedLaps = localStorage.getItem('vt_total_laps');
        if (savedLaps) totalLapsAllUsers = parseInt(savedLaps, 10) || 0;

        const savedComp = localStorage.getItem('vt_completed_count');
        if (savedComp) completedCountStat = parseInt(savedComp, 10) || 0;

        // Custom Background
        const bgData = await getFileFromDB('custom_bg');
        if (bgData) {
            bgImage.src = bgData;
            customBgLoaded = true;
        }

        // Custom Kaaba
        const kaabaData = await getFileFromDB('custom_kaaba');
        if (kaabaData) {
            kaabaImage.src = kaabaData;
            customKaabaLoaded = true;
        }

        // Custom Audio
        const audioData = await getFileFromDB('custom_audio');
        if (audioData) {
            audioElement.src = audioData;
            const filename = localStorage.getItem('vt_audio_name') || 'Audio Custom';
            if (document.getElementById('audio-filename')) document.getElementById('audio-filename').innerText = filename;
        }

    } catch (e) {
        console.warn("Storage restoration error:", e);
    }
    updateUI();
}

// --- VOICE WELCOME (SPEECH SYNTHESIS) ---
function speakWelcome(username) {
    if (!('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(`Selamat datang ${username}`);
        utterance.lang = 'id-ID';
        
        // 🔊 AMPLIFIKASI SUARA (100% Lebih Keras & Nyaring)
        utterance.volume = Math.min(1.0, (globalSettings.volume || 0.8) * 2.0);
        utterance.pitch = 1.25;  // Pitch dinaikkan agar artikulasi lebih tegas dan jelas
        utterance.rate = 1.05;   // Kecepatan dinaikkan sedikit agar responsif
        
        const voices = window.speechSynthesis.getVoices();
        const idVoice = voices.find(v => v.lang.includes('id') || v.lang.includes('ID'));
        if (idVoice) utterance.voice = idVoice;

        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn("Speech Synthesis error:", e);
    }
}

// --- USER MANAGEMENT ---
function handleSpawnUser(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('input-username');
    const username = usernameInput.value.trim().replace(/^@/, '');
    if (!username) return;

    const giftCategory = document.querySelector('input[name="giftCategory"]:checked').value;
    const characterMode = document.querySelector('input[name="characterMode"]:checked').value;

    // 🌟 SEBARAN JALUR TAWAF (Dalam, Tengah, dan Melebar Luar)
    // Variasi acak radius diperlebar agar jamaah menyebar dari dekat Ka'bah hingga area luar pelataran
    let radiusOffset = (Math.random() * 260) - 30;
    if (giftCategory === 'besar') {
        radiusOffset = (Math.random() * 100) - 20; // Hadiah besar cenderung di area dalam hingga tengah
    } else if (giftCategory === 'sedang') {
        radiusOffset = 60 + (Math.random() * 120); // Hadiah sedang di jalur tengah
    }

    let radius = TAWAF_MIN_RADIUS + radiusOffset;
    // Pastikan radius tetap berada di dalam batas kanvas yang wajar
    radius = Math.max(TAWAF_MIN_RADIUS - 10, Math.min(TAWAF_MAX_RADIUS + 40, radius));

    const queueX = QUEUE_AREA_MIN_X + Math.random() * (QUEUE_AREA_MAX_X - QUEUE_AREA_MIN_X);
    const queueY = QUEUE_AREA_MIN_Y + Math.random() * (QUEUE_AREA_MAX_Y - QUEUE_AREA_MIN_Y);

    const newUser = {
        id: 'u_' + Date.now() + '_' + Math.floor(Math.random()*1000),
        username: username,
        giftCategory: giftCategory,
        characterMode: characterMode,
        status: 'queue',
        radius: radius,
        angle: Math.PI / 2,
        speed: (0.004 + Math.random() * 0.004) * (giftCategory === 'besar' ? 1.25 : 1.0),
        laps: 0,
        x: queueX,
        y: queueY,
        opacity: 1.0
    };

    users.push(newUser);
    saveStateToStorage();
    updateUI();

    // Bunyikan ucapan selamat datang secara otomatis dengan volume lebih keras
    speakWelcome(username);

    usernameInput.value = '';
}

function approveQueueUser(count) {
    let approved = 0;
    for (let u of users) {
        if (u.status === 'queue') {
            u.status = 'tawaf';
            approved++;
            if (count !== 'all' && approved >= count) break;
        }
    }
    if (approved > 0) {
        saveStateToStorage();
        updateUI();
    }
}

function approveSingleUser(id) {
    const u = users.find(x => x.id === id);
    if (u) {
        u.status = 'tawaf';
        saveStateToStorage();
        updateUI();
    }
}

function deleteUser(id) {
    users = users.filter(u => u.id !== id);
    saveStateToStorage();
    updateUI();
}

function clearAllUsers() {
    users = [];
    totalLapsAllUsers = 0;
    completedCountStat = 0;
    saveStateToStorage();
    updateUI();
}

// --- MEDIA CUSTOM (LATAR & AUDIO) ---
async function handleBgUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        const dataUrl = event.target.result;
        bgImage.src = dataUrl;
        customBgLoaded = true;
        await saveFileToDB('custom_bg', dataUrl);
    };
    reader.readAsDataURL(file);
}

async function resetBgImage() {
    customBgLoaded = false;
    await saveFileToDB('custom_bg', null);
    if (document.getElementById('input-bg-file')) document.getElementById('input-bg-file').value = '';
}

async function handleKaabaUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        const dataUrl = event.target.result;
        kaabaImage.src = dataUrl;
        customKaabaLoaded = true;
        await saveFileToDB('custom_kaaba', dataUrl);
    };
    reader.readAsDataURL(file);
}

async function resetKaabaImage() {
    customKaabaLoaded = false;
    await saveFileToDB('custom_kaaba', null);
    if (document.getElementById('input-kaaba-file')) document.getElementById('input-kaaba-file').value = '';
}

function updateKaabaAdjustments() {
    globalSettings.kaabaScale = parseFloat(document.getElementById('slider-kaaba-scale').value) / 100;
    globalSettings.kaabaOffsetY = parseInt(document.getElementById('slider-kaaba-offset-y').value, 10);
    saveStateToStorage();
}

async function handleAudioUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        const dataUrl = event.target.result;
        audioElement.src = dataUrl;
        if (document.getElementById('audio-filename')) document.getElementById('audio-filename').innerText = file.name;
        localStorage.setItem('vt_audio_name', file.name);
        await saveFileToDB('custom_audio', dataUrl);
        if (isAudioPlaying) {
            audioElement.play().catch(err => {
                console.warn("Audio play failure captured:", err);
                isAudioPlaying = false;
                updateAudioUI();
            });
        }
    };
    reader.readAsDataURL(file);
}

function toggleAudioPlay() {
    if (!audioElement.src) {
        return;
    }
    if (isAudioPlaying) {
        try {
            audioElement.pause();
        } catch (e) {
            console.warn("Audio pause error:", e);
        }
        isAudioPlaying = false;
        updateAudioUI();
    } else {
        audioElement.volume = globalSettings.volume;
        const playPromise = audioElement.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    isAudioPlaying = true;
                    updateAudioUI();
                })
                .catch(err => {
                    console.warn("Autoplay policy blocked or audio error handled:", err);
                    isAudioPlaying = false;
                    updateAudioUI();
                });
        }
    }
}

function updateAudioUI() {
    const btnIcon = document.getElementById('audio-btn-icon');
    const btnText = document.getElementById('audio-btn-text');
    const adminIcon = document.getElementById('btn-audio-state-icon');
    const adminText = document.getElementById('btn-audio-state-text');

    if (isAudioPlaying) {
        if(btnIcon) btnIcon.className = "fa-solid fa-pause";
        if(btnText) btnText.innerText = "Hentikan Audio";
        if(adminIcon) adminIcon.className = "fa-solid fa-pause";
        if(adminText) adminText.innerText = "Hentikan";
    } else {
        if(btnIcon) btnIcon.className = "fa-solid fa-play";
        if(btnText) btnText.innerText = "Putar Audio";
        if(adminIcon) adminIcon.className = "fa-solid fa-play";
        if(adminText) adminText.innerText = "Putar Audio";
    }
}

function updateGlobalSettings() {
    globalSettings.speedMultiplier = parseFloat(document.getElementById('slider-speed').value);
    document.getElementById('val-speed-multiplier').innerText = globalSettings.speedMultiplier.toFixed(1) + 'x';

    globalSettings.sizeScale = parseFloat(document.getElementById('slider-size').value) / 100;
    document.getElementById('val-size-scale').innerText = Math.round(globalSettings.sizeScale * 100) + '%';

    globalSettings.volume = parseFloat(document.getElementById('slider-volume').value) / 100;
    document.getElementById('val-sound-vol').innerText = Math.round(globalSettings.volume * 100) + '%';
    audioElement.volume = globalSettings.volume;

    saveStateToStorage();
}

function togglePauseAnimation() {
    globalSettings.isPaused = !globalSettings.isPaused;
    const btn = document.getElementById('btn-pause-toggle');
    if (globalSettings.isPaused) {
        btn.innerHTML = `<i class="fa-solid fa-play text-emerald-400"></i> Lanjut`;
    } else {
        btn.innerHTML = `<i class="fa-solid fa-pause text-amber-400"></i> Jeda`;
    }
    saveStateToStorage();
}

// --- RENDERING & ANIMATION ENGINE ---
function updatePositions() {
    if (globalSettings.isPaused) return;

    let stateChanged = false;
    let usersToRemove = [];

    users.forEach(u => {
        if (u.status === 'tawaf') {
            const prevAngle = u.angle;
            u.angle -= u.speed * globalSettings.speedMultiplier;

            if (prevAngle > -Math.PI * 2 && u.angle <= -Math.PI * 2) {
                u.laps += 1;
                totalLapsAllUsers += 1;
                u.angle += Math.PI * 2;
                stateChanged = true;

                // FITUR: OTOMATIS SELESAI & HILANG SETELAH 5 TAWAF
                if (u.laps >= 5) {
                    u.status = 'fading';
                    completedCountStat += 1;
                }
            }

            u.x = CENTER_X + Math.cos(u.angle) * u.radius;
            u.y = CENTER_Y + Math.sin(u.angle) * u.radius;
        } else if (u.status === 'fading') {
            // Efek memudar halus kemudian dihapus dari array
            u.opacity = (u.opacity || 1.0) - 0.02;
            if (u.opacity <= 0) {
                usersToRemove.push(u.id);
                stateChanged = true;
            }
        }
    });

    if (usersToRemove.length > 0) {
        users = users.filter(u => !usersToRemove.includes(u.id));
        updateUI();
    }

    if (stateChanged) saveStateToStorage();
}

function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Background Custom / Default
    if (customBgLoaded && bgImage.complete && bgImage.naturalWidth !== 0) {
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(217, 119, 6, 0.15)';
        ctx.lineWidth = 4;
        for (let r = TAWAF_MIN_RADIUS; r <= TAWAF_MAX_RADIUS; r += 40) {
            ctx.beginPath();
            ctx.arc(CENTER_X, CENTER_Y, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.save();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(150, FENCE_Y);
        ctx.lineTo(450, FENCE_Y);
        ctx.moveTo(630, FENCE_Y);
        ctx.lineTo(930, FENCE_Y);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 24px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('🚪 GERBANG ANTREAN', CENTER_X, FENCE_Y + 10);
        ctx.restore();
    }

    // 2. Gambar Ka'bah (Tengah)
    const kScale = globalSettings.kaabaScale;
    const kOffsetY = globalSettings.kaabaOffsetY;

    if (customKaabaLoaded && kaabaImage.complete && kaabaImage.naturalWidth !== 0) {
        const kw = 240 * kScale;
        const kh = 240 * kScale;
        ctx.drawImage(kaabaImage, CENTER_X - kw / 2, CENTER_Y - kh / 2 + kOffsetY, kw, kh);
    } else {
        const kw = 200 * kScale;
        const kh = 200 * kScale;
        const kx = CENTER_X - kw / 2;
        const ky = CENTER_Y - kh / 2 + kOffsetY;

        ctx.fillStyle = '#111827';
        ctx.fillRect(kx, ky, kw, kh);

        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(kx, ky + kh * 0.2, kw, kh * 0.12);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4;
        ctx.strokeRect(kx, ky, kw, kh);
    }

    // 3. Gambar Jamaah
    users.forEach(u => {
        ctx.save();
        ctx.globalAlpha = u.opacity !== undefined ? u.opacity : 1.0;
        ctx.translate(u.x, u.y);

        const scale = globalSettings.sizeScale;

        let baseRadius = 35;
        let color = '#38bdf8';
        if (u.giftCategory === 'sedang') {
            baseRadius = 45;
            color = '#60a5fa';
        } else if (u.giftCategory === 'besar') {
            baseRadius = 55;
            color = '#fbbf24';
        }
        if (u.status === 'queue') color = '#94a3b8';

        const r = baseRadius * scale;

        // 3a. Draw Shape / Circle Background
        if (u.characterMode === 'shape' || u.characterMode === 'icon') {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3 * scale;
            ctx.stroke();

            if (u.characterMode === 'icon') {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
                ctx.font = `${Math.round(r * 1.1)}px "Font Awesome 6 Free"`;
                ctx.fontWeight = "900";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('\uf183', 0, 0);
            }
        }

      // 3b. Draw Username (Font Tebal, Warna Sesuai Pilihan, + Outline & Bayangan Hitam)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let fontSize = Math.floor(r * 0.55);
        if (u.characterMode === 'text') fontSize = Math.floor(22 * scale);

        // Tentukan Warna Berdasarkan Pilihan Mode Karakter:
        // 1. Teks Saja = Putih | 2. Teks + Shape = Hijau | 3. Teks + Icon = Oren
        let textColor = '#FFFFFF'; // Default Putih (Teks Saja)
        if (u.characterMode === 'shape') {
            textColor = '#22C55E'; // Hijau (Teks + Shape)
        } else if (u.characterMode === 'icon') {
            textColor = '#F97316'; // Oren (Teks + Icon)
        }

        // Set Font Paling Tebal (Rubik 900)
        ctx.font = `900 ${fontSize}px 'Rubik', Impact, sans-serif`;

        // 1. Gambar Garis Tepi (Stroke) Hitam Tebal
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(3, fontSize * 0.18);
        ctx.strokeText(`@${u.username}`, 0, 0);

        // 2. Gambar Bayangan Hitam di Belakang Teks
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000000';
        ctx.fillText(`@${u.username}`, 2, 2);

        // 3. Gambar Teks Utama dengan Warna Sesuai Ukuran/Mode
        ctx.fillStyle = textColor;
        ctx.fillText(`@${u.username}`, 0, 0);

        // 2. Gambar Bayangan Hitam di Belakang Teks
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000000';
        ctx.fillText(`@${u.username}`, 2, 2);

        // 3. Gambar Teks Utama dengan Warna Pilihan
        ctx.fillStyle = textColor;
        ctx.fillText(`@${u.username}`, 0, 0);

        // 3c. Draw Lap Indicator (Bawah Lingkaran)
        ctx.shadowBlur = 0;
        if (u.status === 'tawaf') {
            const badgeY = u.characterMode !== 'text' ? r + (12 * scale) : 22 * scale;
            ctx.fillStyle = '#10b981';
            ctx.font = `bold ${Math.round(12 * scale)}px Inter, sans-serif`;
            ctx.fillText(`[${u.laps}/5]`, 0, badgeY);
        } else if (u.status === 'queue') {
            const badgeY = u.characterMode !== 'text' ? r + (12 * scale) : 22 * scale;
            ctx.fillStyle = '#f59e0b';
            ctx.font = `bold ${Math.round(11 * scale)}px Inter, sans-serif`;
            ctx.fillText(`(Antrean)`, 0, badgeY);
        }

        ctx.restore();
    });
}

function mainLoop() {
    updatePositions();
    drawCanvas();
    requestAnimationFrame(mainLoop);
}

// --- UI UPDATE ---
function updateUI() {
    const queueUsers = users.filter(u => u.status === 'queue');
    const activeUsers = users.filter(u => u.status === 'tawaf');

    if (document.getElementById('live-active-count')) document.getElementById('live-active-count').innerText = activeUsers.length;
    if (document.getElementById('live-queue-count')) document.getElementById('live-queue-count').innerText = queueUsers.length;
    if (document.getElementById('live-total-laps')) document.getElementById('live-total-laps').innerText = totalLapsAllUsers;

    if (document.getElementById('stat-queue')) document.getElementById('stat-queue').innerText = queueUsers.length;
    if (document.getElementById('stat-active')) document.getElementById('stat-active').innerText = activeUsers.length;
    if (document.getElementById('stat-completed')) document.getElementById('stat-completed').innerText = completedCountStat;
    if (document.getElementById('stat-laps')) document.getElementById('stat-laps').innerText = totalLapsAllUsers;
    if (document.getElementById('badge-active-count')) document.getElementById('badge-active-count').innerText = `${users.length} Total Jamaah`;

    const tbody = document.getElementById('table-users-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-800/40 hover:bg-slate-800/30 transition";

        let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Di Antrean</span>`;
        if (u.status === 'tawaf') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Bertawaf</span>`;
        if (u.status === 'fading') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Proses Hilang...</span>`;

        tr.innerHTML = `
            <td class="py-2.5 px-3 font-semibold text-slate-100">@${u.username}</td>
            <td class="py-2.5 px-2 uppercase font-bold text-[10px] ${u.giftCategory==='besar'?'text-amber-400':u.giftCategory==='sedang'?'text-blue-400':'text-slate-400'}">${u.giftCategory}</td>
            <td class="py-2.5 px-2 font-bold text-slate-200">${u.laps}/5</td>
            <td class="py-2.5 px-2">${statusBadge}</td>
            <td class="py-2.5 px-3 text-right">
                ${u.status === 'queue' ? `<button onclick="approveSingleUser('${u.id}')" class="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded-md mr-1" title="Izinkan Masuk"><i class="fa-solid fa-door-open"></i></button>` : ''}
                <button onclick="deleteUser('${u.id}')" class="text-xs text-rose-400 hover:text-rose-300 p-1"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function switchView(mode) {
    const viewDisplay = document.getElementById('view-display');
    const viewAdmin = document.getElementById('view-admin');
    const btnDisplay = document.getElementById('btn-mode-display');
    const btnAdmin = document.getElementById('btn-mode-admin');

    if (mode === 'display') {
        viewDisplay.classList.remove('hidden');
        viewAdmin.classList.add('hidden');
        btnDisplay.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md";
        btnAdmin.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700";
    } else {
        viewDisplay.classList.add('hidden');
        viewAdmin.classList.remove('hidden');
        btnAdmin.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md";
        btnDisplay.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700";
    }
}

function toggleFullscreen() {
    const elem = document.getElementById('obs-canvas-wrapper');
    if (!document.fullscreenElement) {
        elem.requestFullscreen().catch(err => console.warn(`Gagal Fullscreen: ${err.message}`));
    } else {
        document.exitFullscreen().catch(err => console.warn(`Gagal Exit Fullscreen: ${err.message}`));
    }
}

// Startup Inisialisasi
window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await loadStateFromStorage();
    } catch (e) {
        console.warn("Init Error:", e);
    }
    mainLoop();
});
