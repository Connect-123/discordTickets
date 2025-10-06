const { Button } = require('@eartharoid/dbf');

module.exports = class UnclaimButton extends Button {
	constructor(client, options) {
		super(client, {
			...options,
			id: 'unclaim',
		});
	}

	/**
	 * @param {*} id
	 * @param {import("discord.js").ChatInputCommandInteraction} interaction
	 */
	async run(id, interaction) {
		/** @type {import("client")} */
		const client = this.client;
		const channel = interaction.channel;

		try {
			// Call the release function first
			console.log(`Starting unclaim process for channel ${channel.id}`);
			await client.tickets.release(interaction);
			console.log(`Release function completed for channel ${channel.id}`);

			// Restore the original channel name if it was stored
			if (global.ticketOriginalNames && global.ticketOriginalNames.has(channel.id)) {
				const originalName = global.ticketOriginalNames.get(channel.id);
				const currentName = channel.name;
				console.log(`Attempting to restore channel name from "${currentName}" to "${originalName}"`);
				try {
					await channel.setName(originalName);
					console.log(`Successfully restored channel name to: ${originalName}`);
				} catch (error) {
					console.error('Error restoring channel name:', error);
				}
			} else {
				console.log(`No original name stored for channel ${channel.id}`);
			}
		} catch (error) {
			console.error('Error in unclaim button:', error);
		}
	}
};
