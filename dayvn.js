// bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Хранилище для сессий регистрации
const registrationSessions = new Map();

class RegistrationSession {
  constructor(chatId, telegramId) {
    this.chatId = chatId;
    this.telegramId = telegramId;
    this.step = 'name';
    this.data = {};
  }
}

// Хранилище для текущих просматриваемых анкет
const currentBrowsing = new Map();

// Функция поиска людей
async function browsePeople(msg) {
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: msg.from.id.toString() });
  
  if (!user || !user.registered) {
    return bot.sendMessage(chatId, 'Avval ro\'yxatdan o\'ting /start');
  }

  // Определяем противоположный пол для поиска
  const lookingForGender = user.gender === 'Erkak' ? 'Ayol' : 'Erkak';

  const potential = await User.findOne({
    telegramId: { $ne: user.telegramId },
    gender: lookingForGender, // Ищем только противоположный пол
    registered: true,
    telegramId: { $nin: user.liked }
  });

  if (!potential) {
    return bot.sendMessage(chatId, 'Hech kim topilmadi. Keyinroq qayta urinib ko\'ring.');
  }

  // Сохраняем текущую просматриваемую анкету
  currentBrowsing.set(chatId, potential.telegramId);

  const caption = `${potential.name}, ${potential.age}\n🏙 ${potential.city}\n💑 ${potential.maritalStatus}`;
  
  const browseKeyboard = [
    [{ text: '❤️ Layk' }, { text: '⏭ O\'tkazib yuborish' }],
    [{ text: '🏠 Bosh menyu' }]
  ];
  
  await bot.sendPhoto(chatId, potential.photo, {
    caption,
    reply_markup: {
      keyboard: browseKeyboard,
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}

// Обработка лайка
async function handleLike(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const targetId = currentBrowsing.get(chatId);
  
  if (!targetId) {
    return bot.sendMessage(chatId, 'Avval biror kishini ko\'ring.');
  }

  const user = await User.findOne({ telegramId: userId });
  const target = await User.findOne({ telegramId: targetId });
  
  if (!user || !target) return;

  // Проверяем совместимость полов
  if ((user.gender === 'Erkak' && target.gender !== 'Ayol') || 
      (user.gender === 'Ayol' && target.gender !== 'Erkak')) {
    return bot.sendMessage(chatId, 'Xatolik: Faqat qarama-qarshi jinsdagi odamlarni layklash mumkin.');
  }

  if (!user.liked.includes(targetId)) {
    user.liked.push(targetId);
    await user.save();
  }
  
  // Создаем кнопку для написания с готовым текстом
  const phoneNumber = user.phone.replace(/^\+/, '').replace(/[^\d]/g, ''); // Убираем + и не цифровые символы
  const messageText = encodeURIComponent('Assalomu alaykum siz menga Nikoh.uz botida layk qoyibsiz.');
  const writeButton = {
    text: '✉️ Yozish',
    url: `https://t.me/+${phoneNumber}?text=${messageText}`
  };

  // Отправляем анкету лайкнувшего получателю лайка с кнопкой
  const likerCaption = `🔥 Sizga layk keldi!\n\n${user.name}, ${user.age}\n🏙 ${user.city}\n💑 ${user.maritalStatus}`;
  
  await bot.sendPhoto(target.telegramId, user.photo, {
    caption: likerCaption,
    reply_markup: {
      inline_keyboard: [[writeButton]]
    }
  });
  
  if (target.liked.includes(userId)) {
    // Взаимный лайк - создаем матч
    if (!user.matches.includes(targetId)) {
      user.matches.push(targetId);
      await user.save();
    }
    if (!target.matches.includes(userId)) {
      target.matches.push(userId);
      await target.save();
    }
    
    // Отправляем кнопку для написания и лайкнувшему при матче
    const targetPhoneNumber = target.phone.replace(/^\+/, '').replace(/[^\d]/g, '');
    const targetWriteButton = {
      text: '✉️ Yozish',
      url: `https://t.me/+${targetPhoneNumber}?text=${messageText}`
    };

    await bot.sendMessage(chatId, `🎉 ${target.name} bilan o'zaro layk! Match!`, {
      reply_markup: {
        inline_keyboard: [[targetWriteButton]]
      }
    });
    await bot.sendMessage(target.telegramId, `🎉 ${user.name} bilan o'zaro layk! Match!`);
  } else {
    await bot.sendMessage(chatId, `❤️ ${target.name}ga layk yuborildi`);
  }

  // Показываем следующую анкету
  setTimeout(() => browsePeople(msg), 1000);
}

// Обработка пропуска
async function handleSkip(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const targetId = currentBrowsing.get(chatId);
  
  if (!targetId) {
    return bot.sendMessage(chatId, 'Avval biror kishini ko\'ring.');
  }

  const user = await User.findOne({ telegramId: userId });
  const target = await User.findOne({ telegramId: targetId });
  
  if (!user || !target) return;

  // Проверяем совместимость полов (дополнительная проверка)
  if ((user.gender === 'Erkak' && target.gender !== 'Ayol') || 
      (user.gender === 'Ayol' && target.gender !== 'Erkak')) {
    return bot.sendMessage(chatId, 'Xatolik: Faqat qarama-qarshi jinsdagi odamlarni ko\'rish mumkin.');
  }
  
  // Показываем следующую анкету
  // setTimeout(() => browsePeople(msg), 500);
  browsePeople(msg);
}

// Функция показа лайков
async function showLikes(msg) {
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: msg.from.id.toString() });
  
  if (!user || !user.registered) {
    return bot.sendMessage(chatId, 'Avval ro\'yxatdan o\'ting /start');
  }
  
  if (user.matches.length === 0) {
    return bot.sendMessage(chatId, 'Sizda hali hech qanday match yo\'q.');
  }
  
  let matchesText = '❤️ Sizning matchlaringiz:\n\n';
  const matchButtons = [];
  
  for (let i = 0; i < user.matches.length; i++) {
    const match = await User.findOne({ telegramId: user.matches[i] });
    if (match) {
      matchesText += `${i + 1}. ${match.name}, ${match.age} - ${match.city}\n`;
      
      // Создаем кнопку для написания каждому матчу
      const phoneNumber = match.phone.replace(/^\+/, '').replace(/[^\d]/g, '');
      const messageText = encodeURIComponent('Assalomu alaykum siz menga Nikoh.uz botida layk qoyibsiz.');
      
      matchButtons.push([{
        text: `✉️ ${match.name}ga yozish`,
        url: `https://t.me/+${phoneNumber}?text=${messageText}`
      }]);
    }
  }
  
  await bot.sendMessage(chatId, matchesText, {
    reply_markup: {
      inline_keyboard: matchButtons
    }
  });
}

// Функция показа профиля
async function showProfile(msg) {
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: msg.from.id.toString() });
  
  if (!user || !user.registered) {
    return bot.sendMessage(chatId, 'Avval ro\'yxatdan o\'ting /start');
  }
  
  const profileText = `👤 Sizning profilingiz:\n\n` +
    `Ism: ${user.name}\n` +
    `Yosh: ${user.age}\n` +
    `Jins: ${user.gender}\n` +
    `Shahar: ${user.city}\n` +
    `Oilaviy holat: ${user.maritalStatus}\n` +
    `Telefon: ${user.phone}`;
  
  await bot.sendPhoto(chatId, user.photo, { caption: profileText });
}

// Функция настроек
async function showSettings(msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '⚙️ Sozlamalar hali ishlab chiqilmoqda...');
}
async function sendQuestion(chatId, text, keyboard = null) {
  const options = {};
  if (keyboard) {
    options.reply_markup = { inline_keyboard: keyboard };
  }
  await bot.sendMessage(chatId, text, options);
}

async function editToNext(chatId, messageId, text, keyboard = null) {
  const options = {};
  if (keyboard) {
    options.reply_markup = { inline_keyboard: keyboard };
  }
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    });
  } catch (error) {
    // Если не удалось отредактировать, отправляем новое сообщение
    await sendQuestion(chatId, text, keyboard);
  }
}

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  let user = await User.findOne({ telegramId });
  await bot.sendMessage(process.env.ADMIN_TELEGRAM_ID, 
    `Yangi foydalanuvchi start bosdi\n\n` + 
    `Ismi: ${msg.from.first_name}\n` +
    `Familiya: ${msg.from.last_name}\n` +
    `Username: @${msg.from.username}\n` +
    `TelegramID: ${msg.chat.id}`
  )

  if (user && user.registered) {
    const mainKeyboard = [
      [{ text: '👀 Qidiruv' }, { text: '❤️ Mening layklarim' }],
      [{ text: '👤 Profil' }, { text: '⚙️ Sozlamalar' }]
    ];
    
    await bot.sendMessage(chatId, 'Xush kelibsiz!', {
      reply_markup: { 
        keyboard: mainKeyboard, 
        resize_keyboard: true, 
        persistent: true 
      }
    });
    return;
  }
  
  // Создаем новую сессию регистрации
  const session = new RegistrationSession(chatId, telegramId);
  registrationSessions.set(chatId, session);
  
  await askName(chatId);
});

// Шаг 1: Имя
async function askName(chatId) {
  await sendQuestion(chatId, "👋 Salom! Ismingiz nima?");
}

// Шаг 2: Пол
async function askGender(chatId, messageId = null) {
  const keyboard = [
    [
      { text: 'Erkak', callback_data: 'gender:Erkak' },
      { text: 'Ayol', callback_data: 'gender:Ayol' }
    ]
  ];
  
  if (messageId) {
    await editToNext(chatId, messageId, "Jinsingizni tanlang:", keyboard);
  } else {
    await sendQuestion(chatId, "Jinsingizni tanlang:", keyboard);
  }
}

// Шаг 3: Год рождения
async function askBirthYear(chatId, messageId = null) {
  const text = "📅 Tug'ilgan yilingiz kiriting: \n\nMasalan 2006";
  
  if (messageId) {
    await editToNext(chatId, messageId, text);
  } else {
    await sendQuestion(chatId, text);
  }
}

// Шаг 4: Город
async function askCity(chatId, messageId = null) {
  const keyboard = [
    [
      { text: "Toshkent sh.", callback_data: "city:Toshkent sh." },
      { text: "Toshkent viloyati", callback_data: "city:Toshkent viloyati" }
    ],
    [
      { text: "Andijon", callback_data: "city:Andijon" },
      { text: "Buxoro", callback_data: "city:Buxoro" }
    ],
    [
      { text: "Farg'ona", callback_data: "city:Farg'ona" },
      { text: "Jizzax", callback_data: "city:Jizzax" }
    ],
    [
      { text: "Namangan", callback_data: "city:Namangan" },
      { text: "Navoiy", callback_data: "city:Navoiy" }
    ],
    [
      { text: "Qashqadaryo", callback_data: "city:Qashqadaryo" },
      { text: "Samarqand", callback_data: "city:Samarqand" }
    ],
    [
      { text: "Sirdaryo", callback_data: "city:Sirdaryo" },
      { text: "Surxondaryo", callback_data: "city:Surxondaryo" }
    ],
    [
      { text: "Qoraqalpog'iston", callback_data: "city:Qoraqalpog'iston" },
      { text: "Boshqa", callback_data: "city:other" }
    ]
  ];
  
  if (messageId) {
    await editToNext(chatId, messageId, "Shahar yoki viloyatni tanlang:", keyboard);
  } else {
    await sendQuestion(chatId, "Shahar yoki viloyatni tanlang:", keyboard);
  }
}

// Шаг 5: Семейное положение
async function askMaritalStatus(chatId, messageId = null) {
  const keyboard = [
    [
      { text: "Oila qurmagan", callback_data: 'maritalStatus:Yolg\'iz' }
    ],
    [
      { text: "Beva", callback_data: 'maritalStatus:Beva' },
      { text: "Ajrashgan", callback_data: 'maritalStatus:Ajrashgan' }
    ]
  ];
  
  if (messageId) {
    await editToNext(chatId, messageId, "Oilaviy holat:", keyboard);
  } else {
    await sendQuestion(chatId, "Oilaviy holat:", keyboard);
  }
}

// Шаг 6: Номер телефона
async function askPhone(chatId, messageId = null) {
  const keyboard = [
    [
      { text: "📱 Raqamni ulashish", request_contact: true }
    ]
  ];
  
  const text = "📱 Telefon raqamingizni ulashing:";
  
  // Всегда отправляем новое сообщение для клавиатуры с контактом
  await bot.sendMessage(chatId, text, {
    reply_markup: { keyboard: keyboard, resize_keyboard: true, one_time_keyboard: true }
  });
}

// Шаг 7: Фото
async function askPhoto(chatId, messageId = null) {
  const text = "📸 Rasmingizni yuboring (bitta rasm):";
  
  await bot.sendMessage(chatId, text, { reply_markup: { remove_keyboard: true } });
}

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return; // Игнорируем команды
  
  const chatId = msg.chat.id;
  const session = registrationSessions.get(chatId);
  
  // Обработка команд от главного меню
  if (!session && msg.text) {
    switch (msg.text) {
      case '👀 Qidiruv':
        await browsePeople(msg);
        return;
      case '❤️ Mening layklarim':
        await showLikes(msg);
        return;
      case '👤 Profil':
        await showProfile(msg);
        return;
      case '⚙️ Sozlamalar':
        await showSettings(msg);
        return;
      case '❤️ Layk':
        await handleLike(msg);
        return;
      case '⏭ O\'tkazib yuborish':
        await handleSkip(msg);
        return;
    }
  }
  
  if (!session) return;
  
  switch (session.step) {
    case 'name':
      if (msg.text && msg.text.length > 0) {
        session.data.name = msg.text;
        session.step = 'gender';
        await askGender(chatId);
      } else {
        await bot.sendMessage(chatId, "Iltimos, ismingizni kiriting:");
      }
      break;
      
    case 'birthYear':
      const year = parseInt(msg.text);
      const currentYear = new Date().getFullYear();
      if (year && year >= 1940 && year <= currentYear - 16) {
        session.data.age = currentYear - year;
        session.data.birthYear = year;
        session.step = 'city';
        await askCity(chatId);
      } else {
        await bot.sendMessage(chatId, "Iltimos, to'g'ri tug'ilgan yilingizni kiriting (16 yoshdan katta bo'lishingiz kerak):");
      }
      break;
      
    case 'phone':
      if (msg.contact) {
        session.data.phone = msg.contact.phone_number;
        session.step = 'photo';
        await askPhoto(chatId);
      } else if (msg.text && /^(\+998|998|8)?[0-9]{9}$/.test(msg.text.replace(/[\s\-\(\)]/g, ''))) {
        session.data.phone = msg.text;
        session.step = 'photo';
        await askPhoto(chatId);
      } else {
        await bot.sendMessage(chatId, "Iltimos, to'g'ri telefon raqamini yuboring yoki tugmani ishlating:");
      }
      break;
      
    case 'photo':
      if (msg.photo && msg.photo.length > 0) {
        session.data.photo = msg.photo[msg.photo.length - 1].file_id;
        await completeRegistration(session);
      } else {
        await bot.sendMessage(chatId, "Iltimos, rasmingizni yuboring:");
      }
      break;
  }
});

// Обработка callback запросов
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const session = registrationSessions.get(chatId);
  
  if (!session) return;
  
  const [action, value] = query.data.split(':');
  
  switch (action) {
    case 'gender':
      session.data.gender = value;
      session.step = 'birthYear';
      await askBirthYear(chatId, messageId);
      break;
      
    case 'city':
      if (value === 'other') {
        await bot.editMessageText("Shaharingiz nomini yozing:", {
          chat_id: chatId,
          message_id: messageId
        });
        session.step = 'cityCustom';
      } else {
        session.data.city = value;
        session.step = 'maritalStatus';
        await askMaritalStatus(chatId, messageId);
      }
      break;
      
    case 'maritalStatus':
      session.data.maritalStatus = value;
      session.step = 'phone';
      await askPhone(chatId);
      break;
  }
  
  // Если это не обработка регистрации, проверяем действия в browse
  if (action === 'like' || action === 'skip') {
    // Эти действия теперь обрабатываются через keyboard кнопки
    return;
  }
  
  await bot.answerCallbackQuery(query.id);
});

// Обработка кастомного города
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const session = registrationSessions.get(chatId);
  
  if (session && session.step === 'cityCustom' && msg.text) {
    session.data.city = msg.text;
    session.step = 'maritalStatus';
    await askMaritalStatus(chatId);
  }
  
  // Обработка возврата в главное меню
  if (msg.text === '🏠 Bosh menyu') {
    const user = await User.findOne({ telegramId: msg.from.id.toString() });
    if (user && user.registered) {
      const mainKeyboard = [
        [{ text: '👀 Qidiruv' }, { text: '❤️ Mening layklarim' }],
        [{ text: '👤 Profil' }, { text: '⚙️ Sozlamalar' }]
      ];
      
      await bot.sendMessage(chatId, 'Bosh menyu', {
        reply_markup: { 
          keyboard: mainKeyboard, 
          resize_keyboard: true, 
          persistent: true 
        }
      });
    }
  }
});

// Завершение регистрации
async function completeRegistration(session) {
  try {
    const newUser = new User({
      telegramId: session.telegramId,
      name: session.data.name,
      age: session.data.age,
      birthYear: session.data.birthYear,
      gender: session.data.gender,
      city: session.data.city,
      maritalStatus: session.data.maritalStatus,
      phone: session.data.phone,
      photo: session.data.photo,
      registered: true,
      liked: [],
      matches: []
    });
    
    await newUser.save();
    
    await bot.sendMessage(session.chatId, 
      `✅ Ro'yxatdan o'tish yakunlandi! 🔥\n\n` +
      `📋 Sizning ma'lumotlaringiz:\n` +
      `👤 Ism: ${session.data.name}\n` +
      `🎂 Yosh: ${session.data.age}\n` +
      `👫 Jins: ${session.data.gender}\n` +
      `🏙 Shahar: ${session.data.city}\n` +
      `💑 Oilaviy holat: ${session.data.maritalStatus}\n\n` +
      `Qidiruv boshlash uchun "Qidiruv" tugmasini bosing!`,
      {
        reply_markup: { 
          keyboard: [
            [{ text: '👀 Qidiruv' }, { text: '❤️ Mening layklarim' }],
            [{ text: '👤 Profil' }, { text: '⚙️ Sozlamalar' }]
          ], 
          resize_keyboard: true, 
          persistent: true 
        }
      }
    );
    await bot.sendMessage(process.env.ADMIN_TELEGRAM_ID, `${session.data.name} anketani toliq toldirdi`)
    
    registrationSessions.delete(session.chatId);
  } catch (error) {
    console.error('Ошибка при сохранении пользователя:', error);
    await bot.sendMessage(session.chatId, 'Xatolik yuz berdi. Qaytadan urinib ko\'ring /start');
  }
}

// Вспомогательные методы

console.log('Бот запущен!');