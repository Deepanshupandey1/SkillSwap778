import mongoose from 'mongoose';
import User from '../models/User.js';

// Must be set before mongoose.connect() opens the connection and triggers model
// initialization; otherwise an older incompatible User index could race with cleanup.
User.schema.set('autoIndex', false);

/**
 * Clean up an index from an older schema that indexed `topics` and `skills`
 * together. Those are both arrays, so MongoDB can fail while inserting or
 * updating users who have both fields populated. Keep auto-indexing disabled
 * for User until this legacy index is removed, then build the safe indexes
 * declared by the current schema.
 */
async function repairUserIndexes() {
  let indexes = [];
  try {
    indexes = await User.collection.indexes();
  } catch (error) {
    // A new database may not have created the users collection yet.
    if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') throw error;
  }

  for (const index of indexes) {
    const fields = Object.keys(index.key || {});
    if (fields.includes('topics') && fields.includes('skills')) {
      try {
        await User.collection.dropIndex(index.name);
        console.warn(`[database] Removed incompatible legacy users index: ${index.name}`);
      } catch (error) {
        if (error?.code !== 27 && error?.codeName !== 'IndexNotFound') throw error;
      }
    }
  }

  // Explicit createIndexes() still works with autoIndex disabled; this ensures
  // the safe indexes declared in User.js are created after legacy cleanup.
  await User.createIndexes();
}

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing. Copy server/.env.example to server/.env and configure it.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await repairUserIndexes();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}
