import { db } from '../be/src/shared/db/knex.js';

async function main() {
  try {
    const sessions = await db('chat_sessions').select('*').limit(3).orderBy('created_at', 'desc');
    console.log('Recent sessions:', sessions.length);
    for (const session of sessions) {
      console.log(`- ${session.id}: ${session.title}`);
      const messages = await db('chat_messages').where({ session_id: session.id }).select('id', 'role', 'content').orderBy('timestamp', 'asc');
      console.log(`  Messages: ${messages.length}`);
      for (const msg of messages) {
        console.log(`    [${msg.role}] ${msg.content.substring(0, 50)}...`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await db.destroy();
  }
}
main();
