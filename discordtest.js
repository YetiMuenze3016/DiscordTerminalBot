const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { SlashCommandBuilder } = require('@discordjs/builders');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const sharp = require('sharp');

// Configuration
const token = 'MTE3MDY5Mzk1MjE0ODYxOTI3NA.GYVJB9.jPbO4EesX6bbw41cm4KBQvAl5wab4uck236yaw'; // Replace with your actual bot token
const clientId = '1170693952148619274';
const guildId = '1127968248839819357';
const adminRoleId = '1170799848077934722'; // Replace with the ID of your admin role
const OwnerUserId = '976120735632326656';

// Initialize new client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// Global variables
// Track users who are connected to the terminal and their login state
let connectedUsers = {}; // Tracks whether a user is connected
let userLoginState = {}; // Tracks whether the user is logged in as 'C:' or 'X:'
let bannedUsers = [];

// Slash commands array, log all commands
const commands = [
  new SlashCommandBuilder()
    .setName('terminalconnect')
    .setDescription('Attempt to connect with the terminal')
    .addBooleanOption(option =>
      option.setName('administrator').setDescription('Execute as administrator')
    ),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('List available commands for regular users')
    .addBooleanOption(option =>
      option.setName('admincommands').setDescription('Commands for administrators').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server or disconnect them from the terminal')
    .addUserOption(option => option.setName('target').setDescription('The user to kick').setRequired(true))
    .addStringOption(option =>
      option.setName('os')
        .setDescription('Select action: "server" to kick from server, "terminal" to disconnect from terminal')
        .setRequired(true) // Required for /kick
    )
    .addStringOption(option => option.setName('reason').setDescription('Reason for the kick')),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server or disconnect them from the terminal')
    .addUserOption(option => option.setName('target').setDescription('The user to ban').setRequired(true))
    .addStringOption(option =>
      option.setName('os')
        .setDescription('Select action: "server" to ban from server, "terminal" to disconnect from terminal')
        .setRequired(true) // Required for /ban
    )
    .addStringOption(option => option.setName('reason').setDescription('Reason for the ban')),
  new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Disconnect from the terminal session')
    .addStringOption(option =>
      option.setName('os')
        .setDescription('Optionally specify the terminal to disconnect from')
        .setRequired(false) // Optional for /disconnect
    ),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get detailed information about a user')
    .addUserOption(option => option.setName('user').setDescription('The user to get info for').setRequired(true)),
  new SlashCommandBuilder()
    .setName('terminalconnected')
    .setDescription('Lists all users currently connected to the terminal.'),
  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('Pardon/Unban a banned user from terminal/server')
    .addUserOption(option => 
      option.setName('target').setDescription('The user to pardon').setRequired(true))
    .addStringOption(option => 
      option.setName('os')
        .setDescription('Unban from "server" or "terminal"')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('bans')
    .setDescription('List all banned users')
    .addStringOption(option =>
      option.setName('os')
        .setDescription('Filter by ban type: "server" or "terminal"')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('killtask')
    .setDescription('Shut down the bot (Owner only)'),
      
];

// Set rest version
const rest = new REST({ version: '10' }).setToken(token);

// Refresh, reload and initialize slash commands
(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands.map(command => command.toJSON()) }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// Log into client
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

async function simulateProgress(username, responseMessage, isAdministrator, percentage, delay) {
  await new Promise(resolve => setTimeout(resolve, delay));

  let text = isAdministrator
    ? `X:\\system86\\administrator\\${username}> Initializing terminal... (${percentage}%)`
    : `C:\\users\\${username}> Initializing terminal... (${percentage}%)`;

  return responseMessage.edit(`\`\`\`text\n${text}\n\`\`\``);
}

// Interaction logger function
function logInteraction(interaction) {
  const commandInfo = `${interaction.user.tag} ran ${interaction.commandName}`;
  
  let argsInfo;
  if (interaction.options) {
    switch(interaction.commandName) {
      case 'terminalconnect':
        argsInfo = interaction.options.getBoolean('administrator') ? '/ administrator' : '/ user';
        break;
      case 'kick':
        argsInfo = `on <${interaction.options.getUser('target').tag}> for ${interaction.options.getString('os')} with reason ${interaction.options.getString('reason') || '<No reason>'}`;
        break;
      case 'ban':
        argsInfo = `on target ${interaction.options.getUser('target').tag} for ${interaction.options.getString('os')} with reason ${interaction.options.getString('reason') || '<No reason>'}`;
        break;
      case 'userinfo':
        const targetUser = interaction.options.getUser('user');
        argsInfo = `on ${targetUser.tag}`;
        break;
      case 'killtask':
        argsInfo = `- WARNING`;
        break;
      // Add more cases for other commands as needed
      default:
        argsInfo = '- No arguments received';
    }
  } else {
    argsInfo = '- No arguments available';
  }
  
  const sensitiveCommands = ['killtask', 'kick', 'ban'];
  if (sensitiveCommands.includes(interaction.commandName)) {
    if (interaction.commandName === 'killtask') {
      console.warn(`\x1b[38;5;208m[WARN] \x1b[0m[${new Date().toISOString()}] ${commandInfo} ${argsInfo}`);
    } else {
      console.warn(`[${new Date().toISOString()}] ${commandInfo} ${argsInfo}`);
    }
  } else {
    console.log(`[${new Date().toISOString()}] ${commandInfo} ${argsInfo}`);
  }
}

// Command handlings
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  logInteraction(interaction)

  const { commandName, options, user, member } = interaction;

  const internalServerError = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('Internal Server Error')
    .setDescription('An internal server error occurred while processing your request')
    .setFooter({text: 'Please try again later. If the issue isnt resolved, please contanct the developer.'});

    if (commandName === 'killtask') {
      console.log('Received killtask command');
      
      // Ensure only the Owner can use this command
      if (user.id !== OwnerUserId) {
        console.warn('Not owner, replying with permission denied');
        return interaction.reply("You do not have permission to use this command.");
      }
      
      console.log('Creating message component collector');
      const filter = (i) => i.customId === 'confirm_shutdown' || i.customId === 'cancel_shutdown';
      
      try {
        // Create a new message for confirmation
        const confirmationMessage = await interaction.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#FFD700')
              .setTitle('Are you sure you want to shut down the bot?')
              .setDescription('This action will stop the bot. You can cancel if you change your mind.')
              .setFooter({ text: 'Click the button below to confirm or cancel.' })
          ],
          components: [
            {
              type: 1,
              components: [
                new ButtonBuilder()
                  .setCustomId('confirm_shutdown')
                  .setLabel('Confirm')
                  .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                  .setCustomId('cancel_shutdown')
                  .setLabel('Cancel')
                  .setStyle(ButtonStyle.Success)
              ]
            }
          ],
          ephemeral: true
        });
  
        const collector = interaction.channel.createMessageComponentCollector({
          filter,
          time: 15000
        });
  
        let buttonClicked = false;
  
        collector.on('collect', async (buttonInteraction) => {
          buttonClicked = true;
          if (buttonInteraction.customId === 'confirm_shutdown') {
            console.warn('Bot shutdown confirmed.');
            console.warn('Shutting down...');
            
            const confirmEmbed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('Bot shutdown confirmed.')
              .setDescription('Prepping systems for shutdown...')
              .setFooter({ text: 'Goodbye.' });
  
            await buttonInteraction.update({ embeds: [confirmEmbed], components: [] });
            client.destroy(); // This stops the bot
          } else if (buttonInteraction.customId === 'cancel_shutdown') {
            console.log('\x1b[32mShutdown canceled.\x1b[0m'); // Green color for cancellation
            
            const cancelEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('Shutdown canceled.')
              .setDescription('The bot will continue running.')
              .setFooter({ text: 'You can issue the command again if needed.' });
  
            await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
          }
        });
  
        collector.on('end', async (collected, reason) => {
          if (reason === 'time' && !buttonClicked) {
            console.log('\x1b[38;5;208mTimeout: Shutdown canceled.\x1b[0m');
            
            const timeoutEmbed = new EmbedBuilder()
              .setColor('#FFD700')
              .setTitle('Timeout: Shutdown process canceled.')
              .setDescription('You did not respond in time. The bot is still running.')
              .setFooter({ text: 'You can issue the command again if needed.' });
  
            try {
              await interaction.followUp({ embeds: [timeoutEmbed] });
            } catch (error) {
              console.error('Error sending timeout message:', error);
            }
          }
        });
      } catch (error) {
        console.error('Error handling killtask command:', error);
        await interaction.followUp({ content: internalServerError.description, ephemeral: false });
      }
    }
  

  // Refuse commands if the user is not connected to the terminal
  if (commandName !== 'terminalconnect' && !connectedUsers[user.id]) {
    return interaction.reply("You must connect to the terminal first using `/terminalconnect`.");
  }

  if (commandName === 'terminalconnect') {
    const isAdministrator = options.getBoolean('administrator') || false;

    if (isAdministrator) {
      const member = interaction.guild.members.cache.get(user.id);
      if (!member || !member.roles.cache.has(adminRoleId)) {
        return interaction.reply("You do not have permission to connect to terminal as administrator (X:)")
      }
    }

    if (connectedUsers[user.id]) {
      return interaction.reply("You are already connected to the terminal.");
    }

    const member = interaction.guild.members.cache.get(user.id);
    if (member && bannedUsers.includes(member.id)) {
      return interaction.reply(`RESPONSE: ${user.username} is banned from connecting to the terminal.`);
    }

    connectedUsers[user.id] = true;
    userLoginState[user.id] = isAdministrator ? 'X:' : 'C:'; // Track if logged in as 'X:' or 'C:'

    const responseMessage = await interaction.reply({
      content: `Connecting ${user.username} to the terminal...`,
      fetchReply: true
    });

    let percentage = 0;
    while (percentage <= 100) {
      await simulateProgress(user.username, responseMessage, isAdministrator, percentage, 500);
      percentage += 10;
    }

    await responseMessage.edit(`\`\`\`text\nConnected!\n\`\`\``);
    return responseMessage.edit(`\`\`\`text\n${user.username} connected to the terminal as ${userLoginState[user.id]}\n\`\`\``);
  }

  if (commandName === 'disconnect') {
    if (!connectedUsers[user.id]) {
      return interaction.reply("You are not connected to the terminal.");
    }

    delete connectedUsers[user.id];
    delete userLoginState[user.id];

    return interaction.reply(`${user.username} has been disconnected from the terminal.`);
  }

  if (commandName === 'userinfo') {
    const targetUser = options.getUser('user');
    if (!targetUser) return interaction.reply("Please specify a valid user.");

    const member = interaction.guild.members.cache.get(targetUser.id);
    if (!member) return interaction.reply("User not found in this server.");

    const userAvatarUrl = targetUser.displayAvatarURL({ format: 'png', size: 256 });
    const avatarBuffer = await fetch(userAvatarUrl).then(res => res.arrayBuffer());
    const buffer = Buffer.from(avatarBuffer);

    const image = sharp(buffer);
    const { dominant } = await image.stats();
    const dominantColor = (dominant.r << 16) | (dominant.g << 8) | dominant.b; // Convert to hex color

    const roles = member.roles.cache.map(role => role.name).join(", ") || 'None'; // Get roles
    const permissions = member.permissions.toArray().sort().join("\n") || 'None'; // Permissions alphabetically and vertically

const embed = new EmbedBuilder()
  .setColor(`#${dominantColor.toString(16).padStart(6, '0')}`) // Set dominant color
  .setTitle(`${targetUser.username}'s Info`)
  .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
  .addFields(
    { name: 'Discord Username', value: targetUser.username, inline: true },
    { name: 'Display Name', value: member.displayName, inline: true },
    { name: 'Discord ID', value: targetUser.id, inline: true },
    { name: 'Joined Discord', value: targetUser.createdAt.toDateString(), inline: true },
    { name: 'Joined Server', value: member.joinedAt.toDateString(), inline: true },
    {
      name: 'Terminal-CLI Master',
      value: targetUser.id === OwnerUserId ? 'System admin' : targetUser.id === client.user.id ? 'System' : isTerminalMaster ? '✅ Yes' : '❌ No',
      inline: true
    },
    { name: 'Roles', value: roles, inline: false },
    { name: 'Permissions', value: `\`\`\`${permissions}\`\`\``, inline: false } // Wrap in code block for formatting
  )
  .setFooter({
    text: `Requested by ${interaction.user.username}`,
    iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
  });

interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'kick' || commandName === 'ban') {
    const targetUser = options.getUser('target');
    const reason = options.getString('reason') || 'No reason provided';

    if (!member.roles.cache.has(adminRoleId)) {
      return interaction.reply("You don't have the required admin role to perform this action.");
    }

    if (userLoginState[user.id] !== 'X:') {
      return interaction.reply("You cannot perform this action while logged in as 'C:'. Log in as 'X:' to execute this command.");
    }

    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    if (!targetMember) return interaction.reply("Target user is not in the server.");

    // Fetch the 'os' option to determine the scope of the action
    const os = options.getString('os');
    if (!os || (os !== 'server' && os !== 'terminal')) {
      return interaction.reply("Please specify a valid option for 'os': either 'server' or 'terminal'.");
    }

  if (commandName === 'kick') {
    if (os === 'terminal') {
      // Logic to disconnect the user from the terminal
      if (!connectedUsers[targetUser.id]) {
        return interaction.reply(`${targetUser.username} is not connected to the terminal.`);
      }

      delete connectedUsers[targetUser.id];
      delete userLoginState[targetUser.id];
      return interaction.reply(`${targetUser.username} has been disconnected from the terminal. Reason: ${reason}`);
    }

    if (os === 'server') {
      // Kick the user from the server
      await targetMember.kick(reason);
      return interaction.reply(`${targetUser.username} has been kicked from the server. Reason: ${reason}`);
    }
  }

  if (commandName === 'ban') {
    const targetUser = options.getUser('target');
    const reason = options.getString('reason') || 'No reason provided';
  
    // Check if the command executor is trying to ban themselves
    if (targetUser.id === user.id) {
      console.log(`${interaction.user.tag} tried banning ${interaction.user.tag}. Refused.`);
      return interaction.reply("You cannot ban yourself, silly!");
    }
  
    // Check if the target is the owner
    if (targetUser.id === OwnerUserId) {
      console.log(`${interaction.user.tag} tried banning System admin, refused.`);
      return interaction.reply("This user cannot be banned.");
    }

    // Check if bot is trying to be banned
    if (targetUser.id === clientId) {
      console.log(`${interaction.user.tag} tried banning System, refused.`);
      return interaction.reply("You cannot ban the terminal.");
    }
  
    if (!member.roles.cache.has(adminRoleId)) {
      return interaction.reply("You don't have the required admin role to perform this action.");
    }
  
    if (userLoginState[user.id] !== 'X:') {
      return interaction.reply("You cannot perform this action while logged in as 'C:'. Log in as 'X:' to execute this command.");
    }
  
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    if (!targetMember) return interaction.reply("Target user is not in the server.");
  
    const os = options.getString('os');
    if (!os || (os !== 'server' && os !== 'terminal')) {
      return interaction.reply("Please specify a valid option for 'os': either 'server' or 'terminal'.");
    }
  
    if (os === 'terminal') {
      // Logic to ban user from the terminal
      if (bannedUsers.includes(targetMember.id)) {
        return interaction.reply(`${targetUser.username} is already banned.`);
      }
  
      bannedUsers.push(targetMember.id);
      delete connectedUsers[targetUser.id];
      delete userLoginState[targetUser.id];
      return interaction.reply(`${targetUser.username} has been permanently banned from the terminal. Reason: ${reason}`);
    }
  
    if (os === 'server') {
      // Ban the user from the server
      await targetMember.ban({ reason });
      return interaction.reply(`${targetUser.username} has been banned from the server. Reason: ${reason}`);
    }
  }
  }

  if (commandName === 'terminalconnected') {
    // Check if the user has the admin role
    if (!member.roles.cache.has(adminRoleId)) {
      return interaction.reply("You don't have the required admin role to use this command.");
    }

    if (userLoginState[user.id] !== 'X:') {
      return interaction.reply("You cannot perform this action while logged in as 'C:'. Log in as 'X:' to execute this command.");
    }
  
    // Check if there are any connected users
    const connectedUsersList = Object.keys(connectedUsers).map(userId => {
      const username = interaction.guild.members.cache.get(userId)?.user?.username || 'Unknown User';
      const loginState = userLoginState[userId] || 'Unknown State';
      return `- ${username} (${loginState})`;
    });
  
    if (connectedUsersList.length === 0) {
      return interaction.reply("No users are currently connected to the terminal.");
    }
  
    // Reply with the list of connected users
    return interaction.reply(`**Connected Users:**\n${connectedUsersList.join('\n')}`);
  }

  if (commandName === 'pardon') {
    // Check if user has admin role
    if (!member.roles.cache.has(adminRoleId)) {
      return interaction.reply("You don't have the required admin role to use this command.");
    }

    //Check if user is logged in as Administrator (X:)
    if (userLoginState[user.id] !== 'X:') {
      return interaction.reply("You cannot perform this action while logged in as 'C:'. Log in as 'X:' to execute this command.")
    }
    
    // Fetch the target user to unban
    const targetUser = options.getUser('target');
    if (!targetUser) {
      return interaction.reply("\`\`\`Please specify a valid user to pardon\`\`\`")
    }

    // Fetch the 'os' option to determine scope of pardon
    const os = options.getString('os');
    if (!os || (os !== 'server' && os !== 'terminal')) {
      return interaction.reply("Please sepcify a vaild option of 'os': Either 'server' or 'terminal'.")
    }

    if (os === 'terminal') {
      // Logic to unban user from the terminal
      if (!bannedUsers.includes(targetUser.id)) {
        return interaction.reply(`${targetUser.username} is not banned the terminal.`)
      }

      bannedUsers = bannedUsers.filter(userId => userId !== targetUser.id);
      return interaction.reply(`Unabnned ${targetUser.username} from terminal. ${targetUser.username} has now access to the terminal.`)
    }

    if (os === 'server') {
      // Logic to unabn user from server
      const unbanList = await interaction.guild.bans.fetch();
      const bannedUser = unbanList.get(targetUser.Id);

      if (!bannedUser) {
        return interaction.reply(`${targetUser.username} is not banned from the server.`);
      }

      await interaction.guild.member.unban(targetUser.id);
      return interaction.reply(`Unbanned ${targetUser.username} from the server. ${targetUser.username} has now access to join the server.`)
    }
  }

  if (commandName === 'bans') {
    // Check if user has admin role
    if (!member.roles.cache.has(adminRoleId)) {
      return interaction.reply("You don't have the required admin role to use this command.");
    }
  
    // Check if user is logged in as Administrator (X:)
    if (userLoginState[user.id] !== 'X:') {
      return interaction.reply("You cannot perform this action while logged in as 'C:'. Log in as 'X:' to execute this command.");
    }
  
    // Fetch the 'os' option
    const os = options.getString('os');
  
    let responseMessage = '';
  
    if (!os || os === 'terminal') {
      // Terminal bans
      if (bannedUsers.length === 0) {
        responseMessage += "No users are currently banned from the terminal.\n";
      } else {
        const terminalBans = bannedUsers.map(userId => {
          const user = interaction.guild.members.cache.get(userId)?.user?.username || `UserID: ${userId}`;
          return `- ${user}`;
        }).join("\n");
        responseMessage += `**Terminal Banned Users:**\n${terminalBans}\n`;
      }
    }
  
    if (os === 'server' || !os) {
      // Server bans
      const serverBanList = await interaction.guild.bans.fetch();
  
      if (serverBanList.size === 0) {
        responseMessage += "No users are currently banned from the server.";
      } else {
        const serverBans = serverBanList.map(ban => `- ${ban.user.username} (Reason: ${ban.reason || 'No reason'})`).join("\n");
        responseMessage += `**Server Banned Users:**\n${serverBans}`;
      }
    }
  
    // Reply with the consolidated message
    return interaction.reply(responseMessage || "No bans found.");
  }

  if (commandName === 'help') {
    const adminCommands = options.getBoolean('admincommands') || false;
    const helpMessage = adminCommands
      ? 'Admin commands:\n/kick [user] [reason]\n/ban [user] [reason]'
      : 'User commands:\n/userinfo [user]';
    return interaction.reply(helpMessage);
  }
});

client.login(token);