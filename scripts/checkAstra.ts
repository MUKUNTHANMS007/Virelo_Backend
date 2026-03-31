import { DataAPIClient } from '@datastax/astra-db-ts';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const endpoint = process.env.ASTRA_DB_API_ENDPOINT || '';
const token = process.env.ASTRA_DB_APPLICATION_TOKEN || '';

const client = new DataAPIClient(token);
// Try without keyspace initially to see what exists
// Astra default is "default_keyspace"
const astraDb = client.db(endpoint, { keyspace: 'default_keyspace' });

const checkKeyspace = async () => {
    try {
        console.log("Checking collections in default_keyspace...");
        const collections = await astraDb.listCollections();
        console.log("Collections:", collections.map(c => c.name));
    } catch (e: any) {
        console.error("Error:", JSON.stringify(e?.rawResponse || e, null, 2));
    } finally {
        process.exit(0);
    }
};

checkKeyspace();
