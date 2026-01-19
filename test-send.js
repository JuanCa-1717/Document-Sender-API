const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function checkStatus() {
  try {
    const response = await fetch('https://document-sender-api-1.onrender.com/status');
    const status = await response.json();
    console.log('Estado del servidor:', status);
    return status.ready;
  } catch (error) {
    console.error('Error verificando estado:', error.message);
    return false;
  }
}

async function sendDocument() {
  console.log('Verificando estado del servidor...');
  const ready = await checkStatus();
  
  if (!ready) {
    console.log('\n⚠️  El servidor no está listo. Por favor escanea el código QR en:');
    console.log('   https://document-sender-api-1.onrender.com/\n');
    return;
  }

  console.log('\n✓ Servidor listo. Enviando mensaje...\n');

  const form = new FormData();
  form.append('phone', '50671685812');
  form.append('caption', 'listo');
  form.append('file', fs.createReadStream('test.txt'));

  try {
    const response = await fetch('https://document-sender-api-1.onrender.com/send', {
      method: 'POST',
      body: form
    });

    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (response.status === 200) {
      console.log('\n✓ ¡Mensaje enviado exitosamente!');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

sendDocument();
