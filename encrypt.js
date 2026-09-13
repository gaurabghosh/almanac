/* Encrypts <section>/data.plain.json -> <section>/data.enc.json with AES-256-GCM.
   Usage: node encrypt.js <section> <passphrase>      e.g. node encrypt.js life "my passcode"
   (data.plain.json files are git-ignored; only the ciphertext is published.)
   Each section has its own passcode — they need not match. */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const [section, pass] = process.argv.slice(2);
if (!section || !pass) { console.error("usage: node encrypt.js <section> <passphrase>"); process.exit(1); }

const ITER = 310000;
const dir = path.join(__dirname, section);
const src = path.join(dir, "data.plain.json");
if (!fs.existsSync(src)) { console.error(`no ${src}`); process.exit(1); }
const plain = fs.readFileSync(src);
JSON.parse(plain); // validate

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(pass, salt, ITER, 32, "sha256");
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

const payload = {
  v: 1,
  kdf: "PBKDF2-SHA256",
  iterations: ITER,
  cipher: "AES-256-GCM",
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  ciphertext: ct.toString("base64"),
};
fs.writeFileSync(path.join(dir, "data.enc.json"), JSON.stringify(payload));
console.log(`wrote ${section}/data.enc.json (${ct.length} bytes ciphertext)`);
