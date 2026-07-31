const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// توجيه السيرفر لقراءة الملفات من المجلد الحالي
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('لاعب متصل:', socket.id);

    // إنشاء غرفة جديدة
    socket.on('createRoom', (roomCode) => {
        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
    });

    // الانضمام لغرفة
    socket.on('joinRoom', (roomCode) => {
        const room = io.sockets.adapter.rooms.get(roomCode);
        if (room && room.size === 1) {
            socket.join(roomCode);
            // إبلاغ اللاعبين ببدء اللعب
            io.to(roomCode).emit('gameStarted');
            // تحديد أن من أنشأ الغرفة هو X والمنضم هو O
            socket.to(roomCode).emit('assignRole', 'X');
            socket.emit('assignRole', 'O');
        } else {
            socket.emit('roomError', 'الغرفة ممتلئة أو غير موجودة!');
        }
    });

    // تبادل الحركات
    socket.on('makeMove', (data) => {
        socket.to(data.roomCode).emit('opponentMove', data.index);
    });

    // إعادة اللعب
    socket.on('restartGame', (roomCode) => {
        io.to(roomCode).emit('resetBoard');
    });

    socket.on('disconnect', () => {
        console.log('لاعب غادر:', socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is running on https://x-o-master-pro.onrender.com:${PORT}`);
});