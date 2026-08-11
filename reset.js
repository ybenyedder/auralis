import Database from 'better-sqlite3';
import crypto from 'crypto';

const db = new Database('/home/pc/.local/share/auralis/auralis.db');

const initialPw = 'admin1234';
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(initialPw, salt, 100000, 64, 'sha512').toString('hex');

db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE username = 'admin'").run(hash, salt);

console.log("Password reset to admin1234");
