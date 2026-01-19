// mongodb-auth-state.js - Adapter para guardar sesiones de Baileys en MongoDB

const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

/**
 * Adapter para almacenar las credenciales de autenticación en MongoDB
 * Reemplaza useMultiFileAuthState de Baileys
 */
async function useMongoDBAuthState(collection, clientId) {
  // Buscar credenciales existentes en la base de datos
  const doc = await collection.findOne({ clientId });
  
  let creds = doc?.creds ? JSON.parse(JSON.stringify(doc.creds), BufferJSON.reviver) : initAuthCreds();
  let keys = doc?.keys ? JSON.parse(JSON.stringify(doc.keys)) : {};

  /**
   * Guarda las credenciales en MongoDB
   */
  const saveCreds = async () => {
    const data = {
      clientId,
      creds,
      keys,
      updatedAt: new Date()
    };

    await collection.updateOne(
      { clientId },
      { $set: data },
      { upsert: true }
    );
  };

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          const data = {};
          ids.forEach(id => {
            let value = keys[`${type}-${id}`];
            if (value) {
              if (type === 'app-state-sync-key') {
                value = JSON.parse(JSON.stringify(value), BufferJSON.reviver);
              }
              data[id] = value;
            }
          });
          return data;
        },
        set: (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                keys[key] = value;
              } else {
                delete keys[key];
              }
            }
          }
          saveCreds();
        }
      }
    },
    saveCreds
  };
}

module.exports = { useMongoDBAuthState };
