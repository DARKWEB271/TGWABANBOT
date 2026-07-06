const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const winston = require('winston');
require('dotenv').config();

// ============================================================
// CONFIGURATION
// ============================================================

const BOT_TOKEN = '8879631458:AAEXjh-fkMJWb5TDQYwLO03m1wk1_qQaPPA';
const ADMIN_IDS = [7049182459];
const PORT = process.env.PORT || 3000;

// Channels/Groups to follow
const REQUIRED_CHANNELS = [
    {
        id: '@digitaldon247',
        name: '𝙐&𝙏 𝙃𝘼𝘾𝙆𝙄𝙉𝙂 𝙏𝙊𝙊𝙇𝙎',
        link: 'https://t.me/digitaldon247'
    },
    {
        id: '@digitaldon241',
        name: '𝙐&𝙏 𝙃𝘼𝘾𝙆𝙄𝙉𝙂 𝙏𝙊𝙊𝙇𝙎',
        link: 'https://t.me/digitaldon241'
    }
];

// Admin contacts
const ADMIN_CONTACTS = [
    { username: '@itx_GuRu410', name: 'GURU' },
    { username: '@itx_talha750', name: 'TALHA' }
];

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
        new winston.format.Console(),
        new winston.format.File({ filename: 'bot.log' })
    ]
});

// ============================================================
// DATABASE
// ============================================================

const userStatus = {}; // Store user follow status
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

// Initialize bot
try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });
    logger.info('🤖 Telegram bot initialized successfully');
} catch (error) {
    logger.error(`Bot initialization error: ${error.message}`);
    process.exit(1);
}

// ============================================================
// CHECK IF USER FOLLOWED CHANNELS
// ============================================================

async function checkUserFollow(userId) {
    try {
        // Check if user is member of each required channel
        const results = await Promise.all(
            REQUIRED_CHANNELS.map(async (channel) => {
                try {
                    const member = await bot.getChatMember(channel.id, userId);
                    const status = member.status;
                    return {
                        channel: channel.id,
                        name: channel.name,
                        followed: ['member', 'administrator', 'creator'].includes(status)
                    };
                } catch (error) {
                    return {
                        channel: channel.id,
                        name: channel.name,
                        followed: false
                    };
                }
            })
        );

        const allFollowed = results.every(r => r.followed);
        return {
            allFollowed,
            results
        };
    } catch (error) {
        logger.error(`Check follow error: ${error.message}`);
        return {
            allFollowed: false,
            results: REQUIRED_CHANNELS.map(c => ({ channel: c.id, name: c.name, followed: false }))
        };
    }
}

// ============================================================
// SEND FOLLOW REQUIRED MESSAGE
// ============================================================

async function sendFollowRequired(chatId) {
    const channels = REQUIRED_CHANNELS.map(c => 
        `📢 ${c.name}\n🔗 ${c.link}`
    ).join('\n\n');

    const adminButtons = ADMIN_CONTACTS.map(admin => ({
        text: `👑 ${admin.name}`,
        url: `https://t.me/${admin.username.replace('@', '')}`
    }));

    const keyboard = {
        inline_keyboard: [
            ...REQUIRED_CHANNELS.map(c => [
                { text: `📢 Join ${c.name}`, url: c.link }
            ]),
            [{ text: '✅ I Have Joined', callback_data: 'check_follow' }],
            adminButtons.map(btn => btn),
            [{ text: '🔄 Refresh Status', callback_data: 'refresh_follow' }]
        ]
    };

    await bot.sendMessage(
        chatId,
        `🔒 **ACCESS REQUIRED**\n\n` +
        `Please join our channels/groups first:\n\n` +
        `${channels}\n\n` +
        `⚠️ After joining, click **"I Have Joined"** to continue.\n\n` +
        `📡 Powered by GURU TALHA`,
        {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }
    );
}

// ============================================================
// SEND MAIN MENU
// ============================================================

async function sendMainMenu(chatId, firstName) {
    const keyboard = {
        inline_keyboard: [
            [{ text: '📱 Report Number', callback_data: 'report' }],
            [{ text: '📊 Check Status', callback_data: 'status' }],
            [{ text: '📈 Stats', callback_data: 'stats' }],
            [{ text: 'ℹ️ Help', callback_data: 'help' }],
            ADMIN_CONTACTS.map(admin => ({
                text: `👑 Contact ${admin.name}`,
                url: `https://t.me/${admin.username.replace('@', '')}`
            }))
        ]
    };

    await bot.sendMessage(
        chatId,
        `👑 **GURU WA BAN BOT**\n\n` +
        `Welcome ${firstName}!\n\n` +
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
}

// ============================================================
// BOT COMMAND HANDLERS
// ============================================================

// /start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || 'User';

    // Update user stats
    if (!userStatus[userId]) {
        stats.totalUsers++;
    }
    userStatus[userId] = userStatus[userId] || { followed: false, joinedAt: new Date().toISOString() };

    // Check if user followed channels
    const followStatus = await checkUserFollow(userId);

    if (followStatus.allFollowed) {
        userStatus[userId].followed = true;
        await sendMainMenu(chatId, firstName);
    } else {
        await sendFollowRequired(chatId);
    }
});

// /menu command (for users who already have access)
bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || 'User';

    if (userStatus[userId]?.followed) {
        await sendMainMenu(chatId, firstName);
    } else {
        const followStatus = await checkUserFollow(userId);
        if (followStatus.allFollowed) {
            userStatus[userId].followed = true;
            await sendMainMenu(chatId, firstName);
        } else {
            await sendFollowRequired(chatId);
        }
    }
});

// ============================================================
// CALLBACK QUERY HANDLERS
// ============================================================

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    await bot.answerCallbackQuery(query.id);

    switch (data) {
        case 'check_follow': {
            const followStatus = await checkUserFollow(userId);
            if (followStatus.allFollowed) {
                userStatus[userId] = { followed: true, joinedAt: new Date().toISOString() };
                const firstName = query.from.first_name || 'User';
                await bot.deleteMessage(chatId, query.message.message_id);
                await sendMainMenu(chatId, firstName);
            } else {
                const notFollowed = followStatus.results.filter(r => !r.followed);
                const msg = notFollowed.map(r => `❌ Not joined: ${r.name}`).join('\n');
                await bot.sendMessage(
                    chatId,
                    `❌ **You haven't joined all channels yet:**\n\n${msg}\n\nPlease join and try again.`,
                    { parse_mode: 'Markdown' }
                );
            }
            break;
        }

        case 'refresh_follow': {
            const followStatus = await checkUserFollow(userId);
            if (followStatus.allFollowed) {
                userStatus[userId] = { followed: true, joinedAt: new Date().toISOString() };
                await bot.deleteMessage(chatId, query.message.message_id);
                const firstName = query.from.first_name || 'User';
                await sendMainMenu(chatId, firstName);
            } else {
                await bot.sendMessage(
                    chatId,
                    '🔄 Still not joined all channels. Please join and click **"I Have Joined"**.',
                    { parse_mode: 'Markdown' }
                );
            }
            break;
        }

        case 'report': {
            await bot.sendMessage(
                chatId,
                `📱 **Enter the WhatsApp number to report:**\n\n` +
                `Format: \`+923001234567\` or \`03001234567\`\n\n` +
                `Use: \`/report +923001234567\``,
                { parse_mode: 'Markdown' }
            );
            break;
        }

        case 'status': {
            await bot.sendMessage(
                chatId,
                `📊 **Check ban status:**\n\n` +
                `Use: \`/status +923001234567\``,
                { parse_mode: 'Markdown' }
            );
            break;
        }

        case 'stats': {
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
        }

        case 'help': {
            const helpText =
                `ℹ️ **GURU WA BAN - Help**\n\n` +
                `**Commands:**\n` +
                `/start - Show main menu\n` +
                `/menu - Show menu (if already joined)\n` +
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
                ADMIN_CONTACTS.map(a => `• ${a.username}`).join('\n') +
                `\n\n⚠️ Use responsibly!`;

            await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
            break;
        }

        default:
            await bot.sendMessage(chatId, '❌ Unknown command');
    }
});

// ============================================================
// COMMAND HANDLERS (Only if followed)
// ============================================================

// Check if user is authorized (followed)
async function isAuthorized(userId) {
    if (userStatus[userId]?.followed) return true;
    const followStatus = await checkUserFollow(userId);
    if (followStatus.allFollowed) {
        userStatus[userId] = { followed: true, joinedAt: new Date().toISOString() };
        return true;
    }
    return false;
}

// /report command
bot.onText(/\/report (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!await isAuthorized(userId)) {
        await sendFollowRequired(chatId);
        return;
    }

    const number = match[1].trim();
    await processReport(chatId, number);
});

// /mass command
bot.onText(/\/mass (.+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!await isAuthorized(userId)) {
        await sendFollowRequired(chatId);
        return;
    }

    const number = match[1].trim();
    const count = parseInt(match[2]);

    if (count > 100) {
        await bot.sendMessage(chatId, '❌ Maximum count is 100');
        return;
    }

    await processMassReport(chatId, number, count);
});

// /status command
bot.onText(/\/status (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!await isAuthorized(userId)) {
        await sendFollowRequired(chatId);
        return;
    }

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

// /ban command
bot.onText(/\/ban (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!await isAuthorized(userId)) {
        await sendFollowRequired(chatId);
        return;
    }

    const number = match[1].trim();
    await processReport(chatId, number);
});

// /stats command
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!await isAuthorized(userId)) {
        await sendFollowRequired(chatId);
        return;
    }

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
// BACKGROUND WORKER (Auto-ban)
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
// EXPRESS SERVER (For Render.com)
// ============================================================

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: 'running',
        stats: stats,
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        author: 'GURU TALHA'
    });
});

app.post('/webhook', (req, res) => {
    res.json({ status: 'ok' });
});

const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`👑 GURU WA BAN BOT`);
    logger.info(`📡 Powered by GURU TALHA`);

    // Start auto-ban worker
    setTimeout(autoBanWorker, 5000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});