const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder
} = require('discord.js');

const fs = require('fs');

const cargosPermitidos = ['👑 Dono', '💰 Vendedor', '🔥 Top Vendedor'];
const categoriaTicketsNome = 'Tickets';
const canalLogsNome = 'logs-tickets';

const bannerLink = 'https://cdn.discordapp.com/attachments/1500256907502289088/1500459832556130384/ChatGPT_Image_2_de_mai._de_2026_19_33_06.png?ex=69f8839d&is=69f7321d&hm=dddc5d65a5f16661ab7121a70f7e80cec6f9e3ffc62e799dd222b159156552f2&';
const logoLink = 'https://cdn.discordapp.com/attachments/1500256907502289088/1500459833139265647/ChatGPT_Image_23_de_abr._de_2026_15_51_41.png?ex=69f8839d&is=69f7321d&hm=00bef1352a516c82b15174b3577cc905f9369f9229aca68b1b7441dffff07d6d&';

let db = { ticketCount: 0, tickets: {} };

if (fs.existsSync('./database.json')) {
  db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
}

function salvarDB() {
  fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));
}

function temCargoPermitido(membro) {
  return membro.roles.cache.some(role => cargosPermitidos.includes(role.name));
}

function formatarTempo(ms) {
  const segundos = Math.floor(ms / 1000);
  const minutos = Math.floor(segundos / 60);
  const horas = Math.floor(minutos / 60);

  if (horas > 0) return `${horas}h ${minutos % 60}min`;
  if (minutos > 0) return `${minutos}min ${segundos % 60}s`;
  return `${segundos}s`;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log('Bot online!');
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    const comando = message.content.toLowerCase().trim();

    if (comando === '!ping' || comando === 'ping') {
      return message.reply('pong 🟢');
    }

    if (comando === '!painel' || comando === 'painel') {
      const embed = new EmbedBuilder()
        .setTitle('🎫 ATENDIMENTO')
        .setDescription(
          '🕒 **Horário:** Segunda a Domingo (11:00 - 23:00)\n\n' +
          '⚡ Escolha a categoria abaixo para abrir seu ticket.'
        )
        .setImage(bannerLink)
        .setThumbnail(logoLink)
        .setColor('#8A2BE2');

      const menu = new StringSelectMenuBuilder()
        .setCustomId('categoria_ticket')
        .setPlaceholder('Escolha a categoria')
        .addOptions([
          {
            label: '👕 Roupas',
            description: 'Pedidos e personalizados',
            value: 'roupas'
          },
          {
            label: '🛠️ Suporte',
            description: 'Dúvidas e ajuda',
            value: 'suporte'
          }
        ]);

      const row = new ActionRowBuilder().addComponents(menu);

      return message.channel.send({
        embeds: [embed],
        components: [row]
      });
    }
  } catch (erro) {
    console.log('Erro no painel:', erro);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === 'categoria_ticket') {
      const categoria = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`form_ticket_${categoria}`)
        .setTitle(`Abrir ticket | ${categoria}`);

      const input = new TextInputBuilder()
        .setCustomId('mensagem')
        .setLabel('Descreva o que você precisa')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('form_ticket_')) {
      await interaction.deferReply({ ephemeral: true });

      const texto = interaction.fields.getTextInputValue('mensagem');
      const categoria = interaction.customId.replace('form_ticket_', '');

      db.ticketCount++;
      const ticketId = db.ticketCount;
      salvarDB();

      const categoriaTickets = interaction.guild.channels.cache.find(
        canal => canal.name === categoriaTicketsNome && canal.type === ChannelType.GuildCategory
      );

      const corCategoria = categoria === 'roupas' ? '#8A2BE2' : '#808080';

      const canal = await interaction.guild.channels.create({
        name: `ticket-${ticketId}-${categoria}`,
        type: ChannelType.GuildText,
        parent: categoriaTickets ? categoriaTickets.id : null,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels
            ]
          },
          ...interaction.guild.roles.cache
            .filter(role => cargosPermitidos.includes(role.name))
            .map(role => ({
              id: role.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels
              ]
            }))
        ]
      });

      db.tickets[canal.id] = {
        id: ticketId,
        categoria,
        usuarioId: interaction.user.id,
        usuarioTag: interaction.user.tag,
        mensagemInicial: texto,
        abertoEm: Date.now(),
        assumidoPor: null
      };

      salvarDB();

      const embed = new EmbedBuilder()
        .setTitle(`🎫 Ticket #${ticketId}`)
        .setDescription(
          `📂 **Categoria:** ${categoria}\n\n` +
          `🟡 **Status:** Em andamento\n\n` +
          `👤 **Cliente:** <@${interaction.user.id}>\n\n` +
          `📩 **Mensagem inicial:**\n${texto}`
        )
        .setThumbnail(logoLink)
        .setColor(corCategoria);

      const assumir = new ButtonBuilder()
        .setCustomId('assumir_ticket')
        .setLabel('👨‍💼 Assumir Ticket')
        .setStyle(ButtonStyle.Primary);

      const fechar = new ButtonBuilder()
        .setCustomId('fechar_ticket')
        .setLabel('🔒 Finalizar Ticket')
        .setStyle(ButtonStyle.Danger);

      const botoes = new ActionRowBuilder().addComponents(assumir, fechar);

      await canal.send({
        content: `<@${interaction.user.id}>`,
        embeds: [embed],
        components: [botoes]
      });

      return interaction.editReply({
        content: `✅ Ticket criado com sucesso: ${canal}`
      });
    }

    if (interaction.isButton() && interaction.customId === 'assumir_ticket') {
      if (!temCargoPermitido(interaction.member)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para assumir este ticket.',
          ephemeral: true
        });
      }

      const dados = db.tickets[interaction.channel.id];

      if (dados) {
        dados.assumidoPor = interaction.user.tag;
        salvarDB();
      }

      return interaction.reply({
        content: `👨‍💼 Ticket assumido por ${interaction.user}.`
      });
    }

    if (interaction.isButton() && interaction.customId === 'fechar_ticket') {
      if (!temCargoPermitido(interaction.member)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para finalizar este ticket.',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      const dados = db.tickets[interaction.channel.id];

      const mensagens = await interaction.channel.messages.fetch({ limit: 100 });

      const historico = mensagens
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map(msg => {
          const data = new Date(msg.createdTimestamp).toLocaleString();
          const conteudo = msg.content || '[embed/anexo]';
          return `[${data}] ${msg.author.tag}: ${conteudo}`;
        })
        .join('\n');

      const arquivo = new AttachmentBuilder(
        Buffer.from(historico || 'Sem mensagens salvas.', 'utf8'),
        { name: `historico-ticket-${dados ? dados.id : 'sem-id'}.txt` }
      );

      const tempoAtendimento = dados
        ? formatarTempo(Date.now() - dados.abertoEm)
        : 'Não registrado';

      const logChannel = interaction.guild.channels.cache.find(
        canal => canal.name === canalLogsNome && canal.type === ChannelType.GuildText
      );

      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle(`📁 Ticket Finalizado #${dados ? dados.id : 'sem-id'}`)
          .setDescription(
            `👤 **Cliente:** ${dados ? `<@${dados.usuarioId}>` : 'Não registrado'}\n` +
            `📂 **Categoria:** ${dados ? dados.categoria : 'Não registrada'}\n` +
            `👨‍💼 **Assumido por:** ${dados && dados.assumidoPor ? dados.assumidoPor : 'Ninguém assumiu'}\n` +
            `🔒 **Finalizado por:** ${interaction.user}\n` +
            `⏱️ **Tempo de atendimento:** ${tempoAtendimento}\n\n` +
            `📩 **Mensagem inicial:**\n${dados ? dados.mensagemInicial : 'Não registrada'}`
          )
          .setColor(dados && dados.categoria === 'roupas' ? '#8A2BE2' : '#808080')
          .setThumbnail(logoLink)
          .setTimestamp();

        await logChannel.send({
          embeds: [logEmbed],
          files: [arquivo]
        });
      }

      await interaction.editReply('🔒 Ticket finalizado. O canal será deletado em 3 segundos.');

      if (dados) {
        delete db.tickets[interaction.channel.id];
        salvarDB();
      }

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 3000);
    }
  } catch (erro) {
    console.log('Erro em interação:', erro);

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        interaction.editReply('❌ Ocorreu um erro ao processar isso.').catch(() => {});
      } else {
        interaction.reply({
          content: '❌ Ocorreu um erro ao processar isso.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
});

client.login(process.env.TOKEN);

