const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// إضافة إعدادات CORS للسماح بالاتصال الخارجي من أي واجهة (Frontend)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// نقطة فحص الصحة لإيقاظ السيرفر (Health Check & Ping)
app.get('/ping', (req, res) => {
    res.status(200).send('OK');
});

// تقديم الملفات الثابتة (HTML, CSS, JS) من المجلد الحالي
app.use(express.static(path.join(__dirname)));

// تخزين الغرف وحالتها
const rooms = {};

io.on('connection', (socket) => {
    console.log('مستخدم متصل:', socket.id);

    // إنشاء غرفة جديدة
    socket.on('createRoom', (roomCode) => {
        rooms[roomCode] = {
            players: [{ id: socket.id, role: 'X' }],
            board: ['', '', '', '', '', '', '', '', '']
        };
        socket.join(roomCode);
        socket.emit('assignRole', 'X');
        socket.emit('roomCreated', roomCode); // إشعار العميل بنجاح إنشاء الغرفة
        console.log(`تم إنشاء الغرفة: ${roomCode} بواسطة اللاعب X`);
    });

    // الانضمام إلى غرفة موجودة
    // الانضمام إلى غرفة موجودة
    socket.on('joinRoom', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('roomError', 'الغرفة غير موجودة أو تم إغلاقها!');
            return;
        }

        // --- التعديل هنا: التأكد من أن اللاعب ليس موجوداً بالفعل لتفادي الطلبات المزدوجة ---
        const alreadyInRoom = room.players.find(p => p.id === socket.id);
        if (alreadyInRoom) {
            // إذا وصل الطلب مرتين عن طريق الخطأ، نعيد توجيهه للعبة دون تسجيله كلاعب جديد
            socket.join(roomCode);
            socket.emit('assignRole', alreadyInRoom.role);
            if (room.players.length === 2) {
                io.to(roomCode).emit('gameStarted');
            }
            return;
        }

        // التأكد من أن الغرفة لم تمتلئ
        if (room.players.length >= 2) {
            socket.emit('roomError', 'الغرفة ممتلئة بالكامل!');
            return;
        }

        // تسجيل اللاعب الجديد
        room.players.push({ id: socket.id, role: 'O' });
        socket.join(roomCode);
        socket.emit('assignRole', 'O');

        console.log(`انضم اللاعب O إلى الغرفة: ${roomCode}`);

        // بدء اللعبة عندما يكتمل اللاعبان
        io.to(roomCode).emit('gameStarted');
    });

    // تنفيذ حركة اللعب
    socket.on('makeMove', (data) => {
        const { roomCode, index } = data;
        socket.to(roomCode).emit('opponentMove', index);
    });

    // إعادة تشغيل اللعبة
    socket.on('restartGame', (roomCode) => {
        io.to(roomCode).emit('resetBoard');
    });

    // مغادرة الغرفة أو قطع الاتصال
    socket.on('leaveRoom', () => {
        handleDisconnect(socket);
    });

    socket.on('disconnect', () => {
        console.log('مستخدم انقطع اتصاله:', socket.id);
        handleDisconnect(socket);
    });
});

function handleDisconnect(socket) {
    for (const roomCode in rooms) {
        const room = rooms[roomCode];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            room.players.splice(playerIndex, 1);
            socket.to(roomCode).emit('roomError', 'انسحب الطرف الآخر من المباراة.');
            if (room.players.length === 0) {
                delete rooms[roomCode];
            }
            break;
        }
    }
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
});