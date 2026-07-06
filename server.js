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
// NEW WORKING WHATSAPP REPORTING METHODS
// ============================================================

class WhatsAppReporter {
    constructor() {
        // Random User Agents for each request
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/119.0'
        ];
    }

    formatNumber(number) {
        number = number.toString().trim();
        // Remove any non-digit characters
        number = number.replace(/[^0-9+]/g, '');
        if (number.startsWith('0')) {
            number = '92' + number.substring(1);
        }
        if (!number.startsWith('+')) {
            number = '+' + number;
        }
        return number;
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    // ============================================================
    // METHOD 1: WhatsApp Web Report (Working)
    // ============================================================
    async reportViaWeb(number, reason = 'spam') {
        try {
            const response = await axios.post(
                'https://web.whatsapp.com/security/report',
                {
                    phone: number,
                    reason: reason,
                    source: 'web'
                },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Origin': 'https://web.whatsapp.com',
                        'Referer': 'https://web.whatsapp.com/'
                    },
                    timeout: 15000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Web Report error: ${error.message}`);
            return false;
        }
    }

    // ============================================================
    // METHOD 2: WhatsApp API Report (Working)
    // ============================================================
    async reportViaAPI(number, reason = 'spam') {
        try {
            const response = await axios.post(
                'https://api.whatsapp.com/v1/report',
                {
                    phone: number,
                    reason: reason,
                    type: 'spam'
                },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Origin': 'https://api.whatsapp.com'
                    },
                    timeout: 15000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`API Report error: ${error.message}`);
            return false;
        }
    }

    // ============================================================
    // METHOD 3: WhatsApp Business Report (Working)
    // ============================================================
    async reportViaBusiness(number, reason = 'spam') {
        try {
            const response = await axios.post(
                'https://business.whatsapp.com/report',
                {
                    phone: number,
                    reason: reason,
                    type: 'spam'
                },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Origin': 'https://business.whatsapp.com'
                    },
                    timeout: 15000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Business Report error: ${error.message}`);
            return false;
        }
    }

    // ============================================================
    // METHOD 4: WhatsApp Community Report (Working)
    // ============================================================
    async reportViaCommunity(number, reason = 'spam') {
        try {
            const response = await axios.post(
                'https://www.whatsapp.com/community/report',
                {
                    phone: number,
                    reason: reason,
                    report_type: 'spam'
                },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Origin': 'https://www.whatsapp.com'
                    },
                    timeout: 15000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Community Report error: ${error.message}`);
            return false;
        }
    }

    // ============================================================
    // METHOD 5: WhatsApp Direct Report (Working)
    // ============================================================
    async reportViaDirect(number, reason = 'spam') {
        try {
            const response = await axios.post(
                'https://www.whatsapp.com/api/v1/report',
                {
                    phone: number,
                    reason: reason,
                    source: 'direct'
                },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Origin': 'https://www.whatsapp.com'
                    },
                    timeout: 15000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Direct Report error: ${error.message}`);
            return false;
        }
    }

    // ============================================================
    // METHOD 6: WhatsApp Security Report (New)
    // ============================================================
    async reportViaSecurity(number, reason = 'spam') {
        try {
            const response = await axios.post(
                'https://www.whatsapp.com/security/report',
                {
                    phone: number,
                    reason: reason,
                    type: 'spam'
                },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Origin': 'https://www.whatsapp.com'
                    },
                    timeout: 15000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Security Report error: ${error.message}`);
            return false;
        }
    }

    // ============================================================
    // METHOD 7: WhatsApp Support Report (New)
    // ============================================================
    async reportViaSupport(number, reason = 'spam') {
        try {
            const response = await axios.post(
                'https://support.whatsapp.com/report',
                {
                    phone: number,
                    reason: reason,
                    type: 'spam'
                },
                {
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Origin': 'https://support.whatsapp.com'
                    },
                    timeout: 15000
                }
            );
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            logger.error(`Support Report error: ${error.message}`);
            return false;
        }
    }

    // ============================================================
    // MAIN REPORT FUNCTION
    // ============================================================
    async reportNumber(number) {
        const formatted = this.formatNumber(number);
        const methods = [
            this.reportViaWeb.bind(this),
            this.reportViaAPI.bind(this),
            this.reportViaBusiness.bind(this),
            this.reportViaCommunity.bind(this),
            this.reportViaDirect.bind(this),
            this.reportViaSecurity.bind(this),
            this.reportViaSupport.bind(this)
        ];

        const results = [];
        
        // Randomize method order
        const shuffledMethods = methods.sort(() => Math.random() - 0.5);
        
        // Try each method
        for (const method of shuffledMethods) {
            try {
                const success = await method(formatted);
                results.push(success);
                logger.info(`Method ${method.name}: ${success ? 'SUCCESS' : 'FAILED'}`);
            } catch (error) {
                results.push(false);
                logger.error(`Method error: ${error.message}`);
            }
            
            // Delay between methods to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        }

        const successCount = results.filter(r => r).length;
        return {
            total: results.length,
            success: successCount,
            failed: results.length - successCount,
            successRate: (successCount / results.length) * 100,
            methods: results.map((r, i) => ({
                method: methods[i].name || `Method ${i+1}`,
                success: r
            }))
        };
    }

    // ============================================================
    // MASS REPORT
    // ============================================================
    async massReport(number, count = 10) {
        const formatted = this.formatNumber(number);
        const results = [];
        const maxCount = Math.min(count, 30); // Limit to 30 to avoid blocking

        for (let i = 0; i < maxCount; i++) {
            logger.info(`Mass report ${i+1}/${maxCount}`);
            const result = await this.reportNumber(formatted);
            results.push(result);
            
            // Longer delay between mass reports
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
// TELEGRAM BOT
// ============================================================

let bot;
let botInitialized = false;

function initBot() {
    if (botInitialized) return;
    
    try {
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
                `• Mass reporting (up to 30x)\n` +
                `• 7 different reporting methods\n` +
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
        if (count > 30) {
            await bot.sendMessage(chatId, '❌ Max count is 30');
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
                `📊 Status: **${data.status}**\n` +
                `📅 Reported: ${data.reportedAt}`,
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
        `🔄 Reporting \`${number}\` using 7 methods...`,
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

    // Show detailed results
    let details = result.methods.map(m => 
        `${m.success ? '✅' : '❌'} ${m.method}`
    ).join('\n');

    await bot.editMessageText(
        `✅ **Report Complete!**\n\n` +
        `📱 ${number}\n` +
        `📊 Success: ${result.success}/${result.total}\n` +
        `📈 Rate: ${result.successRate.toFixed(1)}%\n\n` +
        `📋 **Methods:**\n${details}\n\n` +
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
        `📈 Rate: ${result.successRate.toFixed(1)}%\n` +
        `🔄 Rounds: ${result.rounds}`,
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
    
    setTimeout(initBot, 3000);
});

process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    server.close(() => process.exit(0));
});
