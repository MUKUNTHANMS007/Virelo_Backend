import { astraDb } from '../lib/astra';

export const connectDB = async (): Promise<void> => {
  try {
    // Astra DB client is initialized in lib/astra.ts, but let's verify connectivity
    const collections = await astraDb.listCollections();
    console.log(`✅ Astra DB connected. Collections: ${collections.length}`);
  } catch (error) {
    console.error('❌ Astra DB connection error:', error);
    console.log('⚠️ Ensure ASTRA_DB_API_ENDPOINT and ASTRA_DB_APPLICATION_TOKEN are correct.');
  }
};
