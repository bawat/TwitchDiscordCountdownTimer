const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');

// Bot configuration
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Configuration - Replace these with your values
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    CHANNEL_ID: process.env.CHANNEL_ID, // Your #stream-info channel ID
    MESSAGE_ID: process.env.MESSAGE_ID, // The message ID you want to update (optional - bot can create one)
    TWITCH_URL: 'https://www.twitch.tv/TheGoldenLantern',
    TIMEZONE: 'America/New_York', // Adjust to your timezone
    STREAM_DAYS: [
        { day: 1, time: 14 }, // Monday 2pm (day 1 = Monday, 0 = Sunday)
        { day: 3, time: 14 }, // Wednesday 2pm  
        { day: 5, time: 14 }  // Friday 2pm
    ],
    STREAM_DURATION_HOURS: 3
};

let targetMessageId = CONFIG.MESSAGE_ID;

// Helper function to get next stream time
function getNextStreamTime() {
    const now = new Date();
    let nextStream = null;
    let minDiff = Infinity;

    for (const streamDay of CONFIG.STREAM_DAYS) {
        // Calculate next occurrence of this stream day
        const nextDate = new Date(now);
        nextDate.setHours(streamDay.time, 0, 0, 0);
        
        // Get days until this weekday
        const daysUntil = (streamDay.day - now.getDay() + 7) % 7;
        
        if (daysUntil === 0 && now.getHours() >= streamDay.time + CONFIG.STREAM_DURATION_HOURS) {
            // Stream already ended today, get next week's stream
            nextDate.setDate(nextDate.getDate() + 7);
        } else if (daysUntil > 0) {
            nextDate.setDate(nextDate.getDate() + daysUntil);
        }
        
        const diff = nextDate.getTime() - now.getTime();
        if (diff > 0 && diff < minDiff) {
            minDiff = diff;
            nextStream = nextDate;
        }
    }

    return nextStream;
}

// Helper function to check if currently streaming
function isCurrentlyStreaming() {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    return CONFIG.STREAM_DAYS.some(streamDay => 
        streamDay.day === currentDay && 
        currentHour >= streamDay.time && 
        currentHour < streamDay.time + CONFIG.STREAM_DURATION_HOURS
    );
}

// Format time remaining
function formatTimeRemaining(targetDate) {
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();
    
    if (diff <= 0) return "Stream starting soon!";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

// Generate the message content
function generateMessageContent() {
    if (isCurrentlyStreaming()) {
        return {
            embeds: [{
                title: "🔴 STREAMING NOW!",
                description: `**Currently live on Twitch!**\n\n[**🎮 Watch Stream**](${CONFIG.TWITCH_URL})`,
                color: 0x9146FF, // Twitch purple
                timestamp: new Date(),
                footer: {
                    text: "Stream ends in " + (CONFIG.STREAM_DURATION_HOURS - (new Date().getHours() % CONFIG.STREAM_DURATION_HOURS)) + " hours"
                }
            }]
        };
    } else {
        const nextStream = getNextStreamTime();
        const timeRemaining = formatTimeRemaining(nextStream);
        const streamDate = nextStream.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'short', 
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
        
        return {
            embeds: [{
                title: "⏰ Next Stream Countdown",
                description: `**Next stream:** ${streamDate}\n**Time remaining:** ${timeRemaining}\n\n[**🔔 Follow on Twitch**](${CONFIG.TWITCH_URL})`,
                color: 0x5865F2, // Discord blue
                timestamp: nextStream,
                footer: {
                    text: "Updates automatically • Mon/Wed/Fri 2pm"
                }
            }]
        };
    }
}

// Update the message
async function updateStreamMessage() {
    try {
        const channel = await client.channels.fetch(CONFIG.CHANNEL_ID);
        if (!channel) {
            console.error('Channel not found!');
            return;
        }

        // Debug permissions
        const permissions = channel.permissionsFor(client.user);
        console.log('🔍 Bot permissions in channel:');
        console.log('  - View Channel:', permissions.has('ViewChannel'));
        console.log('  - Send Messages:', permissions.has('SendMessages'));
        console.log('  - Embed Links:', permissions.has('EmbedLinks'));
        console.log('  - Read Message History:', permissions.has('ReadMessageHistory'));
        console.log('  - Use External Emojis:', permissions.has('UseExternalEmojis'));

        if (!permissions.has('SendMessages')) {
            console.error('❌ Bot does not have Send Messages permission in this channel!');
            return;
        }

        const messageContent = generateMessageContent();

        if (targetMessageId) {
            // Update existing message
            try {
                const message = await channel.messages.fetch(targetMessageId);
                await message.edit(messageContent);
                console.log('✅ Message updated successfully');
            } catch (error) {
                console.log('❌ Could not update message, creating new one...');
                // Create new message if update fails
                const newMessage = await channel.send(messageContent);
                targetMessageId = newMessage.id;
                console.log('✅ New message created with ID:', targetMessageId);
                console.log('🔧 Add this MESSAGE_ID to your environment variables:', targetMessageId);
            }
        } else {
            // Create new message
            const newMessage = await channel.send(messageContent);
            targetMessageId = newMessage.id;
            console.log('✅ New message created with ID:', targetMessageId);
            console.log('🔧 Add this MESSAGE_ID to your environment variables:', targetMessageId);
        }
    } catch (error) {
        console.error('❌ Error updating stream message:', error);
    }
}

// Bot ready event
client.once('clientReady', () => {
    console.log('🤖 Stream countdown bot is online!');
    console.log(`📺 Monitoring streams for: ${CONFIG.TWITCH_URL}`);
    console.log(`📅 Stream schedule: Mon/Wed/Fri at 2pm for ${CONFIG.STREAM_DURATION_HOURS} hours`);
    
    // Update immediately when bot starts
    updateStreamMessage();
});

// Schedule updates every 5 minutes
cron.schedule('*/5 * * * *', () => {
    console.log('🔄 Scheduled update triggered');
    updateStreamMessage();
}, {
    timezone: CONFIG.TIMEZONE
});

// Handle errors
client.on('error', console.error);

// Login to Discord
client.login(CONFIG.BOT_TOKEN);