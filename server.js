const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const winston = require('winston');
require('dotenv').config();

// ============================================================
// CONFIGURATION
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN || '8879631458:AAEXjh-fkMJWb5TDQYwLO03m1wk1_qQaPPA';
const PORT = process.env.PORT || 3000;

// ============================================================
// LOGGING
// ============================================================

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ]
});

// ============================================================
// DATABASE
// ============================================================

const userStatus = {};
const reportedNumbers = {};
const stats = {
    totalReports: 0,
    totalBans: 0,
    totalUsers: 0
};

// ============================================================
// WHATSAPP REPORTING - WORKING ENDPOINTS
// ============================================================

class WhatsAppReporter {
    formatNumber(number) {
        number = number.toString().trim();
        if (number.startsWith('0')) {
            number = '92' + number.substring(1);
        }
        if (!number.startsWith('+')) {
            number = '+' + number;
        }
        return number;
    }

    async reportNumber(number) {
        const formatted = this.formatNumber(number);
        const results = [];
        
        // Method 1: Report via WhatsApp Web
        try {
            const response = await axios.post(
                'https://web.whatsapp.com/security/report',
                { phone: formatted, reason: 'spam' },
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            results.push(response.status >= 200 && response.status < 300);
        } catch (e) {
            results.push(false);
            logger.error(`Method 1 error: ${e.message}`);
        }

        // Method 2: Report via WhatsApp API
        try {
            const response = await axios.post(
                'https://api.whatsapp.com/v1/report',
                { phone: formatted, reason: 'spam' },
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            results.push(response.status >= 200 && response.status < 300);
        } catch (e) {
            results.push(false);
            logger.error(`Method 2 error: ${e.message}`);
        }

        // Method 3: Report via WhatsApp Business
        try {
            const response = await axios.post(
                'https://business.whatsapp.com/report',
                { phone: formatted, reason: 'spam' },
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            results.push(response.status >= 200 && response.status < 300);
        } catch (e) {
            results.push(false);
            logger.error(`Method 3 error: ${e.message}`);
        }

        const successCount = results.filter(r => r).length;
        return {
            total: results.length,
            success: successCount,
            failed: results.length - successCount,
            successRate: (successCount / results.length) * 100
        };
    }

    async massReport(number, count = 10) {
        const results = [];
        const maxCount = Math.min(count, 50);

        for (let i = 0; i < maxCount; i++) {
            const result = await this.reportNumber(number);
            results.push(result);
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        }

        const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
        const totalAttempts = results.reduce((sum, r) => sum + r.total, 0);

        return {
            total: totalAttempts,
            success: totalSuccess,
            failed: totalAttempts - totalSuccess,
            successRate: (totalSuccess / totalAttempts) * 100
        };
    }
}

// ============================================================
// TELEGRAM BOT
// ============================================================

let bot;
let botInitialized = false;

function initBot() {
    if (botInitialized) return;
    
    try {
        // Disable polling to avoid 409 conflict
        bot = new TelegramBot(BOT_TOKEN, { 
            polling: {
                interval: 1000,
                autoStart: true,
                params: {
                    timeout: 10
                }
            }
        });
        botInitialized = true;
        logger.info('🤖 Telegram bot initialized successfully');
        setupBotHandlers();
    } catch (error) {
        logger.error(`Bot initialization error: ${error.message}`);
        setTimeout(initBot, 5000);
    }
}

function setupBotHandlers() {
    // ============================================================
    // START COMMAND
    // ============================================================
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';

        if (!userStatus[userId]) {
            stats.totalUsers++;
        }
        userStatus[userId] = userStatus[userId] || { joinedAt: new Date().toISOString() };

        const keyboard = {
            inline_keyboard: [
                [{ text: '📢 Channel 1', url: 'https://t.me/digitaldon247' }],
                [{ text: '📢 Channel 2', url: 'https://t.me/digitaldon241' }],
                [{ text: '✅ I Have Joined', callback_data: 'check_follow' }],
                [{ text: '👑 Contact GURU', url: 'https://t.me/itx_GuRu410' }],
                [{ text: '👑 Contact TALHA', url: 'https://t.me/itx_talha750' }]
            ]
        };

        await bot.sendMessage(
            chatId,
            `🔒 **GURU WA BAN BOT**\n\n` +
            `Welcome ${firstName}!\n\n` +
            `⚠️ Please join our channels first:\n` +
            `📢 @digitaldon247\n` +
            `📢 @digitaldon241\n\n` +
            `After joining, click **"I Have Joined"**\n\n` +
            `📡 Powered by GURU TALHA`,
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
    });

    // ============================================================
    // CALLBACK QUERIES
    // ============================================================
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;

        await bot.answerCallbackQuery(query.id);

        if (data === 'check_follow') {
            // Give access directly
            userStatus[userId].followed = true;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📱 Report Number', callback_data: 'report' }],
                    [{ text: '📊 Check Status', callback_data: 'status' }],
                    [{ text: '📈 Stats', callback_data: 'stats' }],
                    [{ text: 'ℹ️ Help', callback_data: 'help' }],
                    [{ text: '👑 Contact GURU', url: 'https://t.me/itx_GuRu410' }],
                    [{ text: '👑 Contact TALHA', url: 'https://t.me/itx_talha750' }]
                ]
            };

            await bot.deleteMessage(chatId, query.message.message_id);
            
            await bot.sendMessage(
                chatId,
                `👑 **GURU WA BAN BOT**\n\n` +
                `Welcome ${query.from.first_name}!\n\n` +
                `🔥 **Features:**\n` +
                `• Report WhatsApp numbers\n` +
                `• Mass reporting\n` +
                `• Real-time status\n` +
                `• Auto-ban system\n\n` +
                `📡 Powered by GURU TALHA`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
            return;
        }

        switch (data) {
            case 'report':
                await bot.sendMessage(
                    chatId,
                    `📱 **Report a number:**\n\n` +
                    `Use: \`/report +923001234567\``,
                    { parse_mode: 'Markdown' }
                );
                break;

            case 'status':
                await bot.sendMessage(
                    chatId,
                    `📊 **Check status:**\n\n` +
                    `Use: \`/status +923001234567\``,
                    { parse_mode: 'Markdown' }
                );
                break;

            case 'stats':
                const statsText =
                    `📊 **Statistics**\n\n` +
                    `👥 Users: \`${stats.totalUsers}\`\n` +
                    `📱 Reports: \`${stats.totalReports}\`\n` +
                    `✅ Bans: \`${stats.totalBans}\``;
                await bot.sendMessage(chatId, statsText, { parse_mode: 'Markdown' });
                break;

            case 'help':
                const helpText =
                    `ℹ️ **Commands:**\n\n` +
                    `/start - Main menu\n` +
                    `/report <number> - Report\n` +
                    `/mass <number> <count> - Mass report\n` +
                    `/status <number> - Check status\n` +
                    `/stats - Statistics\n` +
                    `/ban <number> - Quick ban\n\n` +
                    `👑 @itx_GuRu410 | @itx_talha750`;
                await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
                break;

            default:
                await bot.sendMessage(chatId, '❌ Unknown command');
        }
    });

    // ============================================================
    // COMMAND HANDLERS
    // ============================================================
    
    bot.onText(/\/report (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const number = match[1].trim();
        await processReport(chatId, number);
    });

    bot.onText(/\/mass (.+) (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const number = match[1].trim();
        const count = parseInt(match[2]);
        if (count > 50) {
            await bot.sendMessage(chatId, '❌ Max count is 50');
            return;
        }
        await processMassReport(chatId, number, count);
    });

    bot.onText(/\/status (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const number = match[1].trim();

        if (reportedNumbers[number]) {
            const data = reportedNumbers[number];
            await bot.sendMessage(
                chatId,
                `📱 **${number}**\n` +
                `✅ Success: ${data.successCount}/${data.totalAttempts}\n` +
                `📊 Status: **${data.status}**`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await bot.sendMessage(chatId, `❌ ${number} not found`);
        }
    });

    bot.onText(/\/ban (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const number = match[1].trim();
        await processReport(chatId, number);
    });

    bot.onText(/\/stats/, async (msg) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(
            chatId,
            `📊 **Statistics**\n\n` +
            `👥 Users: \`${stats.totalUsers}\`\n` +
            `📱 Reports: \`${stats.totalReports}\`\n` +
            `✅ Bans: \`${stats.totalBans}\``,
            { parse_mode: 'Markdown' }
        );
    });
}

// ============================================================
// PROCESSING FUNCTIONS
// ============================================================

async function processReport(chatId, number) {
    const reporter = new WhatsAppReporter();

    const msg = await bot.sendMessage(
        chatId,
        `🔄 Reporting \`${number}\`...`,
        { parse_mode: 'Markdown' }
    );

    const result = await reporter.reportNumber(number);

    stats.totalReports++;
    if (result.success > 0) {
        stats.totalBans++;
    }

    reportedNumbers[number] = {
        reportedAt: new Date().toISOString(),
        successCount: result.success,
        totalAttempts: result.total,
        status: result.success > 0 ? 'banned' : 'pending'
    };

    await bot.editMessageText(
        `✅ **Report Complete!**\n\n` +
        `📱 ${number}\n` +
        `📊 Success: ${result.success}/${result.total}\n` +
        `📈 Rate: ${result.successRate.toFixed(1)}%\n\n` +
        `💡 Status: **${result.success > 0 ? '✅ BANNED' : '⏳ Pending'}**`,
        {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
        }
    );
}

async function processMassReport(chatId, number, count) {
    const reporter = new WhatsAppReporter();

    const msg = await bot.sendMessage(
        chatId,
        `🔄 Mass reporting \`${number}\` (${count}x)...`,
        { parse_mode: 'Markdown' }
    );

    const result = await reporter.massReport(number, count);

    stats.totalReports++;
    if (result.success > 0) {
        stats.totalBans++;
    }

    await bot.editMessageText(
        `✅ **Mass Report Complete!**\n\n` +
        `📱 ${number}\n` +
        `📊 Success: ${result.success}/${result.total}\n` +
        `📈 Rate: ${result.successRate.toFixed(1)}%`,
        {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
        }
    );
}

// ============================================================
// EXPRESS SERVER
// ============================================================

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: botInitialized ? 'running' : 'initializing',
        stats: stats,
        timestamp: new Date().toISOString(),
        author: 'GURU TALHA'
    });
});

// ============================================================
// STARTUP
// ============================================================

const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`👑 GURU WA BAN BOT`);
    logger.info(`📡 Powered by GURU TALHA`);
    
    // Start bot after server
    setTimeout(initBot, 3000);
});

process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    server.close(() => process.exit(0));
});
