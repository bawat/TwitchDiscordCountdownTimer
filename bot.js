const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const cron = require('node-cron');
const http = require('http');

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
    TIMEZONE: 'Europe/London', // Adjust to your timezone
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

    console.log('🔍 Current time:', now.toString());
    console.log('🔍 Current day:', now.getDay(), '| Current hour:', now.getHours());

    for (const streamDay of CONFIG.STREAM_DAYS) {
        // Calculate next occurrence of this stream day
        const nextDate = new Date(now);
        nextDate.setHours(streamDay.time, 0, 0, 0);
        
        console.log(`🔍 Checking stream day ${streamDay.day} at hour ${streamDay.time}`);
        console.log(`🔍 Set to: ${nextDate.toString()}`);
        
        // Get days until this weekday
        const daysUntil = (streamDay.day - now.getDay() + 7) % 7;
        console.log(`🔍 Days until this stream: ${daysUntil}`);
        
        if (daysUntil === 0 && now.getHours() >= streamDay.time + CONFIG.STREAM_DURATION_HOURS) {
            // Stream already ended today, get next week's stream
            nextDate.setDate(nextDate.getDate() + 7);
            console.log(`🔍 Stream ended today, moved to next week: ${nextDate.toString()}`);
        } else if (daysUntil > 0) {
            nextDate.setDate(nextDate.getDate() + daysUntil);
            console.log(`🔍 Moved to correct day: ${nextDate.toString()}`);
        }
        
        const diff = nextDate.getTime() - now.getTime();
        console.log(`🔍 Time difference: ${diff}ms (${diff/1000/60/60} hours)`);
        
        if (diff > 0 && diff < minDiff) {
            minDiff = diff;
            nextStream = nextDate;
            console.log(`🔍 New closest stream: ${nextStream.toString()}`);
        }
    }

    console.log('🔍 Final next stream:', nextStream ? nextStream.toString() : 'null');
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
        return `🔴 Streaming now at ${CONFIG.TWITCH_URL}`;
    } else {
        const nextStream = getNextStreamTime();
        const unixTimestamp = Math.floor(nextStream.getTime() / 1000);
        
        return `Next stream is at <t:${unixTimestamp}:F>, that's <t:${unixTimestamp}:R>!`;
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
        console.log('  - View Channel:', permissions.has(PermissionFlagsBits.ViewChannel));
        console.log('  - Send Messages:', permissions.has(PermissionFlagsBits.SendMessages));
        console.log('  - Embed Links:', permissions.has(PermissionFlagsBits.EmbedLinks));
        console.log('  - Read Message History:', permissions.has(PermissionFlagsBits.ReadMessageHistory));
        console.log('  - Use External Emojis:', permissions.has(PermissionFlagsBits.UseExternalEmojis));

        if (!permissions.has(PermissionFlagsBits.SendMessages)) {
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

// Schedule updates at specific times
// 1pm daily
cron.schedule('0 13 * * *', () => {
    console.log('🔄 1pm daily update triggered');
    updateStreamMessage();
}, {
    timezone: CONFIG.TIMEZONE
});

// 2pm daily (stream start time)
cron.schedule('0 14 * * *', () => {
    console.log('🔄 2pm stream time update triggered');
    updateStreamMessage();
}, {
    timezone: CONFIG.TIMEZONE
});

// 6pm daily
cron.schedule('0 18 * * *', () => {
    console.log('🔄 6pm daily update triggered');
    updateStreamMessage();
}, {
    timezone: CONFIG.TIMEZONE
});

// Handle errors
client.on('error', console.error);

// Simple web server to keep Render happy (only needed for Web Service type)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord Stream Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
});

// Login to Discord
client.login(CONFIG.BOT_TOKEN);