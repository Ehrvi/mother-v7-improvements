import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

// Check tables
const [tables] = await connection.query('SHOW TABLES');
console.log('📊 Tables:', tables);

// Check conversation count
const [conversations] = await connection.query('SELECT COUNT(*) as count FROM conversations');
console.log('💬 Conversations:', conversations[0].count);

// Check message count
const [messages] = await connection.query('SELECT COUNT(*) as count FROM messages');
console.log('📝 Messages:', messages[0].count);

// Check knowledge entries
const [knowledge] = await connection.query('SELECT COUNT(*) as count FROM knowledge_base');
console.log('🧠 Knowledge entries:', knowledge[0].count);

await connection.end();
