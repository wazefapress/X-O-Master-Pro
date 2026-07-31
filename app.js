// --- المتغيرات العامة ---
let socket = null;
if (typeof io !== 'undefined') {
    try { socket = io(); } catch(e) {}
}

// 1. حماية البيانات المحلية من التلف (تنظيف تلقائي في حال وجود خطأ)
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

// 2. الانتظار حتى يكتمل تحميل كل عناصر الصفحة (لمنع توقف الأزرار)
document.addEventListener("DOMContentLoaded", () => {
    updateScoreBoard();
    updateStagesUI();
    
    // ربط الخلايا بلوحة اللعب
    document.querySelectorAll('.cell').forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });

    // زر العودة للمراحل
    const backBtn = document.getElementById('back-to-stages');
    if(backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('game-section').classList.add('d-none');
            document.getElementById('stages-section').classList.remove('d-none');
            if(playMode === 'online' && socket) socket.emit('leaveRoom');
            updateStagesUI();
        });
    }

    // زر المشاركة
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

// 3. فتح المودال بطريقة آمنة تماماً تمنع الأعطال
function openModeSelection(stageIndex) {
    currentStage = stageIndex;
    const modalEl = document.getElementById('modeModal');
    if(modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
}

window.startGame = function(mode) {
    if (mode === 'online' && !socket) {
        Swal.fire('غير متاح', 'للعب أونلاين يجب تشغيل اللعبة عبر سيرفر Node.js.', 'warning');
        return;
    }
    
    playMode = mode;
    const modalEl = document.getElementById('modeModal');
    if(modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    
    if (mode === 'ai') setupGameBoard();
};

window.showOnlineSetup = function() {
    if (!socket) {
        Swal.fire('غير متاح', 'السيرفر المحلي لا يعمل حالياً.', 'warning');
        return;
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modeModal')).hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('onlineModal')).show();
};

function setupGameBoard() {
    document.getElementById('stages-section').classList.add('d-none');
    document.getElementById('game-section').classList.remove('d-none');
    document.getElementById('current-stage-title').innerText = `المرحلة ${currentStage}`;
    resetBoard();
}

function handleCellClick(e) {
    const clickedCell = e.target;
    const cellIndex = parseInt(clickedCell.getAttribute('data-index'));

    if (board[cellIndex] !== '' || !gameActive) return;
    if (playMode === 'online' && currentPlayer !== myRole) return; 

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
    // تشغيل الصوت بأمان لمنع توقف الكود إذا منع المتصفح الصوت التلقائي
    if(clickSound) clickSound.play().catch(()=>{});
    
    board[index] = currentPlayer;
    cell.innerText = currentPlayer;
    cell.classList.add(currentPlayer.toLowerCase());
    checkResult();
    
    if (gameActive) {
        currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
        const ti = document.getElementById('turn-indicator');
        if (ti) ti.innerText = playMode === 'online' ? `أنت: ${myRole} | دور: ${currentPlayer}` : `دور اللاعب: ${currentPlayer}`;
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
        const msg = winner === myRole ? 'لقد فزت!' : 'لقد خسرت!';
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
    if(ti) ti.innerText = playMode === 'online' ? `أنت: ${myRole} | دور: X` : 'دور اللاعب: X';
    
    document.querySelectorAll('.cell').forEach(cell => {
        cell.innerText = '';
        cell.classList.remove('x', 'o');
    });
}

// --- الأونلاين ---
window.createRoom = function() {
    if(!socket) return;
    roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    socket.emit('createRoom', roomCode);
    document.getElementById('room-code-display').classList.remove('d-none');
    document.getElementById('generated-code').innerText = roomCode;
};

window.joinRoom = function() {
    if(!socket) return;
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    const playerName = document.getElementById('player-name').value.trim();
    if (code && playerName) {
        roomCode = code;
        socket.emit('joinRoom', roomCode);
    } else {
        Swal.fire('خطأ', 'يرجى إدخال اسمك وكود الغرفة', 'warning');
    }
};

window.copyCode = function() {
    navigator.clipboard.writeText(roomCode);
    Swal.fire('تم!', 'تم نسخ الكود بنجاح', 'success');
};

if (socket) {
    socket.on('gameStarted', () => {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('onlineModal')).hide();
        setupGameBoard();
    });

    socket.on('assignRole', (role) => {
        myRole = role;
        const ti = document.getElementById('turn-indicator');
        if (ti) ti.innerText = `أنت: ${myRole} | دور: X`;
    });

    socket.on('opponentMove', (index) => {
        let cellToClick = document.querySelector(`.cell[data-index="${index}"]`);
        if(cellToClick) playMove(cellToClick, index);
    });

    socket.on('resetBoard', resetBoard);
    socket.on('roomError', (msg) => Swal.fire('خطأ', msg, 'error'));
}