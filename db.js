const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, 'database.json');

// Создаем файл базы, если его нет
if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, JSON.stringify({ users: [], bets: [] }, null, 2));
}

function readDB() {
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// Эмуляция методов better-sqlite3, чтобы server.js работал без изменений
module.exports = {
  prepare: (query) => {
    return {
      run: (...args) => {
        const db = readDB();
        if (query.includes('INSERT INTO users')) {
          const newUser = { id: db.users.length + 1, username: args[0], password: args[1], balance: 5000 };
          db.users.push(newUser);
          writeDB(db);
          return { lastInsertRowid: newUser.id };
        }
        if (query.includes('INSERT INTO bets')) {
          db.bets.push({ id: db.bets.length + 1, user_id: args[0], game: args[1], amount: args[2], result: args[3] });
          writeDB(db);
        }
        if (query.includes('UPDATE users SET balance')) {
          const user = db.users.find(u => u.id === args[1]);
          if (user) user.balance += args[0];
          writeDB(db);
        }
      },
      get: (...args) => {
        const db = readDB();
        if (query.includes('SELECT * FROM users WHERE username = ?')) {
          return db.users.find(u => u.username === args[0]);
        }
        if (query.includes('SELECT * FROM users WHERE id = ?')) {
          return db.users.find(u => u.id === args[0]);
        }
        if (query.includes('SELECT balance FROM users WHERE id = ?')) {
          const user = db.users.find(u => u.id === args[0]);
          return user ? { balance: user.balance } : null;
        }
      }
    };
  }
};
