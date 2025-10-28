import { config } from 'dotenv';
import { program } from 'commander';
import { createInterface } from 'node:readline';
import unzipper from 'unzipper';
import { PrismaClient } from '@prisma/client';
import ora from 'ora';
import Cryptr from 'cryptr';

config();

program
	.requiredOption('-f, --file <path>', 'the path of the zip file to import')
	.requiredOption('-g, --guild <id>', 'the guild ID to import to')
	.option('-y, --yes', 'yes, DELETE EVERYTHING in the database for this guild');

program.parse();

const options = program.opts();

let spinner = ora('Connecting to database').start();

const prisma = new PrismaClient();
const cryptr = new Cryptr(process.env.ENCRYPTION_KEY);

spinner.succeed('Connected to database');

spinner = ora(`Reading ${options.file}`).start();

try {
	// Open zip file
	const zip = await unzipper.Open.file(options.file, { tailSize: 512 });
	const { files } = zip;

	// Read settings.json
	const settingsJSON = JSON.parse(await files.find(f => f.path === 'settings.json').buffer());
	Object.freeze(settingsJSON);
	const settings = structuredClone(settingsJSON);
	const { categories } = settings;
	delete settings.categories;

	spinner.succeed('Parsed settings.json');

	// Delete existing guild data if --yes flag is provided
	if (options.yes) {
		spinner = ora('Clearing existing data').start();
		await prisma.guild.delete({ where: { id: options.guild } }).catch(() => { /* Ignore if guild doesn't exist */ });
		spinner.succeed('Cleared existing data');
	}

	// Import guild settings and tags
	spinner = ora('Importing guild settings').start();
	await prisma.guild.create({
		data: {
			...settings,
			id: options.guild,
			tags: {
				createMany: {
					data: settings.tags.map(tag => {
						delete tag.id;
						return tag;
					}),
				},
			},
		},
	});
	spinner.succeed(`Imported guild settings and ${settings.tags.length} tags`);

	// Import categories
	spinner = ora('Importing categories').start();
	const newCategories = await prisma.$transaction(
		categories.map(category => {
			delete category.id;
			return prisma.category.create({
				data: {
					...category,
					guild: { connect: { id: options.guild } },
					questions: {
						createMany: {
							data: category.questions.map(question => {
								delete question.categoryId;
								return question;
							}),
						},
					},
				},
				select: { id: true },
			});
		}),
	);

	const categoryMap = new Map(settingsJSON.categories.map((cat, idx) => ([cat.id, newCategories[idx].id])));
	spinner.succeed(`Imported ${categories.length} categories`);

	// Import tickets
	spinner = ora('Reading tickets.jsonl').start();
	const stream = files.find(f => f.path === 'tickets.jsonl').stream();
	const lines = createInterface({
		crlfDelay: Infinity,
		input: stream,
	});

	spinner = ora('Processing tickets').start();
	let ticketCount = 0;
	let lastProgressTime = Date.now();

	for await (const line of lines) {
		if (line.trim()) {
			const ticket = JSON.parse(line);

			// Remove problematic fields immediately (these don't exist in the actual database)
			delete ticket.originalName;
			delete ticket.referencesTicketId;
			delete ticket.referencesMessageId;

			// Encrypt fields that need encryption
			if (ticket.closedReason) ticket.closedReason = cryptr.encrypt(ticket.closedReason);
			if (ticket.topic) ticket.topic = cryptr.encrypt(ticket.topic);

			// Process ticket data
			ticket.archivedChannels = {
				create: ticket.archivedChannels.map(channel => {
					delete channel.ticketId;
					return channel;
				}),
			};

			ticket.archivedUsers = {
				create: ticket.archivedUsers.map(user => {
					delete user.ticketId;
					if (user.username) user.username = cryptr.encrypt(user.username);
					if (user.displayName) user.displayName = cryptr.encrypt(user.displayName);
					return user;
				}),
			};

			ticket.archivedRoles = {
				create: ticket.archivedRoles.map(role => {
					delete role.ticketId;
					return role;
				}),
			};

			const messages = ticket.archivedMessages.map(message => message);
			delete ticket.archivedMessages;

			ticket.category = { connect: { id: categoryMap.get(ticket.categoryId) } };
			delete ticket.categoryId;

			// Handle user relationships
			if (ticket.claimedById) {
				ticket.claimedBy = {
					connectOrCreate: {
						create: { id: ticket.claimedById },
						where: { id: ticket.claimedById },
					},
				};
			}
			delete ticket.claimedById;

			if (ticket.closedById) {
				ticket.closedBy = {
					connectOrCreate: {
						create: { id: ticket.closedById },
						where: { id: ticket.closedById },
					},
				};
			}
			delete ticket.closedById;

			if (ticket.createdById) {
				ticket.createdBy = {
					connectOrCreate: {
						create: { id: ticket.createdById },
						where: { id: ticket.createdById },
					},
				};
			}
			delete ticket.createdById;

			// Handle feedback field
			if (ticket.feedback === null) {
				delete ticket.feedback;
			} else if (ticket.feedback) {
				// Wrap feedback in create object for Prisma
				const feedbackData = { ...ticket.feedback };
				delete feedbackData.ticketId; // Remove ticketId as it will be set automatically
				feedbackData.guild = { connect: { id: options.guild } }; // Add guild connection
				if (feedbackData.comment) feedbackData.comment = cryptr.encrypt(feedbackData.comment);

				// Convert userId to user relation
				if (feedbackData.userId) {
					feedbackData.user = {
						connectOrCreate: {
							create: { id: feedbackData.userId },
							where: { id: feedbackData.userId },
						},
					};
					delete feedbackData.userId;
				}

				ticket.feedback = { create: feedbackData };
			}

			// Remove any other fields that might cause schema issues
			const allowedFields = [
				'id',
				'createdAt',
				'closedAt',
				'deleted',
				'firstResponseAt',
				'lastMessageAt',
				'messageCount',
				'number',
				'open',
				'openingMessageId',
				'pinnedMessageIds',
				'priority',
				'topic',
				'closedReason',
				'archivedChannels',
				'archivedRoles',
				'archivedUsers',
				'questionAnswers',
				'category',
				'claimedBy',
				'closedBy',
				'createdBy',
				'guild',
				'feedback',
			];

			// Remove any fields not in the allowed list
			Object.keys(ticket).forEach(key => {
				if (!allowedFields.includes(key)) {
					delete ticket[key];
				}
			});

			// Deep clean any nested objects that might have originalName
			const deepClean = obj => {
				if (typeof obj === 'object' && obj !== null) {
					Object.keys(obj).forEach(key => {
						if (key === 'originalName') {
							delete obj[key];
						} else if (typeof obj[key] === 'object') {
							deepClean(obj[key]);
						}
					});
				}
			};
			deepClean(ticket);

			// Format questionAnswers properly
			if (ticket.questionAnswers && ticket.questionAnswers.length > 0) {
				ticket.questionAnswers = {
					create: ticket.questionAnswers.map(qa => {
						delete qa.ticketId;
						if (qa.value) qa.value = cryptr.encrypt(qa.value);
						return qa;
					}),
				};
			} else {
				delete ticket.questionAnswers;
			}

			// Add guild connection
			ticket.guild = { connect: { id: options.guild } };

			// Create a clean ticket object with only valid fields (based on actual database schema)
			const cleanTicket = {
				archivedChannels: ticket.archivedChannels,
				archivedRoles: ticket.archivedRoles,
				archivedUsers: ticket.archivedUsers,
				category: ticket.category,
				claimedBy: ticket.claimedBy,
				closedAt: ticket.closedAt,
				closedBy: ticket.closedBy,
				closedReason: ticket.closedReason,
				createdAt: ticket.createdAt,
				createdBy: ticket.createdBy,
				deleted: ticket.deleted,
				feedback: ticket.feedback,
				firstResponseAt: ticket.firstResponseAt,
				guild: ticket.guild,
				id: ticket.id,
				lastMessageAt: ticket.lastMessageAt,
				messageCount: ticket.messageCount,
				number: ticket.number,
				open: ticket.open,
				openingMessageId: ticket.openingMessageId,
				pinnedMessageIds: ticket.pinnedMessageIds,
				priority: ticket.priority,
				questionAnswers: ticket.questionAnswers,
				// Explicitly excluded: originalName, topic, referencesMessageId, referencesTicketId
			};

			// Create ticket
			await prisma.ticket.create({ data: cleanTicket });

			// Add messages (encrypt content with current encryption key)
			if (messages.length > 0) {
				await prisma.archivedMessage.createMany({
					data: messages.map(msg => ({
						...msg,
						content: cryptr.encrypt(msg.content),
						ticketId: ticket.id,
					})),
				});
			}

			ticketCount++;
			if (ticketCount % 100 === 0) {
				const now = Date.now();
				spinner.text = `Processing tickets... ${ticketCount} processed (${(100 / ((now - lastProgressTime) / 1000)).toFixed(1)} tickets/sec)`;
				lastProgressTime = now;
			}
		}
	}

	// eslint-disable-next-line no-console
	console.log(`✅ Import completed successfully! 📊 Imported ${ticketCount} tickets for guild ${options.guild}`);

} catch (error) {
	process.exit(1);
} finally {
	await prisma.$disconnect();
}