import { DataAPIClient } from '@datastax/astra-db-ts';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const endpoint = process.env.ASTRA_DB_API_ENDPOINT || '';
const token = process.env.ASTRA_DB_APPLICATION_TOKEN || '';
const namespace = process.env.ASTRA_DB_NAMESPACE || 'default_keyspace';

const client = new DataAPIClient(token);
const db = client.db(endpoint, { keyspace: namespace });

const main = async () => {
    try {
        const user = await db.collection('users').findOne({ email: 'compileshader@gmail.com' });
        console.log('Admin User:', JSON.stringify(user, null, 2));
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
};

main();
