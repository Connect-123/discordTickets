const { logAdminEvent } = require('../../../../../lib/logging.js');
const { iconURL } = require('../../../../../lib/misc');

module.exports.get = fastify => ({
	handler: async req => {
		/** @type {import("client")} */
		const client = req.routeOptions.config.client;
		const guildId = req.params.guild;
		
		// Verify guild exists and user has access
		const guild = client.guilds.cache.get(guildId);
		if (!guild) {
			return { error: 'Guild not found' };
		}

		// Get feedback data for the guild
		const feedback = await client.prisma.feedback.findMany({
			include: {
				user: {
					select: {
						id: true,
						username: true,
						discriminator: true,
					},
				},
				ticket: {
					select: {
						id: true,
						createdAt: true,
						closedAt: true,
					},
				},
			},
			where: {
				guildId,
			},
			orderBy: {
				createdAt: 'desc',
			},
		});

		// Calculate feedback statistics
		const stats = {
			total: feedback.length,
			averageRating: feedback.length > 0 
				? (feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length).toFixed(1)
				: '0.0',
			ratingDistribution: {
				1: feedback.filter(f => f.rating === 1).length,
				2: feedback.filter(f => f.rating === 2).length,
				3: feedback.filter(f => f.rating === 3).length,
				4: feedback.filter(f => f.rating === 4).length,
				5: feedback.filter(f => f.rating === 5).length,
			},
		};

		return {
			guild: {
				id: guild.id,
				name: guild.name,
				logo: iconURL(guild),
			},
			feedback,
			stats,
		};
	},
	onRequest: [fastify.authenticate, fastify.isAdmin],
});

module.exports.delete = fastify => ({
	handler: async req => {
		/** @type {import("client")} */
		const client = req.routeOptions.config.client;
		const guildId = req.params.guild;
		const { ticketId } = req.body;

		if (!ticketId) {
			return { error: 'Ticket ID is required' };
		}

		// Delete specific feedback entry
		const deleted = await client.prisma.feedback.delete({
			where: {
				ticketId,
			},
		});

		if (deleted) {
			logAdminEvent(client, {
				action: 'delete',
				guildId,
				target: {
					id: ticketId,
					type: 'feedback',
				},
				userId: req.user.id,
			});
		}

		return { success: true, deleted };
	},
	onRequest: [fastify.authenticate, fastify.isAdmin],
});
