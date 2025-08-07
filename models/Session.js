const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sessionSchema = new Schema({
  chatId: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  step: String,
  lastMessageId: Number
});

module.exports = mongoose.model('Session', sessionSchema);
