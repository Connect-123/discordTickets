const { Button } = require('@eartharoid/dbf');

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

       // First claim the ticket
       await client.tickets.claim(interaction);

       // Get the current channel
       const channel = interaction.channel;

       // Get the claimer's username
       const claimerName = interaction.user.username;

       // Edit the channel name to include the claimer's name
       // You can customize the format as needed
       try {
          // Option 1: Replace entire channel name with format: ticket-claimername
          await channel.setName(`ticket-${claimerName.toLowerCase().replace(/\s+/g, '-')}`);

          // Option 2: If you want to keep the original ticket ID/number and add the claimer's name:
          // const currentName = channel.name;
          // await channel.setName(`${currentName}-${claimerName.toLowerCase().replace(/\s+/g, '-')}`);

          // Send confirmation message (optional)
          await interaction.followUp({
             content: `Ticket claimed and renamed by ${interaction.user}`,
             ephemeral: true
          });
       } catch (error) {
          console.error('Error renaming channel:', error);
          await interaction.followUp({
             content: 'Ticket claimed but could not rename channel.',
             ephemeral: true
          });
       }
    }
};
