const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const db = require('./db');
const crypto = require('crypto');

const app = express();
const SECRET = 'change_me_to_long_random_string';
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// --- Регистрация ---
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 4)
    return res.status(400).json({ error: 'Логин и пароль (мин. 4 символа) обязательны' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
    const token = jwt.sign({ id: info.lastInsertRowid }, SECRET);
    res.cookie('token', token, { httpOnly: true }).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Такой пользователь уже есть' });
  }
});

// --- Вход ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  const token = jwt.sign({ id: user.id }, SECRET);
  res.cookie('token', token, { httpOnly: true }).json({ ok: true });
});

// --- Авторизация Telegram ---
function verifyTelegram(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return calculated === hash;
}

app.post('/api/telegram-auth', (req, res) => {
  const { initData } = req.body;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN не задан' });
  if (!initData || !verifyTelegram(initData, BOT_TOKEN))
    return res.status(401).json({ error: 'Неверная подпись Telegram' });

  const params = new URLSearchParams(initData);
  const tgUser = JSON.parse(params.get('user'));
  const login = 'tg_' + tgUser.id;
  
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(login);
  if (!user) {
    const info = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(login, 'telegram_no_password');
    user = { id: info.lastInsertRowid };
  }
  const token = jwt.sign({ id: user.id }, SECRET);
  res.cookie('token', token, { httpOnly: true, sameSite: 'none', secure: true }).json({ ok: true });
});

// --- Middleware авторизации ---
function auth(req, res, next) {
  try {
    const data = jwt.verify(req.cookies.token, SECRET);
    req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(data.id);
    if (!req.user) throw new Error();
    next();
  } catch {
    res.status(401).json({ error: 'Не авторизован' });
  }
}

// --- Профиль ---
app.get('/api/me', auth, (req, res) => {
  res.json({ username: req.user.username, balance: req.user.balance });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token').json({ ok: true });
});

// --- Игры ---
app.post('/api/game/coin', auth, (req, res) => {
  const { bet, choice } = req.body;
  const betNum = parseInt(bet);
  if (!betNum || betNum <= 0 || betNum > req.user.balance) return res.status(400).json({ error: 'Неверная ставка' });
  if (!['heads', 'tails'].includes(choice)) return res.status(400).json({ error: 'Выбери орёл или решка' });
  const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
  const win = outcome === choice ? betNum : -betNum;
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(win, req.user.id);
  db.prepare('INSERT INTO bets (user_id, game, amount, result) VALUES (?, ?, ?, ?)').run(req.user.id, 'coin', betNum, win);
  const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id).balance;
  res.json({ outcome, win, balance });
});

app.post('/api/game/dice', auth, (req, res) => {
  const { bet, guess } = req.body;
  const betNum = parseInt(bet);
  const guessNum = parseInt(guess);
  if (!betNum || betNum <= 0 || betNum > req.user.balance) return res.status(400).json({ error: 'Неверная ставка' });
  if (guessNum < 1 || guessNum > 6) return res.status(400).json({ error: 'Число от 1 до 6' });
  const roll = Math.floor(Math.random() * 6) + 1;
  const win = roll === guessNum ? betNum * 4 : -betNum;
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(win, req.user.id);
  db.prepare('INSERT INTO bets (user_id, game, amount, result) VALUES (?, ?, ?, ?)').run(req.user.id, 'dice', betNum, win);
  const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id).balance;
  res.json({ roll, win, balance });
});

app.post('/api/game/slots', auth, (req, res) => {
  const betNum = parseInt(req.body.bet);
  if (!betNum || betNum <= 0 || betNum > req.user.balance) return res.status(400).json({ error: 'Неверная ставка' });
  const symbols = ['🍒', '🍋', '🔔', '⭐', '💎'];
  const reels = [0,1,2].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
  let multiplier = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    multiplier = reels[0] === '💎' ? 20 : reels[0] === '⭐' ? 10 : 5;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    multiplier = 2;
  }
  const win = multiplier > 0 ? betNum * (multiplier - 1) : -betNum;
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(win, req.user.id);
  db.prepare('INSERT INTO bets (user_id, game, amount, result) VALUES (?, ?, ?, ?)').run(req.user.id, 'slots', betNum, win);
  const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id).balance;
  res.json({ reels, multiplier, win, balance });
});

app.listen(3000, () => console.log('Сервер: http://localhost:3000'));
