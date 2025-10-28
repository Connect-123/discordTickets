const { Button } = require('@eartharoid/dbf');

// Store original names in memory (shared with unclaim.js)
global.ticketOriginalNames = global.ticketOriginalNames || new Map();

module.exports = class ClaimButton extends Button {
	constructor(client, options) {
		super(client, {
			...options,
			id: 'claim',
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

		// Store the original channel name before claiming
		// Always update the stored name to the current name, in case the channel was renamed
		global.ticketOriginalNames.set(channel.id, channel.name);

		// Claim the ticket and check if it was successful
		const claimResult = await client.tickets.claim(interaction);

		// Only rename the channel if the claim was successful
		// The claim function returns undefined on success, or returns a response object on failure
		if (claimResult === undefined) {
			// Rename the channel after successful claiming
			try {
				const claimerName = interaction.user.username;
				const newName = `ticket-${claimerName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
				const currentName = channel.name;

				// Check if the names are different before attempting to rename
				if (currentName !== newName) {
					try {
						// Add a longer delay to avoid rate limits
						await new Promise(resolve => setTimeout(resolve, 3000));

						// Add a timeout to the channel rename operation
						const renamePromise = channel.setName(newName);
						const timeoutPromise = new Promise((_, reject) =>
							setTimeout(() => reject(new Error('Channel rename timeout')), 10000),
						);

						await Promise.race([renamePromise, timeoutPromise]);
					} catch (renameError) {
						client.logger.error('Failed to rename channel:', {
							code: renameError.code,
							message: renameError.message,
							name: renameError.name,
							status: renameError.status,
						});
					}
				}
			} catch (error) {
				client.logger.error('Error renaming channel:', error);
			}
		}
	}
};
