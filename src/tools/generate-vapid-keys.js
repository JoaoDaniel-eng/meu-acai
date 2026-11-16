import { generateKeyPairSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Gera o par de chaves VAPID (identifica o servidor perante os serviços de push dos navegadores).
// Formato exigido pelo Web Push: base64 "seguro para URL", chave pública com 65 bytes (ponto P-256 não comprimido) e privada com 32 bytes.
export function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' }), priv = privateKey.export({ format: 'jwk' });
  const uncompressed = Buffer.concat([Buffer.from([0x04]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { publicKey: uncompressed.toString('base64url'), privateKey: priv.d };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keys = generateVapidKeys();
  console.log('Cadastre estas variáveis no servidor (Render: Environment) e no .env local.');
  console.log('Guarde a chave PRIVADA em segredo: nunca coloque no GitHub, em prints ou em mensagens.\n');
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log('VAPID_SUBJECT=mailto:seu-email@exemplo.com');
}
