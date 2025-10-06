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
       console.log(`Stored original name: "${channel.name}" for channel ${channel.id}`);

       // Claim the ticket and check if it was successful
       console.log(`Calling claim function for user ${interaction.user.username}`);
       const claimResult = await client.tickets.claim(interaction);
       console.log(`Claim function returned:`, claimResult);
       
       // Only rename the channel if the claim was successful
       // The claim function returns undefined on success, or returns a response object on failure
       if (claimResult === undefined) {
          // Rename the channel after successful claiming
          try {
             const claimerName = interaction.user.username;
             const newName = `ticket-${claimerName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
             const currentName = channel.name;
             console.log(`Attempting to rename channel from "${currentName}" to "${newName}"`);
             
             // Check if the names are different before attempting to rename
             if (currentName !== newName) {
                await channel.setName(newName);
                console.log(`Successfully renamed channel from "${currentName}" to "${newName}"`);
             } else {
                console.log(`Channel name is already "${newName}", no need to rename`);
             }
          } catch (error) {
             console.error('Error renaming channel:', error);
          }
       } else {
          // Claim failed (non-staff user), don't rename the channel
          console.log(`Claim failed for user ${interaction.user.username}, channel name unchanged`);
       }
    }
};
