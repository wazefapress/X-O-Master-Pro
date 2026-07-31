// --- تهيئة الاتصال الآمن مع السيرفر ---
let socket = null;
let joinTimeout = null;

const SERVER_URL = "https://x-o-master-pro.onrender.com"; 

// دالة لإيقاظ سيرفر Render مبكراً
function wakeUpServer() {
    fetch(`${SERVER_URL}/ping`).catch(() => {});
}

function initSocket() {
    if (!socket && typeof io !== 'undefined') {
        socket = io(SERVER_URL, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });

        socket.on('connect_error', (err) => {
            console.error('خطأ في الاتصال بالسيرفر:', err.message);
            if (joinTimeout) {
                clearTimeout(joinTimeout);
                joinTimeout = null;
                Swal.close();
                Swal.fire('خطأ في الاتصال', 'تعذر الاتصال بالسيرفر. يرجى التحقق من انترنت جهازك أو محاولة إعادة التحميل.', 'error');
            }
        });

        setupSocketListeners();
    }
    return socket;
}

try {
    initSocket();
    wakeUpServer();
} catch(e) {
    console.warn('جاري محاولة الاتصال بالسيرفر...');
}

let gameData = { maxStage: 1, score: 0 };
try {
    const saved = localStorage.getItem('xo_game_data');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.maxStage === 'number') {
            gameData = parsed;
        }
    }
} catch (e) {
    localStorage.removeItem('xo_game_data');
}

let currentStage = 1;
let board = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let myRole = 'X'; 
let gameActive = false;
let playMode = 'ai'; 
let roomCode = '';

document.addEventListener("DOMContentLoaded", () => {
    updateScoreBoard();
    updateStagesUI();
    initSocket();
    wakeUpServer();
    
    document.querySelectorAll('.cell').forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });

    const backBtn = document.getElementById('back-to-stages');
    if(backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('game-section').classList.add('d-none');
            document.getElementById('stages-section').classList.remove('d-none');
            if(playMode === 'online' && socket) socket.emit('leaveRoom');
            updateStagesUI();
        });
    }

    const shareBtn = document.getElementById('share-btn');
    if(shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (navigator.share) {
                navigator.share({ title: 'لعبة X-O Master', url: window.location.href });
            } else {
                Swal.fire('مشاركة', 'قم بنسخ الرابط بأعلى المتصفح لمشاركته', 'info');
            }
        });
    }
});

function updateScoreBoard() {
    const sd = document.getElementById('score-display');
    if (sd) sd.innerText = gameData.score;
}

function updateStagesUI() {
    for (let i = 1; i <= 10; i++) {
        const btn = document.getElementById(`btn-stage-${i}`);
        if (!btn) continue;
        
        if (i <= gameData.maxStage) {
            btn.className = 'stage-btn stage-unlocked';
            btn.innerHTML = i;
            btn.onclick = () => openModeSelection(i);
        } else {
            btn.className = 'stage-btn stage-locked';
            btn.innerHTML = '<i class="fa-solid fa-lock"></i>';
            btn.onclick = null;
        }
    }
}

function openModeSelection(stageIndex) {
    currentStage = stageIndex;
    
    // إذا اختار اللاعب المرحلة الأولى، نعرض له قائمة اختيار النمط (أونلاين أو كمبيوتر)
    if (stageIndex === 1) {
        const modalEl = document.getElementById('modeModal');
        if(modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    } 
    // إذا اختار المرحلة الثانية فما فوق، يدخل فوراً للعب ضد الكمبيوتر
    else {
        playMode = 'ai';
        setupGameBoard();
    }
}

window.startGame = function(mode) {
    playMode = mode;
    const modalEl = document.getElementById('modeModal');
    if(modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    
    if (mode === 'ai') setupGameBoard();
};

window.showOnlineSetup = function() {
    const modeModalEl = document.getElementById('modeModal');
    const onlineModalEl = document.getElementById('onlineModal');
    if(modeModalEl) bootstrap.Modal.getOrCreateInstance(modeModalEl).hide();
    if(onlineModalEl) bootstrap.Modal.getOrCreateInstance(onlineModalEl).show();
    
    wakeUpServer();
    initSocket();
    if (socket && !socket.connected) {
        socket.connect();
    }
};

function setupGameBoard() {
    document.getElementById('stages-section').classList.add('d-none');
    document.getElementById('game-section').classList.remove('d-none');
    document.getElementById('current-stage-title').innerText = playMode === 'online' ? `مباراة أونلاين - غرفة: ${roomCode}` : `المرحلة ${currentStage}`;
    resetBoard();
}

function handleCellClick(e) {
    const clickedCell = e.target.closest('.cell');
    if (!clickedCell) return;

    const cellIndex = parseInt(clickedCell.getAttribute('data-index'));

    if (board[cellIndex] !== '' || !gameActive) return;

    // تنبيه المستخدم إذا كان يحاول اللعب في غير دوره
    if (playMode === 'online' && currentPlayer !== myRole) {
        Swal.fire({
            toast: true,
            position: 'top',
            icon: 'info',
            title: 'انتظر دور الخصم!',
            showConfirmButton: false,
            timer: 1200
        });
        return; 
    }

    playMove(clickedCell, cellIndex);

    if (playMode === 'ai' && gameActive && currentPlayer === 'O') {
        setTimeout(aiMove, 500); 
    }

    if (playMode === 'online' && socket) {
        socket.emit('makeMove', { roomCode, index: cellIndex });
    }
}

function playMove(cell, index) {
    const clickSound = document.getElementById('click-sound');
    if(clickSound) clickSound.play().catch(()=>{});
    
    board[index] = currentPlayer;
    cell.innerText = currentPlayer;
    cell.classList.add(currentPlayer.toLowerCase());
    checkResult();
    
    if (gameActive) {
        currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
        const ti = document.getElementById('turn-indicator');
        if (ti) {
            ti.innerText = playMode === 'online' 
                ? (currentPlayer === myRole ? `دورك الآن! (${myRole})` : `انتظر دور الخصم... (${currentPlayer})`)
                : `دور اللاعب: ${currentPlayer}`;
        }
    }
}

function aiMove() {
    let emptyCells = board.map((val, index) => val === '' ? index : null).filter(val => val !== null);
    if (emptyCells.length > 0) {
        let randomIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        let cellToClick = document.querySelector(`.cell[data-index="${randomIndex}"]`);
        if (cellToClick) playMove(cellToClick, randomIndex);
    }
}

function checkResult() {
    const winningConditions = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]            
    ];
    let roundWon = false;
    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i];
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            roundWon = true;
            break;
        }
    }

    if (roundWon) {
        gameActive = false;
        handleWin(currentPlayer);
        return;
    }

    if (!board.includes('')) {
        gameActive = false;
        Swal.fire('تعادل!', 'لا يوجد فائز هذه المرة.', 'info').then(resetBoard);
    }
}

function handleWin(winner) {
    const winSound = document.getElementById('win-sound');
    if (playMode === 'ai' && winner === 'X') {
        if(winSound) winSound.play().catch(()=>{});
        
        if (currentStage === gameData.maxStage) {
            gameData.score += 10;
            if (gameData.maxStage < 10) gameData.maxStage++;
            localStorage.setItem('xo_game_data', JSON.stringify(gameData));
            updateScoreBoard();
        }

        if (currentStage === 10 && winner === 'X') {
            triggerFinalVictory();
        } else {
            Swal.fire('أحسنت!', 'لقد فزت وفتحت المرحلة التالية!', 'success').then(() => {
                document.getElementById('back-to-stages').click();
            });
        }
    } else if (playMode === 'ai' && winner === 'O') {
        Swal.fire('خسرت!', 'لقد فاز الذكاء الاصطناعي.', 'error').then(resetBoard);
    } else if (playMode === 'online') {
        const msg = winner === myRole ? '🎉 لقد فزت بالمباراة!' : '❌ لقد خسرت المباراة!';
        const icon = winner === myRole ? 'success' : 'error';
        if(winner === myRole && winSound) winSound.play().catch(()=>{});
        Swal.fire('نهاية المباراة', msg, icon).then(() => {
            if(myRole === 'X' && socket) socket.emit('restartGame', roomCode);
        });
    }
}

function triggerFinalVictory() {
    if(typeof confetti !== 'undefined') {
        confetti({ particleCount: 250, spread: 100, origin: { y: 0.5 } });
    }
    Swal.fire({
        title: '🏆 مبروك يا بطل! 🏆',
        text: 'لقد ختمت اللعبة بالكامل وجمعت 100 نقطة!',
        icon: 'success',
        confirmButtonText: 'العب من جديد',
        allowOutsideClick: false
    }).then((result) => {
        if (result.isConfirmed) {
            gameData = { maxStage: 1, score: 0 };
            localStorage.setItem('xo_game_data', JSON.stringify(gameData));
            updateScoreBoard();
            document.getElementById('back-to-stages').click();
        }
    });
}

function resetBoard() {
    board = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'X';
    gameActive = true;
    
    const ti = document.getElementById('turn-indicator');
    if(ti) {
        ti.innerText = playMode === 'online' 
            ? (myRole === 'X' ? 'دورك الآن! (X)' : 'انتظر دور الخصم... (X)')
            : 'دور اللاعب: X';
    }
    
    document.querySelectorAll('.cell').forEach(cell => {
        cell.innerText = '';
        cell.classList.remove('x', 'o');
    });
}

window.createRoom = function() {
    playMode = 'online';
    roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();

    initSocket();
    socket.connect();

    Swal.fire({
        title: 'جاري إنشاء الغرفة...',
        text: 'جاري الاتصال بالسيرفر...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    socket.emit('createRoom', roomCode);
};

window.joinRoom = function() {
    playMode = 'online';
    const codeInput = document.getElementById('room-code-input');
    const nameInput = document.getElementById('player-name');
    
    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    const playerName = nameInput ? nameInput.value.trim() : '';

    if (!code || !playerName) {
        Swal.fire('تنبيه', 'يرجى إدخال اسمك وكود الغرفة أولاً', 'warning');
        return;
    }

    roomCode = code;
    initSocket();

    if (!socket) {
        Swal.fire('خطأ في الاتصال', 'تعذر الاتصال بالسيرفر. تأكد من اتصال الإنترنت.', 'error');
        return;
    }

    Swal.fire({
        title: 'جاري الانضمام...',
        text: 'جاري الاتصال بالغرفة...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    socket.connect();
    socket.emit('joinRoom', roomCode);

    if (joinTimeout) clearTimeout(joinTimeout);
    joinTimeout = setTimeout(() => {
        Swal.close();
        Swal.fire('تنبيه', 'استغرق السيرفر وقتاً طويلاً للاستجابة. تأكد من إنشاء الغرفة أولاً أو حاول الانضمام مجدداً.', 'warning');
    }, 60000);
};

window.copyCode = function() {
    navigator.clipboard.writeText(roomCode);
    Swal.fire('تم!', 'تم نسخ الكود بنجاح', 'success');
};

function setupSocketListeners() {
    if (!socket) return;
    
    socket.off('gameStarted');
    socket.off('assignRole');
    socket.off('roomCreated');
    socket.off('opponentMove');
    socket.off('resetBoard');
    socket.off('roomError');

    socket.on('roomCreated', (code) => {
        Swal.close();
        const roomDisplay = document.getElementById('room-code-display');
        const generatedCodeEl = document.getElementById('generated-code');
        
        if (roomDisplay && generatedCodeEl) {
            roomDisplay.classList.remove('d-none');
            generatedCodeEl.innerText = code;
        }
    });

    socket.on('gameStarted', () => {
        if (joinTimeout) clearTimeout(joinTimeout);
        Swal.close();
        
        // إغلاق المودال وتنظيف الشاشة تماماً من أي طبقة حجب شفافة
        const onlineModalEl = document.getElementById('onlineModal');
        if (onlineModalEl) {
            const modalInstance = bootstrap.Modal.getInstance(onlineModalEl) || bootstrap.Modal.getOrCreateInstance(onlineModalEl);
            modalInstance.hide();
        }
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        setupGameBoard();
    });

    socket.on('assignRole', (role) => {
        if (joinTimeout) clearTimeout(joinTimeout);
        myRole = role;
    });

    socket.on('opponentMove', (index) => {
        let cellToClick = document.querySelector(`.cell[data-index="${index}"]`);
        if(cellToClick) playMove(cellToClick, index);
    });

    socket.on('resetBoard', resetBoard);
    
    socket.on('roomError', (msg) => {
        if (joinTimeout) clearTimeout(joinTimeout);
        Swal.close();
        Swal.fire('تنبيه', msg, 'error');
    });
}