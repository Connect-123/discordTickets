/**
 * Send a webhook message
 * @param {string} webhookUrl - The webhook URL
 * @param {Object} data - The webhook data
 * @returns {Promise<boolean>} - Whether the webhook was sent successfully
 */
async function sendWebhook(webhookUrl, data) {
	try {
		const response = await fetch(webhookUrl, {
			body: JSON.stringify(data),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		});

		if (!response.ok) {
			throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
		}

		return true;
	} catch (error) {
		console.error('Webhook error:', error.message);
		return false;
	}
}

/**
 * Send a ticket creation notification webhook
 * @param {Object} params - The parameters
 * @param {string} params.userId - The user ID who created the ticket
 * @param {string} params.username - The username who created the ticket
 * @param {string} params.guildId - The guild ID where the ticket was created
 * @param {string} params.guildName - The guild name where the ticket was created
 * @param {string} params.categoryName - The category name of the ticket
 * @param {string} params.ticketId - The ticket ID
 * @param {string} params.channelId - The channel ID of the ticket
 * @param {string} [params.topic] - The topic of the ticket (optional)
 * @returns {Promise<boolean>} - Whether the webhook was sent successfully
 */
async function sendTicketCreationWebhook({
	userId,
	username,
	guildId,
	guildName,
	categoryName,
	ticketId,
	channelId,
	topic,
}) {
	console.log('🎫 WEBHOOK: Starting ticket creation webhook for ticket:', ticketId);
	const webhookUrl = 'https://ptb.discord.com/api/webhooks/1432549981293908018/nBZVlV_owVbEfE5LCwXLX3KDoybsKGbjzdvi2QnSBe3og5tefjXBRDPWjZX7MyfU7PjR';

	const embed = {
		color: 0x00ff00, // Green color
		fields: [
			{
				inline: true,
				name: '👤 User',
				value: `${username} (${userId})`,
			},
			{
				inline: true,
				name: '🏠 Server',
				value: `${guildName} (${guildId})`,
			},
			{
				inline: true,
				name: '📁 Category',
				value: categoryName,
			},
			{
				inline: true,
				name: '🆔 Ticket ID',
				value: ticketId,
			},
			{
				inline: true,
				name: '📍 Channel',
				value: `<#${channelId}>`,
			},
		],
		footer: { text: 'Discord Tickets Bot' },
		timestamp: new Date().toISOString(),
		title: '🎫 New Ticket Created',
	};

	// Add topic field if provided
	if (topic) {
		embed.fields.push({
			inline: false,
			name: '📝 Topic',
			value: topic.length > 1024 ? topic.substring(0, 1021) + '...' : topic,
		});
	}

	const webhookData = {
		avatar_url: 'https://cdn.discordapp.com/emojis/1234567890123456789.png', // You can replace this with a custom avatar
		embeds: [embed],
		username: 'Ticket Bot',
	};

	return await sendWebhook(webhookUrl, webhookData);
}

module.exports = {
	sendTicketCreationWebhook,
	sendWebhook,
};
