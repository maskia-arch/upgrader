const { supabase } = require('./db');

/**
 * Register a sent message to be deleted.
 * If deleteAfterMinutes is provided, calculates the expiry timestamp.
 * Otherwise, remains until deleted manually via deleteMessagesByType.
 */
async function registerMessageForDeletion(chatId, messageId, type, deleteAfterMinutes = null) {
  try {
    const deleteAt = deleteAfterMinutes 
      ? new Date(Date.now() + deleteAfterMinutes * 60000).toISOString()
      : null;
    
    await supabase.from('bot_messages_cleanup').insert({
      chat_id: chatId,
      message_id: messageId,
      type: type,
      delete_at: deleteAt
    });
  } catch (err) {
    console.error('[CLEANUP ERROR] Failed to register message for deletion:', err.message);
  }
}

/**
 * Deletes any messages of a specific type for a chat immediately.
 */
async function deleteMessagesByType(botOrCtx, chatId, type) {
  try {
    const { data: msgs, error } = await supabase
      .from('bot_messages_cleanup')
      .select('message_id')
      .eq('chat_id', chatId)
      .eq('type', type);
    
    if (error) throw error;
    if (msgs && msgs.length > 0) {
      const telegram = botOrCtx.telegram || botOrCtx;
      for (const msg of msgs) {
        try {
          await telegram.deleteMessage(chatId, msg.message_id);
        } catch (err) {
          // Message might already be deleted by user or not exist anymore
          console.warn(`[CLEANUP WARNING] Failed to delete message ${msg.message_id}:`, err.message);
        }
      }
      await supabase
        .from('bot_messages_cleanup')
        .delete()
        .eq('chat_id', chatId)
        .eq('type', type);
    }
  } catch (err) {
    console.error('[CLEANUP ERROR] Failed to delete messages by type:', err.message);
  }
}

/**
 * Scans the database and deletes expired messages.
 */
async function cleanupExpiredMessages(botInstance) {
  try {
    const now = new Date().toISOString();
    const { data: msgs, error } = await supabase
      .from('bot_messages_cleanup')
      .select('*')
      .lte('delete_at', now);

    if (error) throw error;
    if (msgs && msgs.length > 0) {
      for (const msg of msgs) {
        try {
          await botInstance.telegram.deleteMessage(msg.chat_id, msg.message_id);
        } catch (err) {
          console.warn(`[CLEANUP WARNING] Failed to delete expired message ${msg.message_id} in chat ${msg.chat_id}:`, err.message);
        }
      }
      
      const ids = msgs.map(m => m.id);
      await supabase
        .from('bot_messages_cleanup')
        .delete()
        .in('id', ids);
    }
  } catch (err) {
    console.error('[CLEANUP ERROR] Failed to run expired messages cleanup:', err.message);
  }
}

module.exports = {
  registerMessageForDeletion,
  deleteMessagesByType,
  cleanupExpiredMessages
};
