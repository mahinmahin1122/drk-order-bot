const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');

// ==================== CONFIGURATION ====================
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    PREFIX: './',
    GUILD_ID: process.env.GUILD_ID || 'YOUR_SERVER_ID',
    ORDER_CHANNEL_ID: process.env.ORDER_CHANNEL_ID || 'ORDER_CHANNEL_ID',
    ALLOWED_COMMAND_CHANNEL_ID: process.env.ALLOWED_CHANNEL_ID || 'YOUR_ALLOWED_CHANNEL_ID',
    ANNOUNCEMENT_CHANNEL_ID: '1444273009069129811',
    DISCORD_INVITE_LINK: 'https://discord.gg/SjefnHedt'
};

const MESSAGES = {
    APPROVAL_SUCCESS: '🎉 **YOUR ORDER APPROVED!**\nYour purchase has been approved successfully!',
    REJECTION_MESSAGE: '❌ **YOUR ORDER REJECTED**\nIf you have any problem, please create a ticket on our Discord server.',
    DISMISS_SUCCESS: '🗑️ **ORDER DISMISSED**\nThe order has been dismissed without notification to user.',
    ORDER_NOT_FOUND: '❌ Order ID not found in pending orders.',
    NO_PERMISSION: '❌ You do not have permission to manage orders.',
    INVALID_COMMAND: '❌ Usage: `./approved <order_id>` or `./rejected <order_id>` or `./dismiss <order_id>`',
    NO_PENDING_ORDERS: '📭 No pending orders found.',
    WRONG_CHANNEL: `❌ Commands are only allowed in <#${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}> channel.`
};

// ==================== BOT SETUP ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Memory storage - PERMANENT STORAGE
const pendingOrders = new Map();

// ==================== BOT EVENTS ====================
client.on('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📊 Bot is running on ${client.guilds.cache.size} servers`);
    console.log(`🚀 Drk Survraze Order Bot is ready!`);
    console.log(`📁 Command Channel: ${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}`);
    console.log(`📢 Announcement Channel: ${CONFIG.ANNOUNCEMENT_CHANNEL_ID}`);
    console.log(`💾 Order Storage: PERMANENT (No auto-deletion)`);
    
    client.user.setActivity('./help | Drk Survraze', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
    try {
        // Ignore other bots (except webhooks)
        if (message.author.bot && !message.webhookId) return;
        
        // Webhook messages process (সব চ্যানেলে ওয়েবহুক কাজ করবে)
        if (message.author.bot && message.webhookId) {
            await processWebhookOrder(message);
            return;
        }
        
        // ✅ শুধুমাত্র নির্দিষ্ট চ্যানেলে কমান্ড allow করবে
        if (message.channel.id !== CONFIG.ALLOWED_COMMAND_CHANNEL_ID) {
            // যদি ভুল চ্যানেলে কমান্ড দেওয়া হয়
            if (message.content.startsWith(CONFIG.PREFIX)) {
                await message.reply(MESSAGES.WRONG_CHANNEL);
                // ভুল চ্যানেলের মেসেজ 5 সেকেন্ড পর ডিলিট হবে
                setTimeout(async () => {
                    try {
                        await message.delete();
                    } catch (error) {
                        console.log('Cannot delete message:', error.message);
                    }
                }, 5000);
            }
            return;
        }
        
        // ✅ শুধুমাত্র allowed চ্যানেলে কমান্ড প্রসেস করবে
        if (message.content.startsWith(`${CONFIG.PREFIX}approved`)) {
            await handleApprovalCommand(message);
        } else if (message.content.startsWith(`${CONFIG.PREFIX}rejected`)) {
            await handleRejectionCommand(message);
        } else if (message.content.startsWith(`${CONFIG.PREFIX}dismiss`)) {
            await handleDismissCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}orders`) {
            await handleOrdersCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}ping`) {
            await message.reply(`🏓 Pong! Latency: ${Date.now() - message.createdTimestamp}ms`);
        } else if (message.content === `${CONFIG.PREFIX}help`) {
            await handleHelpCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}channel`) {
            await handleChannelCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}cleanup`) {
            await handleCleanupCommand(message);
        }
    } catch (error) {
        console.error('Message processing error:', error);
    }
});

// ==================== FUNCTIONS ====================

async function processWebhookOrder(message) {
    try {
        if (message.embeds && message.embeds.length > 0) {
            const embed = message.embeds[0];
            const orderId = extractOrderId(embed);
            const discordUsername = extractDiscordUsername(embed);
            const orderDetails = extractOrderDetails(embed);
            
            if (orderId && discordUsername) {
                // ✅ Check if order already exists
                if (pendingOrders.has(orderId)) {
                    console.log(`⚠️ Order ${orderId} already exists in pending orders`);
                    return;
                }
                
                pendingOrders.set(orderId, {
                    discordUsername: discordUsername,
                    webhookMessageId: message.id,
                    channelId: message.channel.id,
                    timestamp: new Date(),
                    originalEmbed: embed,
                    orderDetails: orderDetails,
                    status: 'pending'
                });
                
                console.log(`📦 New order stored: ${orderId} for ${discordUsername}`);
                console.log(`📝 Webhook Message ID: ${message.id}`);
                console.log(`📦 Order Details: ${orderDetails}`);
                console.log(`⏰ Stored at: ${new Date().toLocaleString()}`);
                
                // ✅ New order notification send করবে allowed চ্যানেলে
                try {
                    const allowedChannel = await client.channels.fetch(CONFIG.ALLOWED_COMMAND_CHANNEL_ID);
                    await allowedChannel.send(`📥 New order received: \`${orderId}\` for ${discordUsername}\n📦 Product: ${orderDetails}\n⏰ Received at: ${new Date().toLocaleString()}`);
                    console.log(`📢 Notification sent to command channel for order: ${orderId}`);
                } catch (notifyError) {
                    console.log('Could not send notification to command channel:', notifyError.message);
                }
            }
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
    }
}

function extractOrderId(embed) {
    if (!embed.fields) return null;
    
    for (let field of embed.fields) {
        if (field.value && field.value.includes('ORD_')) {
            const match = field.value.match(/(ORD_[\w]+)/);
            if (match) return match[1];
        }
        if (field.name.includes('Order') || field.name.includes('🆔')) {
            const match = field.value.match(/(ORD_[\w]+)/);
            if (match) return match[1];
            return field.value.replace(/[`]/g, '').trim();
        }
    }
    
    // ✅ Description থেকে Order ID খোঁজা
    if (embed.description) {
        const descMatch = embed.description.match(/(ORD_[\w]+)/);
        if (descMatch) return descMatch[1];
    }
    
    return null;
}

function extractDiscordUsername(embed) {
    if (!embed.fields) return null;
    
    for (let field of embed.fields) {
        if (field.name.includes('Discord') || field.name.includes('👤') || field.name.includes('Username')) {
            return field.value.replace(/[`*_~|]/g, '').trim();
        }
    }
    
    for (let field of embed.fields) {
        if (field.value && (field.value.includes('#') || field.value.toLowerCase().includes('discord'))) {
            return field.value.replace(/[`*_~|]/g, '').trim();
        }
    }
    
    // ✅ Description থেকে Discord username খোঁজা
    if (embed.description) {
        const descMatch = embed.description.match(/Discord[\s:]*([^\\\n]+)/i);
        if (descMatch) return descMatch[1].trim();
    }
    
    return null;
}

function extractOrderDetails(embed) {
    if (!embed.fields) {
        // ✅ যদি fields না থাকে, description থেকে details extract করা
        if (embed.description) {
            return extractDetailsFromDescription(embed.description);
        }
        return 'No details available';
    }
    
    let details = '';
    
    // ✅ Method 1: Product/Item/Token fields খোঁজা
    for (let field of embed.fields) {
        const fieldName = field.name.toLowerCase();
        const fieldValue = field.value.replace(/[`*_~|]/g, '').trim();
        
        if (fieldName.includes('product') || 
            fieldName.includes('item') || 
            fieldName.includes('token') ||
            fieldName.includes('package') ||
            fieldName.includes('rank') ||
            fieldName.includes('key') ||
            fieldName.includes('purchase') ||
            fieldName.includes('📦') ||
            fieldName.includes('🛒') ||
            fieldName.includes('🎁') ||
            fieldName.includes('⭐')) {
            
            if (fieldValue && fieldValue !== 'N/A' && !fieldValue.includes('not specified')) {
                details = fieldValue;
                break;
            }
        }
    }
    
    // ✅ Method 2: Description থেকে details extract করা
    if (!details && embed.description) {
        details = extractDetailsFromDescription(embed.description);
    }
    
    // ✅ Method 3: সব fields check করা
    if (!details) {
        for (let field of embed.fields) {
            const fieldValue = field.value.replace(/[`*_~|]/g, '').trim();
            if (fieldValue && 
                !fieldValue.includes('ORD_') && 
                !fieldValue.includes('@') && 
                !fieldValue.includes('#') &&
                !fieldValue.toLowerCase().includes('discord') &&
                fieldValue.length > 5) {
                details = fieldValue;
                break;
            }
        }
    }
    
    return details || 'Product details not specified';
}

function extractDetailsFromDescription(description) {
    if (!description) return '';
    
    const lines = description.split('\n');
    let details = '';
    
    for (let line of lines) {
        const cleanLine = line.replace(/[`*_~|]/g, '').trim();
        
        // ✅ Token related
        if (cleanLine.includes('Token') || cleanLine.includes('token')) {
            const tokenMatch = cleanLine.match(/(\d+)\s*Token/i);
            if (tokenMatch) {
                details = `${tokenMatch[1]} Tokens`;
                break;
            }
            details = cleanLine;
            break;
        }
        
        // ✅ Rank related
        if (cleanLine.includes('Rank') || cleanLine.includes('rank') || cleanLine.includes('Elite')) {
            const rankMatch = cleanLine.match(/(Elite|VIP|Premium|Standard)\s*Rank/i);
            if (rankMatch) {
                details = `${rankMatch[1]} Rank`;
                break;
            }
            details = cleanLine;
            break;
        }
        
        // ✅ Key related
        if (cleanLine.includes('Key') || cleanLine.includes('key')) {
            const keyMatch = cleanLine.match(/(Shadow|Fallen)\s*Key/i);
            if (keyMatch) {
                details = `${keyMatch[1]} Key`;
                break;
            }
            details = cleanLine;
            break;
        }
        
        // ✅ Item related
        if (cleanLine.includes('Item') || cleanLine.includes('item')) {
            const itemMatch = cleanLine.match(/Item\s*:\s*(.+)/i);
            if (itemMatch) {
                details = itemMatch[1].trim();
                break;
            }
        }
        
        // ✅ In-game name এর পরে যা আছে সেটা
        if (cleanLine.includes('In-game') || cleanLine.includes('Ingame')) {
            const nextLine = lines[lines.indexOf(line) + 1];
            if (nextLine && nextLine.includes('Item')) {
                const itemMatch = nextLine.match(/Item\s*:\s*(.+)/i);
                if (itemMatch) {
                    details = itemMatch[1].trim();
                    break;
                }
            }
        }
    }
    
    // ✅ যদি এখনও details না মেলে, প্রথম meaningful line নেওয়া
    if (!details) {
        for (let line of lines) {
            const cleanLine = line.replace(/[`*_~|]/g, '').trim();
            if (cleanLine && 
                !cleanLine.includes('Order') && 
                !cleanLine.includes('Discord') && 
                !cleanLine.includes('@') &&
                cleanLine.length > 10) {
                details = cleanLine;
                break;
            }
        }
    }
    
    return details || '';
}

async function handleApprovalCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
        return message.reply(MESSAGES.INVALID_COMMAND);
    }

    const orderId = args[1];
    const orderInfo = pendingOrders.get(orderId);

    if (!orderInfo) {
        return message.reply(MESSAGES.ORDER_NOT_FOUND);
    }

    try {
        const user = await findUserByUsername(orderInfo.discordUsername);
        
        if (user) {
            const approvalTime = new Date();
            const bangladeshTime = formatBangladeshTime(approvalTime);
            
            // Send approval DM to user
            const dmEmbed = new EmbedBuilder()
                .setTitle('🎉 ORDER APPROVED!')
                .setDescription(MESSAGES.APPROVAL_SUCCESS)
                .addFields(
                    { name: '🆔 Order ID', value: `\`${orderId}\``, inline: true },
                    { name: '⭐ Status', value: '✅ Approved', inline: true },
                    { name: '⏰ Approved At', value: bangladeshTime, inline: true }
                )
                .setColor(0x00FF00)
                .setFooter({ text: 'Drk Survraze SMP - Thank you for your purchase!' })
                .setTimestamp(approvalTime);

            await user.send({ embeds: [dmEmbed] });
            
            // ✅ ANNOUNCEMENT CHANNEL এ মেসেজ পাঠানো
            try {
                const announcementChannel = await client.channels.fetch(CONFIG.ANNOUNCEMENT_CHANNEL_ID);
                
                const announcementMessage = await announcementChannel.send({
                    content: `@everyone\n🎉 **NEW ORDER APPROVED!**`,
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x00FF00)
                            .addFields(
                                { name: '👤 Customer', value: `\`${orderInfo.discordUsername}\``, inline: true },
                                { name: '📦 Purchase Type', value: orderInfo.orderDetails, inline: true }
                            )
                            .setFooter({ text: 'Drk Survraze SMP - Order System' })
                            .setTimestamp(approvalTime)
                    ]
                });
                
                console.log(`📢 Announcement sent for approved order: ${orderId}`);
            } catch (announcementError) {
                console.log('❌ Could not send announcement:', announcementError.message);
            }
            
            // ✅ Webhook notification delete করবে
            try {
                const channel = await client.channels.fetch(orderInfo.channelId);
                const webhookMessage = await channel.messages.fetch(orderInfo.webhookMessageId);
                
                setTimeout(async () => {
                    try {
                        await webhookMessage.delete();
                        console.log(`🗑️ Webhook notification deleted for order: ${orderId}`);
                    } catch (deleteError) {
                        console.log('❌ Could not delete webhook notification:', deleteError.message);
                    }
                }, 10000);

            } catch (webhookError) {
                console.log('❌ Could not find webhook message to delete:', webhookError.message);
            }

            await message.reply(`✅ Order \`${orderId}\` approved! DM sent to ${orderInfo.discordUsername}\n⏰ Order was pending since: ${orderInfo.timestamp.toLocaleString()}`);
            
            // Remove from pending orders
            pendingOrders.delete(orderId);
            
            console.log(`✅ Order ${orderId} approved for ${orderInfo.discordUsername} at ${bangladeshTime}`);
            console.log(`📦 Product: ${orderInfo.orderDetails}`);
            console.log(`⏰ Order was pending for: ${timeDiff(orderInfo.timestamp, approvalTime)}`);
            
        } else {
            await message.reply(`❌ User not found: ${orderInfo.discordUsername}`);
            pendingOrders.delete(orderId);
        }
    } catch (error) {
        console.error('Approval error:', error);
        await message.reply('❌ Error approving order.');
    }
}

async function handleRejectionCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
        return message.reply(MESSAGES.INVALID_COMMAND);
    }

    const orderId = args[1];
    const orderInfo = pendingOrders.get(orderId);

    if (!orderInfo) {
        return message.reply(MESSAGES.ORDER_NOT_FOUND);
    }

    try {
        const user = await findUserByUsername(orderInfo.discordUsername);
        
        if (user) {
            const rejectionTime = new Date();
            const bangladeshTime = formatBangladeshTime(rejectionTime);
            
            const dmEmbed = new EmbedBuilder()
                .setTitle('❌ ORDER REJECTED')
                .setDescription(MESSAGES.REJECTION_MESSAGE)
                .addFields(
                    { name: '🆔 Order ID', value: `\`${orderId}\``, inline: true },
                    { name: '⭐ Status', value: '❌ Rejected', inline: true },
                    { name: '⏰ Rejected At', value: bangladeshTime, inline: true },
                    { name: '📞 Need Help?', value: `[Create Ticket on Discord](${CONFIG.DISCORD_INVITE_LINK})`, inline: false }
                )
                .setColor(0xFF0000)
                .setFooter({ text: 'Drk Survraze SMP - Contact support if you have questions' })
                .setTimestamp(rejectionTime);

            await user.send({ embeds: [dmEmbed] });
            
            // ✅ Webhook notification delete করবে
            try {
                const channel = await client.channels.fetch(orderInfo.channelId);
                const webhookMessage = await channel.messages.fetch(orderInfo.webhookMessageId);
                
                setTimeout(async () => {
                    try {
                        await webhookMessage.delete();
                        console.log(`🗑️ Webhook notification deleted for order: ${orderId}`);
                    } catch (deleteError) {
                        console.log('❌ Could not delete webhook notification:', deleteError.message);
                    }
                }, 10000);

            } catch (webhookError) {
                console.log('❌ Could not find webhook message to delete:', webhookError.message);
            }

            await message.reply(`❌ Order \`${orderId}\` rejected! DM sent to ${orderInfo.discordUsername}\n⏰ Order was pending since: ${orderInfo.timestamp.toLocaleString()}`);
            
            pendingOrders.delete(orderId);
            
            console.log(`❌ Order ${orderId} rejected for ${orderInfo.discordUsername} at ${bangladeshTime}`);
            console.log(`📦 Product: ${orderInfo.orderDetails}`);
            console.log(`⏰ Order was pending for: ${timeDiff(orderInfo.timestamp, rejectionTime)}`);
            
        } else {
            await message.reply(`❌ User not found: ${orderInfo.discordUsername}`);
            pendingOrders.delete(orderId);
        }
    } catch (error) {
        console.error('Rejection error:', error);
        await message.reply('❌ Error rejecting order.');
    }
}

async function handleDismissCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
        return message.reply(MESSAGES.INVALID_COMMAND);
    }

    const orderId = args[1];
    const orderInfo = pendingOrders.get(orderId);

    if (!orderInfo) {
        return message.reply(MESSAGES.ORDER_NOT_FOUND);
    }

    try {
        try {
            const channel = await client.channels.fetch(orderInfo.channelId);
            const webhookMessage = await channel.messages.fetch(orderInfo.webhookMessageId);
            
            setTimeout(async () => {
                try {
                    await webhookMessage.delete();
                    console.log(`🗑️ Webhook notification deleted for dismissed order: ${orderId}`);
                } catch (deleteError) {
                    console.log('❌ Could not delete webhook notification:', deleteError.message);
                }
            }, 10000);

        } catch (webhookError) {
            console.log('❌ Could not find webhook message to delete:', webhookError.message);
        }

        await message.reply(`🗑️ Order \`${orderId}\` dismissed! No DM sent to user.\n⏰ Order was pending since: ${orderInfo.timestamp.toLocaleString()}`);
        
        pendingOrders.delete(orderId);
        
        console.log(`🗑️ Order ${orderId} dismissed without notification`);
        console.log(`📦 Product: ${orderInfo.orderDetails}`);
        console.log(`⏰ Order was pending for: ${timeDiff(orderInfo.timestamp, new Date())}`);
        
    } catch (error) {
        console.error('Dismiss error:', error);
        await message.reply('❌ Error dismissing order.');
    }
}

function timeDiff(start, end) {
    const diff = end.getTime() - start.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days} days, ${hours} hours, ${minutes} minutes`;
    if (hours > 0) return `${hours} hours, ${minutes} minutes`;
    return `${minutes} minutes`;
}

function formatBangladeshTime(date) {
    return date.toLocaleString('en-BD', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

async function findUserByUsername(username) {
    try {
        const cleanUsername = username.replace(/[`*_~|]/g, '').trim();
        console.log(`🔍 Searching user: ${cleanUsername}`);
        
        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.members.fetch();
                
                const member = guild.members.cache.find(member => 
                    member.user.tag === cleanUsername ||
                    member.user.username === cleanUsername ||
                    member.displayName === cleanUsername
                );
                
                if (member) {
                    console.log(`✅ Found: ${member.user.tag}`);
                    return member.user;
                }
            } catch (guildError) {
                console.log(`Guild error: ${guild.name}`);
            }
        }
        
        return null;
    } catch (error) {
        console.error('Find user error:', error);
        return null;
    }
}

async function handleOrdersCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    if (pendingOrders.size === 0) {
        return message.reply(MESSAGES.NO_PENDING_ORDERS);
    }

    const ordersList = Array.from(pendingOrders.entries())
        .map(([orderId, info]) => {
            const pendingTime = timeDiff(info.timestamp, new Date());
            return `• **${orderId}** - ${info.discordUsername}\n  📦 ${info.orderDetails}\n  ⏰ Pending for: ${pendingTime}`;
        })
        .join('\n\n');

    const embed = new EmbedBuilder()
        .setTitle('📦 Pending Orders (PERMANENT STORAGE)')
        .setDescription(ordersList)
        .setColor(0xFFA500)
        .setFooter({ text: `Total: ${pendingOrders.size} orders - Orders stay forever until manually processed` });

    await message.reply({ embeds: [embed] });
}

async function handleCleanupCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
        return message.reply('❌ Usage: `./cleanup <order_id>` - Remove specific order from storage');
    }

    const orderId = args[1];
    if (pendingOrders.has(orderId)) {
        pendingOrders.delete(orderId);
        await message.reply(`✅ Order \`${orderId}\` removed from storage`);
    } else {
        await message.reply('❌ Order ID not found in storage');
    }
}

async function handleHelpCommand(message) {
    const helpEmbed = new EmbedBuilder()
        .setTitle('🤖 Drk Order Bot Help')
        .setDescription(`Available commands for administrators in <#${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}>:`)
        .addFields(
            { name: './approved <order_id>', value: 'Approve an order and send DM to user\n📢 Announcement will be sent to members channel with @everyone\n⚠️ Webhook notification will be deleted after 10 seconds', inline: false },
            { name: './rejected <order_id>', value: 'Reject an order and send DM to user\n❌ No announcement will be sent\n⚠️ Webhook notification will be deleted after 10 seconds', inline: false },
            { name: './dismiss <order_id>', value: 'Dismiss an order without sending DM\n❌ No announcement will be sent\n⚠️ Webhook notification will be deleted after 10 seconds', inline: false },
            { name: './orders', value: 'List all pending orders (PERMANENT STORAGE)', inline: false },
            { name: './cleanup <order_id>', value: 'Remove specific order from storage', inline: false },
            { name: './ping', value: 'Check bot latency', inline: false },
            { name: './channel', value: 'Show current command channel', inline: false }
        )
        .setColor(0x0099FF)
        .setFooter({ text: 'Drk Survraze SMP - Order Management System' });

    await message.reply({ embeds: [helpEmbed] });
}

async function handleChannelCommand(message) {
    const channelEmbed = new EmbedBuilder()
        .setTitle('📁 Command Channel Info')
        .setDescription(`All bot commands are restricted to this channel: <#${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}>`)
        .addFields(
            { name: 'Channel ID', value: `\`${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}\``, inline: true },
            { name: 'Channel Name', value: `\`${message.channel.name}\``, inline: true },
            { name: 'Announcement Channel', value: `<#${CONFIG.ANNOUNCEMENT_CHANNEL_ID}>`, inline: false },
            { name: 'Storage Type', value: '💾 PERMANENT (No auto-deletion)', inline: false },
            { name: 'Status', value: '✅ Commands Enabled', inline: true }
        )
        .setColor(0x00FF00)
        .setFooter({ text: 'Drk Survraze SMP - Restricted Command System' });

    await message.reply({ embeds: [channelEmbed] });
}

// ==================== ERROR HANDLING ====================
client.on('error', (error) => {
    console.error('❌ Client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

// ==================== START BOT ====================
console.log('🚀 Starting Drk Survraze Order Bot on Railway...');
console.log(`📁 Command Channel Restriction: ${CONFIG.ALLOWED_COMMAND_CHANNEL_ID}`);
console.log(`📢 Announcement Channel: ${CONFIG.ANNOUNCEMENT_CHANNEL_ID}`);
console.log(`💾 Order Storage: PERMANENT (No time limit)`);
client.login(CONFIG.BOT_TOKEN)
    .catch((error) => {
        console.error('❌ Login failed:', error);
        process.exit(1);
    });
