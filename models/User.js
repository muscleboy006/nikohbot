// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  age: {
    type: Number,
    required: true
  },
  birthYear: {
    type: Number,
    required: true
  },
  gender: {
    type: String,
    required: true,
    enum: ['Erkak', 'Ayol']
  },
  city: {
    type: String,
    required: true
  },
  maritalStatus: {
    type: String,
    required: true,
    enum: ['Yolg\'iz', 'Beva', 'Ajrashgan']
  },
  phone: {
    type: String,
    required: true
  },
  photo: {
    type: String,
    required: true
  },
  registered: {
    type: Boolean,
    default: false
  },
  liked: [{
    type: String
  }],
  matches: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);