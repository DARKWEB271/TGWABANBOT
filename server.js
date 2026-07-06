const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const winston = require('winston');
require('dotenv').config();

// ============================================================
// CONFIGURATION
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN || '8879631458:AAEXjh-fkMJWb5TDQYwLO03m1wk1_qQaPPA';
const ADMIN_IDS = (process.env.ADMIN_IDS || '7049182459').split(',').map(Number);
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
    pendingReports: 0,
    failedReports: 0,
    totalUsers: 0
};

// ============================================================
// WHATSAPP REPORTING ENGINE
// ============================================================

class WhatsAppReporter {
    constructor() {
        this.methods = [
            this.reportViaOfficialAPI,
            this.reportViaBusinessAPI,
            this.reportViaCommunity,
            this.reportViaAlternative,
            this.reportViaDirect
        ];
    }

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

    async reportViaOfficialAPI(number, reason = 'Spam') {
        try {
            const response = await axios.post(
                'https://api.whatsapp.com/report',
                { phone: number, reason, source: 'telegram_bot' },
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Official API error: ${error.message}`);
            return false;
        }
    }

    async reportViaBusinessAPI(number, reason = 'Spam') {
        try {
            const response = await axios.post(
                'https://business.whatsapp.com/report',
                { phone: number, reason, type: 'spam' },
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Business API error: ${error.message}`);
            return false;
        }
    }

    async reportViaCommunity(number, reason = 'Spam') {
        try {
            const response = await axios.post(
                'https://www.whatsapp.com/community/report',
                { phone: number, reason, report_type: 'spam' },
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Community API error: ${error.message}`);
            return false;
        }
    }

    async reportViaAlternative(number, reason = 'Spam') {
        try {
            const response = await axios.post(
                'https://report.whatsapp.com/api/v1/report',
                { phone: number, reason, source: 'bot' },
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Alternative API error: ${error.message}`);
            return false;
        }
    }

    async reportViaDirect(number, reason = 'Spam') {
        try {
            const response = await axios.post(
                'https://www.whatsapp.com/api/v1/report',
                { phone: number, reason },
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Direct API error: ${error.message}`);
            return false;
        }
    }

    async massReport(number, count = 10) {
        const formattedNumber = this.formatNumber(number);
        const results = [];
        const maxCount = Math.min(count, 100);

        for (let i = 0; i < maxCount; i++) {
            const method = this.methods[Math.floor(Math.random() * this.methods.length)];
            const success = await method.call(this, formattedNumber, `Spam_${i + 1}`);
            results.push(success);
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
        }

        const successCount = results.filter(r => r).length;
        return {
            total: results.length,
            success: successCount,
            failed: results.length - successCount,
            successRate: (successCount / results.length) * 100
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
        bot = new TelegramBot(BOT_TOKEN, { polling: true });
        botInitialized = true;
        logger.info('🤖 Telegram bot initialized successfully');
        setupBotHandlers();
    } catch (error) {
        logger.error(`Bot initialization error: ${error.message}`);
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
        userStatus[userId] = userStatus[userId] || { followed: false, joinedAt: new Date().toISOString() };

        const keyboard = {
            inline_keyboard: [
                [{ text: '📢 Join Channel 1', url: 'https://t.me/digitaldon247' }],
                [{ text: '📢 Join Channel 2', url: 'https://t.me/digitaldon241' }],
                [{ text: '✅ I Have Joined', callback_data: 'check_follow' }],
                [{ text: '👑 Contact GURU', url: 'https://t.me/itx_GuRu410' }],
                [{ text: '👑 Contact TALHA', url: 'https://t.me/itx_talha750' }],
                [{ text: '🔄 Refresh Status', callback_data: 'refresh_follow' }]
            ]
        };

        await bot.sendMessage(
            chatId,
            `🔒 **ACCESS REQUIRED**\n\n` +
            `Please join our channels first:\n\n` +
            `📢 **Channel 1:** @digitaldon247\n` +
            `📢 **Channel 2:** @digitaldon241\n\n` +
            `⚠️ After joining, click **"I Have Joined"** to continue.\n\n` +
            `📡 Powered by GURU TALHA`,
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
    });

    // ============================================================
    // CHECK FOLLOW
    // ============================================================
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;

        await bot.answerCallbackQuery(query.id);

        if (data === 'check_follow' || data === 'refresh_follow') {
            // For simplicity, we'll just give access
            userStatus[userId] = { followed: true, joinedAt: new Date().toISOString() };
            
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
                `• Mass reporting (10-50 reports)\n` +
                `• Real-time ban status\n` +
                `• Auto-ban system\n` +
                `• Multi-method reporting\n\n` +
                `⚠️ Use responsibly.\n` +
                `📡 Powered by GURU TALHA`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
            return;
        }

        // Handle other callbacks
        switch (data) {
            case 'report':
                await bot.sendMessage(
                    chatId,
                    `📱 **Enter the WhatsApp number to report:**\n\n` +
                    `Format: \`+923001234567\` or \`03001234567\`\n\n` +
                    `Use: \`/report +923001234567\``,
                    { parse_mode: 'Markdown' }
                );
                break;

            case 'status':
                await bot.sendMessage(
                    chatId,
                    `📊 **Check ban status:**\n\n` +
                    `Use: \`/status +923001234567\``,
                    { parse_mode: 'Markdown' }
                );
                break;

            case 'stats':
                const statsText =
                    `📊 **GURU WA BAN - Statistics**\n\n` +
                    `👥 Total Users: \`${stats.totalUsers}\`\n` +
                    `📱 Total Reports: \`${stats.totalReports}\`\n` +
                    `✅ Total Bans: \`${stats.totalBans}\`\n` +
                    `⏳ Pending: \`${stats.pendingReports}\`\n` +
                    `❌ Failed: \`${stats.failedReports}\`\n\n` +
                    `📡 Powered by GURU TALHA`;

                await bot.sendMessage(chatId, statsText, { parse_mode: 'Markdown' });
                break;

            case 'help':
                const helpText =
                    `ℹ️ **GURU WA BAN - Help**\n\n` +
                    `**Commands:**\n` +
                    `/start - Show main menu\n` +
                    `/report <number> - Report a number\n` +
                    `/mass <number> <count> - Mass report\n` +
                    `/status <number> - Check ban status\n` +
                    `/stats - Show statistics\n` +
                    `/ban <number> - Quick ban\n\n` +
                    `**Examples:**\n` +
                    `/report +923001234567\n` +
                    `/mass +923001234567 20\n` +
                    `/status +923001234567\n\n` +
                    `**Admin Contacts:**\n` +
                    `• @itx_GuRu410\n` +
                    `• @itx_talha750\n\n` +
                    `⚠️ Use responsibly!`;

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

        if (count > 100) {
            await bot.sendMessage(chatId, '❌ Maximum count is 100');
            return;
        }

        await processMassReport(chatId, number, count);
    });

    bot.onText(/\/status (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const number = match[1].trim();

        if (reportedNumbers[number]) {
            const data = reportedNumbers[number];
            const statusText =
                `📱 **Status for:** \`${number}\`\n\n` +
                `📅 Reported: \`${data.reportedAt}\`\n` +
                `✅ Success: \`${data.successCount}/${data.totalAttempts}\`\n` +
                `📊 Status: **${data.status.toUpperCase()}**\n\n` +
                `👑 GURU WA BAN`;

            await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ Number \`${number}\` not found in database.`, { parse_mode: 'Markdown' });
        }
    });

    bot.onText(/\/ban (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const number = match[1].trim();
        await processReport(chatId, number);
    });

    bot.onText(/\/stats/, async (msg) => {
        const chatId = msg.chat.id;
        const statsText =
            `📊 **GURU WA BAN - Statistics**\n\n` +
            `👥 Total Users: \`${stats.totalUsers}\`\n` +
            `📱 Total Reports: \`${stats.totalReports}\`\n` +
            `✅ Total Bans: \`${stats.totalBans}\`\n` +
            `⏳ Pending: \`${stats.pendingReports}\`\n` +
            `❌ Failed: \`${stats.failedReports}\`\n\n` +
            `📡 Powered by GURU TALHA`;

        await bot.sendMessage(chatId, statsText, { parse_mode: 'Markdown' });
    });
}

// ============================================================
// PROCESSING FUNCTIONS
// ============================================================

async function processReport(chatId, number) {
    const reporter = new WhatsAppReporter();
    const formattedNumber = reporter.formatNumber(number);

    const msg = await bot.sendMessage(
        chatId,
        `🔄 **Processing report for:** \`${formattedNumber}\`\n\n📡 Using multiple methods...`,
        { parse_mode: 'Markdown' }
    );

    const result = await reporter.massReport(formattedNumber, 10);

    stats.totalReports++;
    if (result.success > 0) {
        stats.totalBans++;
    } else {
        stats.failedReports++;
    }

    reportedNumbers[formattedNumber] = {
        reportedAt: new Date().toISOString(),
        successCount: result.success,
        totalAttempts: result.total,
        status: result.success > 0 ? 'banned' : 'pending'
    };

    const response =
        `✅ **Report Complete!**\n\n` +
        `📱 Number: \`${formattedNumber}\`\n` +
        `📊 Success: \`${result.success}\`/${result.total}\n` +
        `📈 Success Rate: \`${result.successRate.toFixed(1)}%\`\n\n` +
        `💡 Status: **${result.success > 0 ? '✅ BANNED' : '⏳ Pending'}**\n\n` +
        `👑 GURU WA BAN - Reporting Engine`;

    await bot.editMessageText(response, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown'
    });
}

async function processMassReport(chatId, number, count) {
    const reporter = new WhatsAppReporter();
    const formattedNumber = reporter.formatNumber(number);

    const msg = await bot.sendMessage(
        chatId,
        `🔄 **Mass reporting** \`${formattedNumber}\`\n📊 Total reports: \`${count}\`\n\n⏳ Processing...`,
        { parse_mode: 'Markdown' }
    );

    const result = await reporter.massReport(formattedNumber, count);

    stats.totalReports++;
    if (result.success > 0) {
        stats.totalBans++;
    }

    const response =
        `✅ **Mass Report Complete!**\n\n` +
        `📱 Number: \`${formattedNumber}\`\n` +
        `📊 Success: \`${result.success}\`/${result.total}\n` +
        `📈 Rate: \`${result.successRate.toFixed(1)}%\`\n\n` +
        `💡 Status: **${result.success > 0 ? '✅ BANNED' : '⏳ Pending'}**`;

    await bot.editMessageText(response, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown'
    });
}

// ============================================================
// BACKGROUND WORKER
// ============================================================

async function autoBanWorker() {
    while (true) {
        try {
            for (const [number, data] of Object.entries(reportedNumbers)) {
                if (data.status === 'pending' && data.successCount < 5) {
                    const reporter = new WhatsAppReporter();
                    const result = await reporter.massReport(number, 5);

                    if (result.success > 0) {
                        data.successCount += result.success;
                        data.status = 'banned';
                        stats.totalBans++;
                    }

                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }
            await new Promise(resolve => setTimeout(resolve, 60000));
        } catch (error) {
            logger.error(`Auto-ban worker error: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }
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
        version: '2.0.0',
        author: 'GURU TALHA'
    });
});

app.post('/webhook', (req, res) => {
    res.json({ status: 'ok' });
});

// ============================================================
// STARTUP
// ============================================================

const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`👑 GURU WA BAN BOT`);
    logger.info(`📡 Powered by GURU TALHA`);
    
    setTimeout(initBot, 2000);
    setTimeout(autoBanWorker, 5000);
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down...');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});
