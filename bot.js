const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');

// ==================== CONFIGURATION ====================
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    PREFIX: './',
    GUILD_ID: process.env.GUILD_ID || 'YOUR_SERVER_ID',
    
    // ✅ SHOP BOT এর ORDER CHANNEL - শুধুমাত্র এই চ্যানেলে কমান্ড allow হবে
    PRIMARY_ORDER_CHANNEL_ID: '1443293560895049792',
    
    // ✅ অন্যান্য চ্যানেলের জন্য সেটিংস (ঐচ্ছিক)
    OTHER_ALLOWED_CHANNELS: [
        // এখানে অন্যান্য চ্যানেল ID যোগ করতে পারেন
        // 'CHANNEL_ID_1',
        // 'CHANNEL_ID_2'
    ],
    
    // ✅ ANNOUNCEMENT CHANNEL
    ANNOUNCEMENT_CHANNEL_ID: '1444273009069129811',
    DISCORD_INVITE_LINK: 'https://discord.gg/SjefnHedt'
};

// ✅ সব ALLOWED চ্যানেলের লিস্ট (PRIMARY + OTHER)
const ALL_ALLOWED_CHANNELS = [
    CONFIG.PRIMARY_ORDER_CHANNEL_ID,
    ...CONFIG.OTHER_ALLOWED_CHANNELS
];

const MESSAGES = {
    APPROVAL_SUCCESS: '🎉 **YOUR ORDER APPROVED!**\nYour purchase has been approved successfully!',
    REJECTION_MESSAGE: '❌ **YOUR ORDER REJECTED**\nIf you have any problem, please create a ticket on our Discord server.',
    DISMISS_SUCCESS: '🗑️ **ORDER DISMISSED**\nThe order has been dismissed without notification to user.',
    ORDER_NOT_FOUND: '❌ Order ID not found in pending orders.',
    NO_PERMISSION: '❌ You do not have permission to manage orders.',
    INVALID_COMMAND: '❌ Usage: `./approved <order_id>` or `./rejected <order_id>` or `./dismiss <order_id>`',
    NO_PENDING_ORDERS: '📭 No pending orders found.',
    WRONG_CHANNEL: `❌ Commands are only allowed in specific order channels.`,
    ORDER_DUPLICATE: `⚠️ Order already exists in this channel.`,
    ORDER_RECEIVED: `📥 New order received: \`{orderId}\` for {username}\n📦 Product: {details}\n⏰ Received at: {time}\n📍 Channel: <#{channelId}>`
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

// ✅ MULTI-CHANNEL STORAGE SYSTEM
// Structure: channelId -> Map(orderId -> orderInfo)
const channelOrders = new Map();

// ✅ GLOBAL ORDER TRACKING (সব চ্যানেলের অর্ডার একসাথে)
const allOrders = new Map(); // orderId -> { channelId, info }

// ==================== HELPER FUNCTIONS ====================

// ✅ চ্যানেলের জন্য আলাদা স্টোরেজ তৈরি/পাওয়া
function getChannelStorage(channelId) {
    if (!channelOrders.has(channelId)) {
        channelOrders.set(channelId, new Map());
    }
    return channelOrders.get(channelId);
}

// ✅ চ্যানেলে Order ID আছে কিনা চেক করা
function hasOrderInChannel(channelId, orderId) {
    const channelStorage = getChannelStorage(channelId);
    return channelStorage.has(orderId);
}

// ✅ সব চ্যানেলে Order ID আছে কিনা চেক করা
function hasOrderInAnyChannel(orderId) {
    return allOrders.has(orderId);
}

// ✅ অর্ডার স্টোর করা (মাল্টি-চ্যানেল)
function storeOrder(channelId, orderId, orderInfo) {
    // চ্যানেল স্টোরেজে সেভ
    const channelStorage = getChannelStorage(channelId);
    channelStorage.set(orderId, orderInfo);
    
    // গ্লোবাল ট্র্যাকিং-এ সেভ
    allOrders.set(orderId, {
        channelId: channelId,
        info: orderInfo
    });
    
    console.log(`📦 Order ${orderId} stored in channel ${channelId} for ${orderInfo.discordUsername}`);
}

// ✅ অর্ডার খোঁজা (চ্যানেল অনুযায়ী)
function getOrder(channelId, orderId) {
    const channelStorage = getChannelStorage(channelId);
    return channelStorage.get(orderId);
}

// ✅ অর্ডার ডিলিট করা (মাল্টি-চ্যানেল)
function deleteOrder(channelId, orderId) {
    const channelStorage = getChannelStorage(channelId);
    const deleted = channelStorage.delete(orderId);
    
    // গ্লোবাল ট্র্যাকিং থেকে ডিলিট
    allOrders.delete(orderId);
    
    return deleted;
}

// ✅ চ্যানেলের সব অর্ডার পাওয়া
function getAllOrdersForChannel(channelId) {
    const channelStorage = getChannelStorage(channelId);
    return Array.from(channelStorage.entries());
}

// ✅ সব চ্যানেলের সব অর্ডার পাওয়া
function getAllOrders() {
    return Array.from(allOrders.entries()).map(([orderId, data]) => {
        return {
            orderId,
            channelId: data.channelId,
            ...data.info
        };
    });
}

// ✅ চ্যানেলে কমান্ড allow কিনা চেক করা
function isCommandAllowed(channelId) {
    return ALL_ALLOWED_CHANNELS.includes(channelId);
}

// ==================== BOT EVENTS ====================

client.on('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📊 Bot is running on ${client.guilds.cache.size} servers`);
    console.log(`🚀 Drk Survraze Order Bot is ready!`);
    console.log(`📁 Primary Command Channel: ${CONFIG.PRIMARY_ORDER_CHANNEL_ID}`);
    console.log(`🎯 Total Allowed Channels: ${ALL_ALLOWED_CHANNELS.length}`);
    console.log(`📢 Announcement Channel: ${CONFIG.ANNOUNCEMENT_CHANNEL_ID}`);
    console.log(`💾 Multi-Channel Storage System Active`);
    
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
        
        // ✅ শুধুমাত্র ALLOWED চ্যানেলে কমান্ড allow করবে
        if (!isCommandAllowed(message.channel.id)) {
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
        } else if (message.content === `${CONFIG.PREFIX}allorders`) {
            await handleAllOrdersCommand(message);
        } else if (message.content.startsWith(`${CONFIG.PREFIX}channelorders`)) {
            await handleChannelOrdersCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}ping`) {
            await message.reply(`🏓 Pong! Latency: ${Date.now() - message.createdTimestamp}ms`);
        } else if (message.content === `${CONFIG.PREFIX}help`) {
            await handleHelpCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}channels`) {
            await handleChannelsCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}cleanup`) {
            await handleCleanupCommand(message);
        } else if (message.content === `${CONFIG.PREFIX}stats`) {
            await handleStatsCommand(message);
        }
    } catch (error) {
        console.error('Message processing error:', error);
    }
});

// ==================== WEBHOOK PROCESSING ====================

async function processWebhookOrder(message) {
    try {
        if (message.embeds && message.embeds.length > 0) {
            const embed = message.embeds[0];
            const orderId = extractOrderId(embed);
            const discordUsername = extractDiscordUsername(embed);
            const orderDetails = extractOrderDetails(embed);
            const channelId = message.channel.id;
            
            if (orderId && discordUsername) {
                // ✅ Check if order already exists in THIS CHANNEL
                if (hasOrderInChannel(channelId, orderId)) {
                    console.log(`⚠️ Order ${orderId} already exists in channel ${channelId}`);
                    return;
                }
                
                const orderInfo = {
                    discordUsername: discordUsername,
                    webhookMessageId: message.id,
                    channelId: channelId,
                    timestamp: new Date(),
                    originalEmbed: embed,
                    orderDetails: orderDetails,
                    status: 'pending'
                };
                
                // Store in multi-channel system
                storeOrder(channelId, orderId, orderInfo);
                
                console.log(`📦 New order in channel ${channelId}: ${orderId} for ${discordUsername}`);
                console.log(`📝 Webhook Message ID: ${message.id}`);
                console.log(`📦 Order Details: ${orderDetails}`);
                console.log(`⏰ Stored at: ${new Date().toLocaleString()}`);
                
                // ✅ Notify ALL ALLOWED CHANNELS about the new order
                for (const allowedChannelId of ALL_ALLOWED_CHANNELS) {
                    try {
                        const channel = await client.channels.fetch(allowedChannelId);
                        if (channel && channel.isTextBased()) {
                            const notification = MESSAGES.ORDER_RECEIVED
                                .replace('{orderId}', orderId)
                                .replace('{username}', discordUsername)
                                .replace('{details}', orderDetails)
                                .replace('{time}', new Date().toLocaleString())
                                .replace('{channelId}', channelId);
                            
                            await channel.send(notification);
                            console.log(`📢 Notification sent to channel ${allowedChannelId} for order: ${orderId}`);
                        }
                    } catch (channelError) {
                        console.log(`❌ Could not send notification to channel ${allowedChannelId}:`, channelError.message);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
    }
}

// ==================== ORDER MANAGEMENT COMMANDS ====================

async function handleApprovalCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
        return message.reply(MESSAGES.INVALID_COMMAND);
    }

    const orderId = args[1];
    const channelId = message.channel.id;
    const orderInfo = getOrder(channelId, orderId);

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
                    { name: '📍 Channel', value: `<#${channelId}>`, inline: true },
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
                                { name: '📦 Purchase', value: orderInfo.orderDetails, inline: true },
                                { name: '📍 Channel', value: `<#${channelId}>`, inline: true }
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
                        console.log(`🗑️ Webhook notification deleted for order: ${orderId} from channel ${orderInfo.channelId}`);
                    } catch (deleteError) {
                        console.log('❌ Could not delete webhook notification:', deleteError.message);
                    }
                }, 10000);

            } catch (webhookError) {
                console.log('❌ Could not find webhook message to delete:', webhookError.message);
            }

            await message.reply(`✅ Order \`${orderId}\` approved! DM sent to ${orderInfo.discordUsername}\n📍 Channel: <#${channelId}>\n⏰ Order was pending since: ${orderInfo.timestamp.toLocaleString()}`);
            
            // Remove from channel storage
            deleteOrder(channelId, orderId);
            
            console.log(`✅ Order ${orderId} approved for ${orderInfo.discordUsername} at ${bangladeshTime}`);
            console.log(`📦 Product: ${orderInfo.orderDetails}`);
            console.log(`📍 Channel: ${channelId}`);
            console.log(`⏰ Order was pending for: ${timeDiff(orderInfo.timestamp, approvalTime)}`);
            
        } else {
            await message.reply(`❌ User not found: ${orderInfo.discordUsername}`);
            deleteOrder(channelId, orderId);
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
    const channelId = message.channel.id;
    const orderInfo = getOrder(channelId, orderId);

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
                    { name: '📍 Channel', value: `<#${channelId}>`, inline: true },
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
                        console.log(`🗑️ Webhook notification deleted for order: ${orderId} from channel ${orderInfo.channelId}`);
                    } catch (deleteError) {
                        console.log('❌ Could not delete webhook notification:', deleteError.message);
                    }
                }, 10000);

            } catch (webhookError) {
                console.log('❌ Could not find webhook message to delete:', webhookError.message);
            }

            await message.reply(`❌ Order \`${orderId}\` rejected! DM sent to ${orderInfo.discordUsername}\n📍 Channel: <#${channelId}>\n⏰ Order was pending since: ${orderInfo.timestamp.toLocaleString()}`);
            
            // Remove from channel storage
            deleteOrder(channelId, orderId);
            
            console.log(`❌ Order ${orderId} rejected for ${orderInfo.discordUsername} at ${bangladeshTime}`);
            console.log(`📦 Product: ${orderInfo.orderDetails}`);
            console.log(`📍 Channel: ${channelId}`);
            console.log(`⏰ Order was pending for: ${timeDiff(orderInfo.timestamp, rejectionTime)}`);
            
        } else {
            await message.reply(`❌ User not found: ${orderInfo.discordUsername}`);
            deleteOrder(channelId, orderId);
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
    const channelId = message.channel.id;
    const orderInfo = getOrder(channelId, orderId);

    if (!orderInfo) {
        return message.reply(MESSAGES.ORDER_NOT_FOUND);
    }

    try {
        // ✅ Webhook notification delete করবে
        try {
            const channel = await client.channels.fetch(orderInfo.channelId);
            const webhookMessage = await channel.messages.fetch(orderInfo.webhookMessageId);
            
            setTimeout(async () => {
                try {
                    await webhookMessage.delete();
                    console.log(`🗑️ Webhook notification deleted for dismissed order: ${orderId} from channel ${orderInfo.channelId}`);
                } catch (deleteError) {
                    console.log('❌ Could not delete webhook notification:', deleteError.message);
                }
            }, 10000);

        } catch (webhookError) {
            console.log('❌ Could not find webhook message to delete:', webhookError.message);
        }

        await message.reply(`🗑️ Order \`${orderId}\` dismissed! No DM sent to user.\n📍 Channel: <#${channelId}>\n⏰ Order was pending since: ${orderInfo.timestamp.toLocaleString()}`);
        
        // Remove from channel storage
        deleteOrder(channelId, orderId);
        
        console.log(`🗑️ Order ${orderId} dismissed without notification`);
        console.log(`📦 Product: ${orderInfo.orderDetails}`);
        console.log(`📍 Channel: ${channelId}`);
        console.log(`⏰ Order was pending for: ${timeDiff(orderInfo.timestamp, new Date())}`);
        
    } catch (error) {
        console.error('Dismiss error:', error);
        await message.reply('❌ Error dismissing order.');
    }
}

async function handleOrdersCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const channelId = message.channel.id;
    const channelOrdersList = getAllOrdersForChannel(channelId);

    if (channelOrdersList.length === 0) {
        return message.reply(`📭 No pending orders found in this channel (<#${channelId}>).`);
    }

    const ordersList = channelOrdersList
        .map(([orderId, info]) => {
            const pendingTime = timeDiff(info.timestamp, new Date());
            return `• **${orderId}** - ${info.discordUsername}\n  📦 ${info.orderDetails}\n  ⏰ Pending for: ${pendingTime}`;
        })
        .join('\n\n');

    const embed = new EmbedBuilder()
        .setTitle(`📦 Pending Orders in <#${channelId}>`)
        .setDescription(ordersList)
        .setColor(0xFFA500)
        .setFooter({ text: `Total: ${channelOrdersList.length} orders in this channel` });

    await message.reply({ embeds: [embed] });
}

async function handleAllOrdersCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const allOrdersList = getAllOrders();

    if (allOrdersList.length === 0) {
        return message.reply('📭 No pending orders found in any channel.');
    }

    const ordersList = allOrdersList
        .map((order) => {
            const pendingTime = timeDiff(order.timestamp, new Date());
            return `• **${order.orderId}** - ${order.discordUsername}\n  📦 ${order.orderDetails}\n  📍 Channel: <#${order.channelId}>\n  ⏰ Pending for: ${pendingTime}`;
        })
        .join('\n\n');

    const embed = new EmbedBuilder()
        .setTitle('📦 All Pending Orders (All Channels)')
        .setDescription(ordersList)
        .setColor(0x9B59B6)
        .setFooter({ text: `Total: ${allOrdersList.length} orders across all channels` });

    await message.reply({ embeds: [embed] });
}

async function handleChannelOrdersCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
        return message.reply('❌ Usage: `./channelorders <channel_id>`');
    }

    const channelId = args[1];
    const channelOrdersList = getAllOrdersForChannel(channelId);

    if (channelOrdersList.length === 0) {
        return message.reply(`📭 No pending orders found in channel \`${channelId}\`.`);
    }

    const ordersList = channelOrdersList
        .map(([orderId, info]) => {
            const pendingTime = timeDiff(info.timestamp, new Date());
            return `• **${orderId}** - ${info.discordUsername}\n  📦 ${info.orderDetails}\n  ⏰ Pending for: ${pendingTime}`;
        })
        .join('\n\n');

    const embed = new EmbedBuilder()
        .setTitle(`📦 Orders in Channel: ${channelId}`)
        .setDescription(ordersList)
        .setColor(0x3498DB)
        .setFooter({ text: `Total: ${channelOrdersList.length} orders` });

    await message.reply({ embeds: [embed] });
}

async function handleStatsCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    let totalOrders = 0;
    const channelStats = [];

    for (const [channelId, ordersMap] of channelOrders.entries()) {
        const orderCount = ordersMap.size;
        totalOrders += orderCount;
        if (orderCount > 0) {
            channelStats.push({
                channelId,
                orderCount,
                channelName: message.guild.channels.cache.get(channelId)?.name || 'Unknown'
            });
        }
    }

    const statsEmbed = new EmbedBuilder()
        .setTitle('📊 Order Bot Statistics')
        .setColor(0x2ECC71)
        .addFields(
            { name: '📁 Total Allowed Channels', value: ALL_ALLOWED_CHANNELS.length.toString(), inline: true },
            { name: '📦 Total Orders', value: totalOrders.toString(), inline: true },
            { name: '📍 Orders per Channel', value: channelStats.map(s => `• <#${s.channelId}>: ${s.orderCount} orders`).join('\n') || 'No orders', inline: false }
        )
        .setFooter({ text: 'Drk Survraze SMP - Multi-Channel Order System' });

    await message.reply({ embeds: [statsEmbed] });
}

// ==================== UTILITY FUNCTIONS ====================

function timeDiff(start, end) {
    const diff = end.getTime() - start.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days} days, ${hours} hours`;
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

// ==================== HELP & INFO COMMANDS ====================

async function handleHelpCommand(message) {
    const helpEmbed = new EmbedBuilder()
        .setTitle('🤖 Drk Order Bot Help - Multi-Channel System')
        .setDescription(`Available commands for administrators in allowed channels:`)
        .addFields(
            { name: './approved <order_id>', value: 'Approve an order in current channel\n📢 Announcement will be sent with @everyone', inline: false },
            { name: './rejected <order_id>', value: 'Reject an order in current channel', inline: false },
            { name: './dismiss <order_id>', value: 'Dismiss an order without sending DM', inline: false },
            { name: './orders', value: 'List pending orders in CURRENT channel', inline: false },
            { name: './allorders', value: 'List ALL pending orders from ALL channels', inline: false },
            { name: './channelorders <channel_id>', value: 'List orders in specific channel', inline: false },
            { name: './channels', value: 'Show all allowed channels', inline: false },
            { name: './stats', value: 'Show order statistics', inline: false },
            { name: './cleanup <order_id>', value: 'Remove specific order from current channel', inline: false },
            { name: './ping', value: 'Check bot latency', inline: false }
        )
        .setColor(0x0099FF)
        .setFooter({ text: 'Drk Survraze SMP - Multi-Channel Order Management' });

    await message.reply({ embeds: [helpEmbed] });
}

async function handleChannelsCommand(message) {
    const channelsList = ALL_ALLOWED_CHANNELS.map(channelId => {
        const channel = message.guild.channels.cache.get(channelId);
        const orderCount = channelOrders.has(channelId) ? channelOrders.get(channelId).size : 0;
        return `• <#${channelId}> ${channel ? `(${channel.name})` : ''} - ${orderCount} pending orders`;
    }).join('\n');

    const channelEmbed = new EmbedBuilder()
        .setTitle('📁 Allowed Command Channels')
        .setDescription(channelsList)
        .addFields(
            { name: '🎯 Primary Channel', value: `<#${CONFIG.PRIMARY_ORDER_CHANNEL_ID}>`, inline: true },
            { name: '📢 Announcement Channel', value: `<#${CONFIG.ANNOUNCEMENT_CHANNEL_ID}>`, inline: true },
            { name: '📍 Total Channels', value: ALL_ALLOWED_CHANNELS.length.toString(), inline: true },
            { name: 'ℹ️ System Info', value: 'Each channel has separate order storage\nOrders can be managed from any allowed channel', inline: false }
        )
        .setColor(0x00FF00)
        .setFooter({ text: 'Drk Survraze SMP - Restricted Multi-Channel System' });

    await message.reply({ embeds: [channelEmbed] });
}

async function handleCleanupCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(MESSAGES.NO_PERMISSION);
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
        return message.reply('❌ Usage: `./cleanup <order_id>` - Remove specific order from current channel');
    }

    const orderId = args[1];
    const channelId = message.channel.id;
    
    if (deleteOrder(channelId, orderId)) {
        await message.reply(`✅ Order \`${orderId}\` removed from channel <#${channelId}>`);
    } else {
        await message.reply('❌ Order ID not found in current channel');
    }
}

// ==================== ORDER EXTRACTION FUNCTIONS ====================

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
    
    if (embed.description) {
        const descMatch = embed.description.match(/Discord[\s:]*([^\\\n]+)/i);
        if (descMatch) return descMatch[1].trim();
    }
    
    return null;
}

function extractOrderDetails(embed) {
    if (!embed.fields) {
        if (embed.description) {
            return extractDetailsFromDescription(embed.description);
        }
        return 'No details available';
    }
    
    let details = '';
    
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
    
    if (!details && embed.description) {
        details = extractDetailsFromDescription(embed.description);
    }
    
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
        
        if (cleanLine.includes('Token') || cleanLine.includes('token')) {
            const tokenMatch = cleanLine.match(/(\d+)\s*Token/i);
            if (tokenMatch) {
                details = `${tokenMatch[1]} Tokens`;
                break;
            }
            details = cleanLine;
            break;
        }
        
        if (cleanLine.includes('Rank') || cleanLine.includes('rank') || cleanLine.includes('Elite')) {
            const rankMatch = cleanLine.match(/(Elite|VIP|Premium|Standard)\s*Rank/i);
            if (rankMatch) {
                details = `${rankMatch[1]} Rank`;
                break;
            }
            details = cleanLine;
            break;
        }
        
        if (cleanLine.includes('Key') || cleanLine.includes('key')) {
            const keyMatch = cleanLine.match(/(Shadow|Fallen)\s*Key/i);
            if (keyMatch) {
                details = `${keyMatch[1]} Key`;
                break;
            }
            details = cleanLine;
            break;
        }
        
        if (cleanLine.includes('Item') || cleanLine.includes('item')) {
            const itemMatch = cleanLine.match(/Item\s*:\s*(.+)/i);
            if (itemMatch) {
                details = itemMatch[1].trim();
                break;
            }
        }
        
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
console.log(`📁 Primary Command Channel: ${CONFIG.PRIMARY_ORDER_CHANNEL_ID}`);
console.log(`🎯 Total Allowed Channels: ${ALL_ALLOWED_CHANNELS.length}`);
console.log(`📢 Announcement Channel: ${CONFIG.ANNOUNCEMENT_CHANNEL_ID}`);
console.log(`💾 Multi-Channel Storage System Active`);
client.login(CONFIG.BOT_TOKEN)
    .catch((error) => {
        console.error('❌ Login failed:', error);
        process.exit(1);
    });
