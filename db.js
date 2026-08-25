'use strict';

// Node 22.13+ ile gelen dahili SQLite modulu. Ekstra kurulum/derleme gerektirmez.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'vulnnotes.db');
const db = new DatabaseSync(DB_PATH);

// Parolalar tuzsuz SHA-1 ile saklaniyor.
const argon2 = require('argon2');
const hash = await argon2.hash(password,
  { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
// doğrulama:
const ok = await argon2.verify(storedHash, password);

function reset() {
  db.exec(`
    DROP TABLE IF EXISTS comments;
    DROP TABLE IF EXISTS notes;
    DROP TABLE IF EXISTS wallets;
    DROP TABLE IF EXISTS users;

    CREATE TABLE users (
      id       INTEGER PRIMARY KEY,
      email    TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      fullname TEXT NOT NULL,
      phone    TEXT NOT NULL,
      role     TEXT NOT NULL DEFAULT 'user'
    );

    CREATE TABLE notes (
      id      INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title   TEXT NOT NULL,
      body    TEXT NOT NULL
    );

    CREATE TABLE comments (
      id      INTEGER PRIMARY KEY,
      author  TEXT NOT NULL,
      body    TEXT NOT NULL
    );

    CREATE TABLE wallets (
      user_id INTEGER PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0
    );
  `);

  const insertUser = db.prepare(
    'INSERT INTO users (id, email, password, fullname, phone, role) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertUser.run(1, 'ayse@ornek.com', legacyHash('Ayse1234'), 'Ayse Yilmaz', '0555 111 22 33', 'user');
  insertUser.run(2, 'mehmet@ornek.com', legacyHash('mehmet'), 'Mehmet Kaya', '0555 444 55 66', 'user');
  insertUser.run(3, 'admin@ornek.com', legacyHash('admin123'), 'Sistem Yoneticisi', '0555 000 00 00', 'admin');

  const insertNote = db.prepare('INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)');
  insertNote.run(1, 'Alisveris listesi', 'Sut, ekmek, yumurta');
  insertNote.run(2, 'Banka bilgileri', 'IBAN TR00 0000 0000 0000 (ornek veri)');
  insertNote.run(3, 'Sunucu erisimleri', 'Bu not sadece admin icindir (ornek veri)');

  const insertComment = db.prepare('INSERT INTO comments (author, body) VALUES (?, ?)');
  insertComment.run('Ayse', 'Uygulama guzel olmus.');
  insertComment.run('Mehmet', 'Yorum alani calisiyor mu diye deniyorum.');

  const insertWallet = db.prepare('INSERT INTO wallets (user_id, balance) VALUES (?, ?)');
  insertWallet.run(1, 100);
  insertWallet.run(2, 100);
  insertWallet.run(3, 100);

  console.log('Veritabani sifirlandi: ' + DB_PATH);
}

if (process.argv.includes('--reset')) {
  reset();
}

module.exports = { db, legacyHash, reset, DB_PATH };
