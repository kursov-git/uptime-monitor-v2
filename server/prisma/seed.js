const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
    // Check if any users exist
    const userCount = await prisma.user.count();

    if (userCount > 0) {
        console.log('Users already exist, skipping seed.');
        return;
    }

    // Generate password from env or random
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
        data: {
            username: 'admin',
            passwordHash,
            role: 'ADMIN',
        },
    });

    console.log('='.repeat(50));
    console.log('Admin user created:');
    console.log('   Username: admin');
    console.log('   Password: ' + password);
    console.log('='.repeat(50));
    console.log('Save this password! It will not be shown again.');

    // Create default notification settings
    const existingSettings = await prisma.notificationSettings.findFirst();
    if (!existingSettings) {
        await prisma.notificationSettings.create({
            data: {},
        });
        console.log('Default notification settings created.');
    }
}

main()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
