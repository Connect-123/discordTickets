import { config } from 'dotenv';
import { program } from 'commander';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import unzipper from 'unzipper';
import { PrismaClient } from '@prisma/client';
import ora from 'ora';
import { pools } from '../src/lib/threads.js';

const { import: pool } = pools;

config();

program
	.requiredOption('-f, --file <path>', 'the path of the zip file to import')
	.requiredOption('-g, --guild <id>', 'the guild ID to import to')
	.requiredOption('-y, --yes', 'yes, DELETE EVERYTHING in the database for this guild');

program.parse();

const options = program.opts();

let spinner = ora('Connecting').start();

const prisma_options = {};

if (process.env.DB_PROVIDER === 'sqlite' && !process.env.DB_CONNECTION_URL) {
	prisma_options.datasources = { db: { url: 'file:' + join(process.cwd(), './user/database.db') } };
}

const prisma = new PrismaClient(prisma_options);

if (process.env.DB_PROVIDER === 'sqlite') {
	const { default: sqliteMiddleware } = await import('../src/lib/middleware/prisma-sqlite.js');
	prisma.$use(sqliteMiddleware);
	await prisma.$queryRaw`PRAGMA journal_mode=WAL;`;
	await prisma.$queryRaw`PRAGMA synchronous=normal;`;
}

spinner.succeed('Connected');

spinner = ora(`Reading ${options.file}`).start();

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

// Delete existing guild data
spinner = ora('Clearing existing data').start();
await prisma.$transaction([
	prisma.guild.delete({
		select: { id: true },
		where: { id: options.guild },
	}),
]);
spinner.succeed('Cleared existing data');

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
const ticketsPromises = [];

spinner = ora('Processing tickets').start();

for await (const line of lines) {
	ticketsPromises.push(pool.queue(worker => worker.importTicket(line, options.guild, categoryMap)));
}

const ticketsResolved = await Promise.all(ticketsPromises);
const queries = [];
const allMessages = [];

for (const [ticket, ticketMessages] of ticketsResolved) {
	queries.push(
		prisma.ticket.create({
			data: ticket,
			select: { id: true },
		}),
	);
	allMessages.push(...ticketMessages);
}

if (allMessages.length > 0) {
	queries.push(prisma.archivedMessage.createMany({ data: allMessages }));
}

spinner = ora('Importing tickets to database').start();
await prisma.$transaction(queries);
spinner.succeed(`Imported ${ticketsResolved.length} tickets`);

// eslint-disable-next-line no-console
console.log('✅ Import completed successfully!');
process.exit(0);

