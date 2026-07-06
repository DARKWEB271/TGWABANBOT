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
// WHATSAPP REPORTING ENGINE
// ============================================================

class WhatsAppReporter {
    constructor() {
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
        ];
    }

    formatNumber(number) {
        number = number.toString().trim().replace(/[^0-9+]/g, '');
        if (number.startsWith('0')) number = '92' + number.substring(1);
        if (!number.startsWith('+')) number = '+' + number;
        return number;
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    async reportViaWeb(number) {
        try {
            const response = await axios.post(
                'https://web.whatsapp.com/security/report',
                { phone: number, reason: 'spam' },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch { return false; }
    }

    async reportViaAPI(number) {
        try {
            const response = await axios.post(
                'https://api.whatsapp.com/v1/report',
                { phone: number, reason: 'spam' },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch { return false; }
    }

    async reportViaBusiness(number) {
        try {
            const response = await axios.post(
                'https://business.whatsapp.com/report',
                { phone: number, reason: 'spam' },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch { return false; }
    }

    async reportViaCommunity(number) {
        try {
            const response = await axios.post(
                'https://www.whatsapp.com/community/report',
                { phone: number, reason: 'spam' },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch { return false; }
    }

    async reportNumber(number) {
        const formatted = this.formatNumber(number);
        const methods = [
            this.reportViaWeb.bind(this),
            this.reportViaAPI.bind(this),
            this.reportViaBusiness.bind(this),
            this.reportViaCommunity.bind(this)
        ];

        const results = [];
        for (const method of methods) {
            try {
                const success = await method(formatted);
                results.push(success);
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
            } catch {
                results.push(false);
            }
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
        const formatted = this.formatNumber(number);
        const results = [];
        const maxCount = Math.min(count, 20);

        for (let i = 0; i < maxCount; i++) {
            const result = await this.reportNumber(formatted);
            results.push(result);
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        }

        const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
        const totalAttempts = results.reduce((sum, r) => sum + r.total, 0);

        return {
            total: totalAttempts,
            success: totalSuccess,
            failed: totalAttempts - totalSuccess,
            successRate: (totalSuccess / totalAttempts) * 100,
            rounds: results.length
        };
    }
}

// ============================================================
// EXPRESS APP
// ============================================================

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// TELEGRAM BOT
// ============================================================

let bot;
let botInitialized = false;

// ============================================================
// WEBHOOK ENDPOINT
// ============================================================

app.post('/webhook', (req, res) => {
    try {
        if (bot) {
            bot.processUpdate(req.body);
        }
        res.sendStatus(200);
    } catch (error) {
        logger.error(`Webhook error: ${error.message}`);
        res.sendStatus(500);
    }
});

// ============================================================
// HEALTH CHECK
// ============================================================

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
// INIT BOT
// ============================================================

async function initBot() {
    if (botInitialized) return;
    
    try {
        bot = new TelegramBot(BOT_TOKEN);
        
        const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}/webhook`;
        await bot.setWebHook(webhookUrl);
        
        botInitialized = true;
        logger.info(`Bot initialized with webhook: ${webhookUrl}`);
        setupBotHandlers();
    } catch (error) {
        logger.error(`Bot init error: ${error.message}`);
        setTimeout(initBot, 10000);
    }
}

// ============================================================
// BOT HANDLERS (NO MARKDOWN — Pure Text + HTML)
// ============================================================

function setupBotHandlers() {
    if (!bot) return;

    // ============================================================
    // START COMMAND
    // ============================================================
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';

        if (!userStatus[userId]) stats.totalUsers++;
        userStatus[userId] = userStatus[userId] || {};

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
            `🔒 GURU WA BAN BOT\n\nWelcome ${firstName}!\n\n⚠️ Please join our channels:\n📢 @digitaldon247\n📢 @digitaldon241\n\nAfter joining, click "I Have Joined"`,
            { reply_markup: keyboard }
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
                `👑 GURU WA BAN BOT\n\nWelcome ${query.from.first_name}!\n\n🔥 Features:\n• Report WhatsApp numbers\n• Mass reporting (up to 20x)\n• 4 reporting methods\n• Real-time status\n\n📡 Powered by GURU TALHA`,
                { reply_markup: keyboard }
            );
            return;
        }

        switch (data) {
            case 'report':
                await bot.sendMessage(chatId, `📱 Report a number:\nUse: /report +923001234567`);
                break;
            case 'status':
                await bot.sendMessage(chatId, `📊 Check status:\nUse: /status +923001234567`);
                break;
            case 'stats':
                await bot.sendMessage(chatId, 
                    `📊 Stats\n👥 Users: ${stats.totalUsers}\n📱 Reports: ${stats.totalReports}\n✅ Bans: ${stats.totalBans}`
                );
                break;
            case 'help':
                await bot.sendMessage(chatId,
                    `ℹ️ Commands\n/start - Menu\n/report <number> - Report\n/mass <number> <count> - Mass\n/status <number> - Check\n/stats - Stats\n/ban <number> - Quick ban`
                );
                break;
            default:
                await bot.sendMessage(chatId, '❌ Unknown command');
        }
    });

    // ============================================================
    // COMMANDS
    // ============================================================
    
    bot.onText(/\/report (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        await processReport(chatId, match[1].trim());
    });

    bot.onText(/\/mass (.+) (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const count = parseInt(match[2]);
        if (count > 20) {
            await bot.sendMessage(chatId, '❌ Max count is 20');
            return;
        }
        await processMassReport(chatId, match[1].trim(), count);
    });

    bot.onText(/\/status (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const number = match[1].trim();
        if (reportedNumbers[number]) {
            const data = reportedNumbers[number];
            await bot.sendMessage(chatId,
                `📱 ${number}\n✅ Success: ${data.successCount}/${data.totalAttempts}\n📊 Status: ${data.status}`
            );
        } else {
            await bot.sendMessage(chatId, `❌ ${number} not found`);
        }
    });

    bot.onText(/\/ban (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        await processReport(chatId, match[1].trim());
    });

    bot.onText(/\/stats/, async (msg) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(chatId,
            `📊 Stats\n👥 Users: ${stats.totalUsers}\n📱 Reports: ${stats.totalReports}\n✅ Bans: ${stats.totalBans}`
        );
    });
}

// ============================================================
// PROCESSING FUNCTIONS
// ============================================================

async function processReport(chatId, number) {
    const reporter = new WhatsAppReporter();
    const msg = await bot.sendMessage(chatId, `🔄 Reporting ${number}...`);

    const result = await reporter.reportNumber(number);
    stats.totalReports++;
    if (result.success > 0) stats.totalBans++;

    reportedNumbers[number] = {
        reportedAt: new Date().toISOString(),
        successCount: result.success,
        totalAttempts: result.total,
        status: result.success > 0 ? 'banned' : 'pending'
    };

    await bot.editMessageText(
        `✅ Report Complete!\n📱 ${number}\n📊 Success: ${result.success}/${result.total}\n📈 Rate: ${result.successRate.toFixed(1)}%\n💡 Status: ${result.success > 0 ? '✅ BANNED' : '⏳ Pending'}`,
        {
            chat_id: chatId,
            message_id: msg.message_id
        }
    );
}

async function processMassReport(chatId, number, count) {
    const reporter = new WhatsAppReporter();
    const msg = await bot.sendMessage(chatId, `🔄 Mass reporting ${number} (${count}x)...`);

    const result = await reporter.massReport(number, count);
    stats.totalReports++;
    if (result.success > 0) stats.totalBans++;

    await bot.editMessageText(
        `✅ Mass Report Complete!\n📱 ${number}\n📊 Success: ${result.success}/${result.total}\n📈 Rate: ${result.successRate.toFixed(1)}%\n🔄 Rounds: ${result.rounds}`,
        {
            chat_id: chatId,
            message_id: msg.message_id
        }
    );
}

// ============================================================
// START SERVER
// ============================================================

const server = app.listen(PORT, async () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`👑 GURU WA BAN BOT`);
    logger.info(`📡 Powered by GURU TALHA`);
    
    await initBot();
});

process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    if (bot) {
        bot.deleteWebHook().catch(() => {});
    }
    server.close(() => process.exit(0));
});

process.on('uncaughtException', (error) => {
    logger.error(`Uncaught: ${error.message}`);
});

process.on('unhandledRejection', (error) => {
    logger.error(`Unhandled: ${error}`);
});
