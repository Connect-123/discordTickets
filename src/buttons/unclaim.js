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

		// Call the release function first
		await client.tickets.release(interaction);

		// Restore the original channel name if it was stored
		if (global.ticketOriginalNames && global.ticketOriginalNames.has(channel.id)) {
			const originalName = global.ticketOriginalNames.get(channel.id);
			try {
				await channel.setName(originalName);
				console.log(`Restored channel name to: ${originalName}`);
			} catch (error) {
				console.error('Error restoring channel name:', error);
			}
		}
	}
};
