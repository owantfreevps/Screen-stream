// server.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// База данных пользователей (в реальном проекте используйте настоящую БД)
const users = [
    { id: 1, username: 'admin', password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' }, // пароль: '123'
    { id: 2, username: 'user', password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' }
];

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Настройка сессий
app.use(session({
    secret: 'your-secret-key-ring1-overload',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 3600000, // 1 час
        httpOnly: true
    }
}));

// Middleware проверки авторизации
function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Не авторизован' });
    }
}

// API: Логин
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    const user = users.find(u => u.username === username);
    
    if (!user) {
        return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    // В демо-целях сравниваем пароли напрямую (в реальном проекте используйте bcrypt.compare)
    if (password !== '123') {
        return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    req.session.user = {
        id: user.id,
        username: user.username
    };
    
    res.json({ success: true, user: req.session.user });
});

// API: Получить текущего пользователя
app.get('/api/user', requireAuth, (req, res) => {
    res.json(req.session.user);
});

// API: Выйти
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Защищённая тестовая страница (дополнительно)
app.get('/api/protected', requireAuth, (req, res) => {
    res.json({ message: `Привет, ${req.session.user.username}! Ты в защищённой зоне.` });
});

// Отдача статических файлов
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
    console.log(`📁 Тестовые учётные данные: admin/123 или user/123`);
});