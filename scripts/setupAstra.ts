import { DataAPIClient } from '@datastax/astra-db-ts';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const main = async () => {
    try {
        const client = new DataAPIClient(process.env.ASTRA_DB_APPLICATION_TOKEN as string);
        const db = client.db(process.env.ASTRA_DB_API_ENDPOINT as string, { keyspace: process.env.ASTRA_DB_NAMESPACE || 'default_keyspace' });

        const collectionsToCreate = ['projects', 'generations', 'feedbacks', 'news'];
        
        for (const col of collectionsToCreate) {
            try {
                process.stdout.write(`Creating collection '${col}'... `);
                await db.createCollection(col);
                console.log('Done.');
            } catch (e: any) {
                if (e.message?.includes('already exists')) {
                    console.log('Already exists.');
                } else {
                    console.log('Error:', e.message);
                }
            }
        }
        
    } catch (e) {
        console.error('Fatal setup error:', e);
    } finally {
        process.exit(0);
    }
};

main();
