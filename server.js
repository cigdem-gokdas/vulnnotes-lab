'use strict';

/*
 * VulnNotes - basit not tutma servisi
 *
 * UYARI: Bu uygulama EGITIM AMACLI ve KASITLI OLARAK ZAFIYETLIDIR.
 * Sadece 127.0.0.1 uzerinde, kendi makinenizde calistirin.
 * Internete acmayin, gercek veri girmeyin.
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { exec } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const { db, legacyHash } = require('./db');

const app = express();
const PORT = 3000;

const JWT_SECRET = 'gizli123';
const ADMIN_BACKUP_TOKEN = 'backup-token-2024';

const STORAGE_DIR = path.join(__dirname, 'storage');
const BACKUP_DIR = path.join(__dirname, 'backups');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------

function currentUser(req) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function requireLogin(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.status(401).json({ message: 'Once giris yapmalisiniz' });
  }
  req.user = user;
  next();
}

// ---------------------------------------------------------------------------
// Kimlik dogrulama
// ---------------------------------------------------------------------------

app.post('/api/auth/register', (req, res) => {
  const { email, password, fullname, phone } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'E-posta ve parola zorunlu' });
  }

  const stmt = db.prepare(
    'INSERT INTO users (email, password, fullname, phone) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(email, legacyHash(password), fullname || '', phone || '');

  db.prepare('INSERT INTO wallets (user_id, balance) VALUES (?, 0)').run(result.lastInsertRowid);

  res.status(201).json({ id: result.lastInsertRowid, email });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const hashed = legacyHash(password || '');

  const user = db
    .prepare('SELECT id, email, fullname, role FROM users WHERE email = ? AND password = ?')
    .get(email, hashed);

  if (!user) {
    return res.status(401).json({ message: 'E-posta veya parola hatali' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET
  );

  res.cookie('token', token);
  res.json({ token, user });
});

// ---------------------------------------------------------------------------
// Kullanici profili ve notlar
// ---------------------------------------------------------------------------

app.get('/api/users/:id', requireLogin, (req, res) => {
  const user = db
    .prepare('SELECT id, email, fullname, phone, role FROM users WHERE id = ?')
    .get(Number(req.params.id));

  if (!user) return res.status(404).json({ message: 'Kullanici bulunamadi' });
  res.json(user);
});

app.get('/api/notes/:id', requireLogin, (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(req.params.id));
  if (!note) return res.status(404).json({ message: 'Not bulunamadi' });
  res.json(note);
});

app.post('/api/notes', requireLogin, (req, res) => {
  const { title, body } = req.body;
  const result = db
    .prepare('INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)')
    .run(req.user.id, title, body);
  res.status(201).json({ id: result.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// Yorumlar
// ---------------------------------------------------------------------------

app.get('/comments', (req, res) => {
  const comments = db.prepare('SELECT * FROM comments ORDER BY id DESC').all();
  res.render('comments', { comments });
});

app.post('/api/comments', (req, res) => {
  const { author, body } = req.body;
  db.prepare('INSERT INTO comments (author, body) VALUES (?, ?)').run(author, body);
  res.redirect('/comments');
});

// ---------------------------------------------------------------------------
// Dosya servisi
// ---------------------------------------------------------------------------

app.get('/api/files', requireLogin, (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ message: 'name parametresi gerekli' });

  const filePath = path.join(STORAGE_DIR, name);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).json({ message: 'Dosya okunamadi', detail: err.message });
    }
    res.type('text/plain').send(data);
  });
});

// ---------------------------------------------------------------------------
// Yonetim
// ---------------------------------------------------------------------------

app.post('/api/admin/backup', requireLogin, (req, res) => {
  const name = req.body.name || 'yedek';

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

  const command = `tar -czf ${BACKUP_DIR}/${name}.tar.gz ${STORAGE_DIR}`;

  exec(command, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ message: 'Yedekleme basarisiz', detail: stderr });
    }
    res.json({ message: 'Yedek olusturuldu', file: `${name}.tar.gz`, output: stdout });
  });
});

app.get('/api/admin/users', requireLogin, (req, res) => {
  const users = db.prepare('SELECT id, email, fullname, phone, role FROM users').all();
  res.json(users);
});

// ---------------------------------------------------------------------------
// Cuzdan
// ---------------------------------------------------------------------------

app.post('/api/wallet/redeem', requireLogin, (req, res) => {
  const amount = Number(req.body.amount || 0);
  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(req.user.id);

  if (!wallet || wallet.balance < amount) {
    return res.status(400).json({ message: 'Yetersiz bakiye' });
  }

  setTimeout(() => {
    db.prepare('UPDATE wallets SET balance = balance - ? WHERE user_id = ?').run(amount, req.user.id);
    const updated = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(req.user.id);
    res.json({ message: 'Harcama yapildi', balance: updated.balance });
  }, 50);
});

app.get('/api/wallet', requireLogin, (req, res) => {
  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(req.user.id);
  res.json(wallet);
});

// ---------------------------------------------------------------------------
// Hata yonetimi
// ---------------------------------------------------------------------------

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    message: err.message,
    stack: err.stack,
    query: req.query,
    body: req.body,
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`VulnNotes calisiyor: http://127.0.0.1:${PORT}`);
  console.log('UYARI: Kasitli olarak zafiyetlidir. Sadece yerel kullanim.');
});
