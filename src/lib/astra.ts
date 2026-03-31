import { DataAPIClient } from '@datastax/astra-db-ts';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

const endpoint = process.env.ASTRA_DB_API_ENDPOINT || '';
const token = process.env.ASTRA_DB_APPLICATION_TOKEN || '';
const namespace = process.env.ASTRA_DB_NAMESPACE || 'default_keyspace';

if (!endpoint || !token) {
  console.error('Astra DB credentials missing in .env');
}

// Initialize the client 
const client = new DataAPIClient(token);
export const astraDb = client.db(endpoint, { keyspace: namespace });

export const getCollection = async (name: string) => {
  // Ensure the collection exists or just return it
  // Astra Data API will create collections on the fly if needed, 
  // but it's better to check if we can connect
  return astraDb.collection(name);
};

console.log(`Initialized Astra DB Client for ${endpoint}`);
