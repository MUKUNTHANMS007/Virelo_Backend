import { DataAPIClient } from '@datastax/astra-db-ts';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const endpoint = process.env.ASTRA_DB_API_ENDPOINT || '';
const token = process.env.ASTRA_DB_APPLICATION_TOKEN || '';
const namespace = process.env.ASTRA_DB_NAMESPACE || 'virelo';

const client = new DataAPIClient(token);
const astraDb = client.db(endpoint, { keyspace: namespace });

const seedAdmin = async () => {
  try {
    const adminEmail = 'compileshader@gmail.com';
    const rawPassword = 'password123';

    console.log(`Connecting to Astra at ${endpoint}... keyspace: ${namespace}`);
    
    // Create collection if not exists (fail-safe)
    try {
      await astraDb.createCollection('users');
      console.log('Created users collection');
    } catch (e: any) {
      // Ignored if it already exists
    }

    const collection = astraDb.collection('users');

    const existingAdmin = await collection.findOne({ email: adminEmail }).catch(e => {
        console.error("Error finding user:", JSON.stringify(e?.rawResponse || e, null, 2));
        return null;
    });
    
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    if (existingAdmin) {
      await collection.updateOne(
        { _id: existingAdmin._id },
        { 
          $set: { 
            role: 'admin', 
            password: hashedPassword,
            updatedAt: new Date().toISOString() 
          } 
        }
      );
      console.log('✅ Updated existing user to admin!');
    } else {
      await collection.insertOne({
        name: 'Ixnel Admin',
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
        plan: 'pro',
        generationCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log('✅ Created new Admin account!');
    }

  } catch (error: any) {
    console.error('❌ Failed to seed admin:', JSON.stringify(error?.rawResponse || error, null, 2));
  } finally {
    console.log('Done.');
    process.exit(0);
  }
};

seedAdmin();
