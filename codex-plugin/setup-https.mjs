import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = process.env.AGENT_DEATHMATCH_GAME_DIR || path.dirname(pluginDir);
const tlsDir = process.env.AGENT_DEATHMATCH_TLS_DIR || path.join(gameDir, 'data/agent-deathmatch-tls');
const keyPath = path.join(tlsDir, 'localhost-key.pem');
const certPath = path.join(tlsDir, 'localhost-cert.pem');
process.umask(0o077);
fs.mkdirSync(tlsDir, { recursive: true, mode: 0o700 });

if (!fs.existsSync(keyPath) && !fs.existsSync(certPath)) {
  const result = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-sha256', '-days', '365', '-noenc', '-keyout', keyPath, '-out', certPath,
    '-subj', '/CN=Agent Deathmatch localhost/O=Agent Deathmatch',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
    '-addext', 'basicConstraints=critical,CA:FALSE',
    '-addext', 'keyUsage=critical,digitalSignature',
    '-addext', 'extendedKeyUsage=serverAuth'
  ], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Could not create the localhost certificate.');
}
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  throw new Error(`TLS setup is incomplete in ${tlsDir}; existing files were preserved.`);
}
fs.chmodSync(keyPath, 0o600);
const certificate = new X509Certificate(fs.readFileSync(certPath));
if (certificate.ca || !certificate.checkHost('localhost')) {
  throw new Error('Expected a localhost server certificate with CA:FALSE.');
}
const expectedNames = 'DNS:localhost, IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1';
if (certificate.subjectAltName !== expectedNames) {
  throw new Error('The certificate must contain only localhost and loopback IP names.');
}
if (Date.parse(certificate.validTo) <= Date.now()) throw new Error('The localhost certificate has expired.');

console.log(`Certificate: ${certPath}`);
console.log(`SHA-256: ${certificate.fingerprint256}`);
console.log(`Server names: ${certificate.subjectAltName}`);
console.log('CA:FALSE; this certificate cannot issue certificates for other sites.');

if (process.argv.includes('--trust')) {
  if (process.platform !== 'darwin') throw new Error('Automatic user Keychain setup is only supported on macOS.');
  const result = spawnSync('/usr/bin/security', [
    // Chromium ignores macOS policyString hostname constraints. SSL trust is
    // applied to this exact non-CA certificate; its SANs restrict server names.
    'add-trusted-cert', '-r', 'trustRoot', '-p', 'ssl',
    '-k', path.join(os.homedir(), 'Library/Keychains/login.keychain-db'), certPath
  ], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('macOS did not trust the localhost certificate.');
  console.log('Trusted for SSL in your user Keychain; certificate names are limited to localhost and loopback IPs.');
}
