require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const qrcode = require('qrcode-terminal');

(async () => {
  try {
    const client = await wppconnect.create();

    client.on('qr', (qr) => {
      qrcode.generate(qr, { small: true });
      console.log('QR generado — escanéalo con tu teléfono.');
    });

    client.on('ready', () => {
      console.log('Conexión establecida');
    });

    async function sendDocument(toNumber, filePath, fileName = 'document', caption = '') {
      try {
        const to = `${toNumber}@c.us`;
        const res = await client.sendFile(to, filePath, fileName, caption);
        console.log('Enviado:', res);
      } catch (err) {
        console.error('Error enviando documento:', err);
      }
    }

    if (require.main === module) {
      const args = process.argv.slice(2);
      if (args.length >= 2) {
        const [toNumber, filePath, fileName, caption] = args;
        await sendDocument(toNumber, filePath, fileName, caption);
      } else {
        console.log('Uso: node index.js <numero_sin_codigo> <rutaArchivo> [nombreArchivo] [caption]');
        console.log('Ejemplo: node index.js 5213312345678 ./docs/contrato.pdf contrato "Aquí está el contrato"');
      }
    }
  } catch (e) {
    console.error('Fallo iniciando wppconnect:', e);
  }
})();
