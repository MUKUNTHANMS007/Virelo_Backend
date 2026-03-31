import { DataAPIClient } from '@datastax/astra-db-ts';
import { env } from '../config/env';

const endpoint = env.ASTRA_DB_API_ENDPOINT;
const token = env.ASTRA_DB_APPLICATION_TOKEN;
const namespace = env.ASTRA_DB_NAMESPACE;

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
