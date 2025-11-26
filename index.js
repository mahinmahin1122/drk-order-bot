
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// Store order data
const pendingOrders = new Map();
const orderMessages = new Map();

// Bot configuration - REPLACE WITH YOUR ACTUAL VALUES
const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const ORDER_CHANNEL_ID = 'YOUR_ORDER_CHANNEL_ID_HERE';

client.once('ready', () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    console.log(`📊 Monitoring orders in channel: ${ORDER_CHANNEL_ID}`);
    console.log(`🔗 Invite URL: https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`);
});

// Handle order submissions from website webhook
client.on('messageCreate', async (message) => {
    // Ignore messages from bots and non-order channels
    if (message.author.bot || message.channel.id !== ORDER_CHANNEL_ID) return;

    // Check if message is an order (contains order data)
    if (message.embeds.length > 0 && message.embeds[0].title && message.embeds[0].title.includes('অর্ডার')) {
        try {
            const embed = message.embeds[0];
            const orderIdField = embed.fields?.find(field => field.name.includes('Order ID'));
            const orderId = orderIdField?.value?.replace(/`/g, '')?.trim();
            
            if (orderId) {
                // Extract Discord username from embed
                const discordField = embed.fields?.find(field => 
                    field.name.includes('Discord') || 
                    field.name.includes('Username') || 
                    field.name.includes('User')
                );
                const discordUsername = discordField?.value || 'Unknown';
                
                // Extract other order details
                const rankField = embed.fields?.find(field => field.name.includes('Rank'));
                const rank = rankField?.value || 'Unknown';
                
                const purchaseField = embed.fields?.find(field => field.name.includes('Purchase'));
                const purchaseType = purchaseField?.value || 'Unknown';

                // Store order data
                const orderData = {
                    orderId: orderId,
                    discordUsername: discordUsername,
                    rank: rank,
                    purchaseType: purchaseType,
                    embed: embed,
                    messageId: message.id,
                    channelId: message.channel.id,
                    timestamp: new Date()
                };
                
                pendingOrders.set(orderId, orderData);
                orderMessages.set(orderId, message);
                
                console.log(`📦 New order stored: ${orderId} for ${discordUsername}`);
                console.log(`📝 Rank: ${rank}, Type: ${purchaseType}`);
                
                // Add buttons to the message for approval
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`approve_${orderId}`)
                            .setLabel('✅ Approve Order')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`reject_${orderId}`)
                            .setLabel('❌ Reject Order')
                            .setStyle(ButtonStyle.Danger)
                    );

                // Edit the original message to add buttons
                await message.edit({ components: [row] });
                
                // Auto-delete after 10 seconds
                setTimeout(async () => {
                    if (pendingOrders.has(orderId)) {
                        try {
                            await message.delete();
                            pendingOrders.delete(orderId);
                            orderMessages.delete(orderId);
                            console.log(`🗑️ Auto-deleted order: ${orderId}`);
                        } catch (error) {
                            console.log(`❌ Could not auto-delete order ${orderId}:`, error.message);
                        }
                    }
                }, 10000);
            }
        } catch (error) {
            console.error('Error processing order message:', error);
        }
    }
});

// Handle approve command
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    if (message.content.startsWith('./approved')) {
        const args = message.content.split(' ');
        if (args.length < 2) {
            return message.reply('❌ Usage: `./approved <order_id>`\nExample: `./approved ORD_123456789`');
        }

        const orderId = args[1];
        const orderData = pendingOrders.get(orderId);

        if (!orderData) {
            return message.reply('❌ Order not found or already processed!');
        }

        try {
            // Find user by Discord username
            const guild = message.guild;
            let targetUser = null;
            
            // Search in server members
            await guild.members.fetch();
            const members = guild.members.cache;
            
            // Try different username formats
            for (const [_, member] of members) {
                const userTag = member.user.tag;
                const userName = member.user.username;
                const displayName = member.displayName;
                
                if (userTag === orderData.discordUsername || 
                    userName === orderData.discordUsername ||
                    displayName === orderData.discordUsername ||
                    userTag.toLowerCase().includes(orderData.discordUsername.toLowerCase()) ||
                    userName.toLowerCase().includes(orderData.discordUsername.toLowerCase())) {
                    targetUser = member.user;
                    break;
                }
            }

            if (targetUser) {
                // Send DM to user
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🎉 Order Approved!')
                    .setDescription('Your order has been approved and processed successfully!')
                    .addFields(
                        { name: 'Order ID', value: `\`${orderId}\``, inline: true },
                        { name: 'Rank', value: orderData.rank, inline: true },
                        { name: 'Purchase Type', value: orderData.purchaseType, inline: true },
                        { name: 'Status', value: '✅ Approved', inline: true }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({ text: 'Drk Survraze SMP - Thank you for your purchase!' });

                try {
                    await targetUser.send({ embeds: [dmEmbed] });
                    console.log(`📨 DM sent to ${targetUser.tag} for order ${orderId}`);
                } catch (dmError) {
                    console.log(`❌ Could not send DM to ${targetUser.tag}:`, dmError.message);
                    // If DM fails, mention them in the channel
                    await message.channel.send(`📢 ${targetUser}, your order has been approved but I couldn't DM you. Please check your order status.`);
                }
            } else {
                console.log(`❌ User "${orderData.discordUsername}" not found in server`);
                await message.reply(`❌ User "${orderData.discordUsername}" not found in this server. They might have left or the username is incorrect.`);
            }

            // Update the order message
            const orderMessage = orderMessages.get(orderId);
            if (orderMessage) {
                const approvedEmbed = new EmbedBuilder()
                    .setTitle('✅ Order Approved')
                    .setDescription(`Order \`${orderId}\` has been approved by ${message.author.tag}`)
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({ text: 'Approval completed' });

                await orderMessage.edit({ 
                    embeds: [approvedEmbed], 
                    components: [] 
                });

                // Delete the approved message after 5 seconds
                setTimeout(async () => {
                    try {
                        await orderMessage.delete();
                    } catch (error) {
                        console.log('Order message already deleted');
                    }
                }, 5000);
            }

            // Remove from pending orders
            pendingOrders.delete(orderId);
            orderMessages.delete(orderId);

            await message.reply(`✅ Order \`${orderId}\` has been approved and user has been notified!`);
            
        } catch (error) {
            console.error('Error approving order:', error);
            await message.reply('❌ Failed to approve order. Please try again.');
        }
    }
});

// Handle button interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, orderId] = interaction.customId.split('_');
    const orderData = pendingOrders.get(orderId);

    if (!orderData) {
        return interaction.reply({ 
            content: '❌ This order has already been processed or expired!', 
            ephemeral: true 
        });
    }

    if (action === 'approve') {
        try {
            // Find user by Discord username
            const guild = interaction.guild;
            let targetUser = null;
            
            await guild.members.fetch();
            const members = guild.members.cache;
            
            // Try different username formats
            for (const [_, member] of members) {
                const userTag = member.user.tag;
                const userName = member.user.username;
                const displayName = member.displayName;
                
                if (userTag === orderData.discordUsername || 
                    userName === orderData.discordUsername ||
                    displayName === orderData.discordUsername ||
                    userTag.toLowerCase().includes(orderData.discordUsername.toLowerCase()) ||
                    userName.toLowerCase().includes(orderData.discordUsername.toLowerCase())) {
                    targetUser = member.user;
                    break;
                }
            }

            if (targetUser) {
                // Send DM to user
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🎉 Order Approved!')
                    .setDescription('Your order has been approved and processed successfully!')
                    .addFields(
                        { name: 'Order ID', value: `\`${orderId}\``, inline: true },
                        { name: 'Rank', value: orderData.rank, inline: true },
                        { name: 'Purchase Type', value: orderData.purchaseType, inline: true },
                        { name: 'Status', value: '✅ Approved', inline: true }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({ text: 'Drk Survraze SMP - Thank you for your purchase!' });

                try {
                    await targetUser.send({ embeds: [dmEmbed] });
                    console.log(`📨 DM sent to ${targetUser.tag} for order ${orderId}`);
                } catch (dmError) {
                    console.log(`❌ Could not send DM to ${targetUser.tag}:`, dmError.message);
                    // If DM fails, mention them in the channel
                    await interaction.channel.send(`📢 ${targetUser}, your order has been approved but I couldn't DM you. Please check your order status.`);
                }
            } else {
                console.log(`❌ User "${orderData.discordUsername}" not found in server`);
                await interaction.reply({ 
                    content: `❌ User "${orderData.discordUsername}" not found in this server.`, 
                    ephemeral: true 
                });
                return;
            }

            // Update the original message
            const approvedEmbed = new EmbedBuilder()
                .setTitle('✅ Order Approved')
                .setDescription(`Order \`${orderId}\` has been approved by ${interaction.user.tag}`)
                .setColor(0x00FF00)
                .setTimestamp()
                .setFooter({ text: 'Approval completed via button' });

            await interaction.message.edit({ 
                embeds: [approvedEmbed], 
                components: [] 
            });

            // Delete message after 5 seconds
            setTimeout(async () => {
                try {
                    await interaction.message.delete();
                } catch (error) {
                    console.log('Message already deleted');
                }
            }, 5000);

            // Remove from storage
            pendingOrders.delete(orderId);
            orderMessages.delete(orderId);

            await interaction.reply({ 
                content: '✅ Order approved successfully! User has been notified via DM.', 
                ephemeral: true 
            });

        } catch (error) {
            console.error('Error approving order:', error);
            await interaction.reply({ 
                content: '❌ Failed to approve order. Please try again.', 
                ephemeral: true 
            });
        }
    } else if (action === 'reject') {
        try {
            // Update the original message
            const rejectedEmbed = new EmbedBuilder()
                .setTitle('❌ Order Rejected')
                .setDescription(`Order \`${orderId}\` has been rejected by ${interaction.user.tag}`)
                .setColor(0xFF0000)
                .setTimestamp()
                .setFooter({ text: 'Rejection completed via button' });

            await interaction.message.edit({ 
                embeds: [rejectedEmbed], 
                components: [] 
            });

            // Delete message after 5 seconds
            setTimeout(async () => {
                try {
                    await interaction.message.delete();
                } catch (error) {
                    console.log('Message already deleted');
                }
            }, 5000);

            // Remove from storage
            pendingOrders.delete(orderId);
            orderMessages.delete(orderId);

            await interaction.reply({ 
                content: '✅ Order rejected successfully!', 
                ephemeral: true 
            });

        } catch (error) {
            console.error('Error rejecting order:', error);
            await interaction.reply({ 
                content: '❌ Failed to reject order.', 
                ephemeral: true 
            });
        }
    }
});

// Handle errors
client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled promise rejection:', error);
});

// Start the bot
client.login(BOT_TOKEN).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});

// Export for potential use in other files
module.exports = { client, pendingOrders, orderMessages };
