/* Encrypts data.plain.json -> data.enc.json with AES-256-GCM.
   Usage: node scripts/encrypt.js <passphrase>
   (data.plain.json is git-ignored; only the ciphertext is published.) */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const pass = process.argv[2];
if (!pass) { console.error("usage: node scripts/encrypt.js <passphrase>"); process.exit(1); }

const ITER = 310000;
const root = __dirname;
const plain = fs.readFileSync(path.join(root, "data.plain.json"));
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
fs.writeFileSync(path.join(root, "data.enc.json"), JSON.stringify(payload));
console.log("wrote data.enc.json (" + ct.length + " bytes ciphertext)");
