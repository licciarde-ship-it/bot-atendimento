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
const QRCode = require('qrcode');

const cargosPermitidos = ['👑 Dono', '💰 Vendedor', '🔥 Top Vendedor'];

const categoriaTicketsNome = 'Tickets';
const canalLogsNome = 'logs-tickets';
const canalFeedbacksNome = '✅・feedback';

const chavePix = '48412796870';
const nomePix = 'Enzo Passini Liciardi';

const bannerLink = 'https://cdn.discordapp.com/attachments/1500256907502289088/1500459832556130384/ChatGPT_Image_2_de_mai._de_2026_19_33_06.png?ex=69f8839d&is=69f7321d&hm=dddc5d65a5f16661ab7121a70f7e80cec6f9e3ffc62e799dd222b159156552f2&';
const logoLink = 'https://cdn.discordapp.com/attachments/1500256907502289088/1500459833139265647/ChatGPT_Image_23_de_abr._de_2026_15_51_41.png?ex=69f8839d&is=69f7321d&hm=00bef1352a516c82b15174b3577cc905f9369f9229aca68b1b7441dffff07d6d&';

const produtos = {
  camiseta: { nome: '👕 Camiseta', preco: 29.99 },
  calca: { nome: '👖 Calça', preco: 29.99 },
  shorts: { nome: '🩳 Shorts', preco: 25.00 },
  cordao: { nome: '📿 Cordão', preco: 29.99 },
  manguito: { nome: '🧤 Manguito', preco: 25.00 },
  kit_fac: { nome: '🔥 Kit FAC', preco: 569.99 }
};

let db = { ticketCount: 0, tickets: {} };

if (fs.existsSync('./database.json')) {
  db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
}

function salvarDB() {
  fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));
}

function normalizar(texto) {
  return texto.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function acharCanal(guild, nome) {
  return guild.channels.cache.find(c => normalizar(c.name) === normalizar(nome));
}

function temCargoPermitido(membro) {
  return membro.roles.cache.some(role => cargosPermitidos.includes(role.name));
}

function formatarDinheiro(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarTempo(ms) {
  const segundos = Math.floor(ms / 1000);
  const minutos = Math.floor(segundos / 60);
  const horas = Math.floor(minutos / 60);

  if (horas > 0) return `${horas}h ${minutos % 60}min`;
  if (minutos > 0) return `${minutos}min ${segundos % 60}s`;
  return `${segundos}s`;
}

function crc16(payload) {
  let crc = 0xFFFF;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;

    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }

      crc &= 0xFFFF;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function campo(id, valor) {
  const tamanho = valor.length.toString().padStart(2, '0');
  return `${id}${tamanho}${valor}`;
}

function gerarPixCopiaECola({ chave, nome, cidade, valor, txid }) {
  const merchantAccountInfo =
    campo('00', 'BR.GOV.BCB.PIX') +
    campo('01', chave);

  const payloadSemCRC =
    campo('00', '01') +
    campo('26', merchantAccountInfo) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valor.toFixed(2)) +
    campo('58', 'BR') +
    campo('59', nome.substring(0, 25)) +
    campo('60', cidade.substring(0, 15)) +
    campo('62', campo('05', txid.substring(0, 25))) +
    '6304';

  return payloadSemCRC + crc16(payloadSemCRC);
}

async function enviarPagamentoPix(interaction, { descricao, quantidade, total, titulo = '💳 Pagamento Gerado' }) {
  const dados = db.tickets[interaction.channel.id];

  if (dados) {
    dados.pagamento = {
      produto: descricao,
      quantidade,
      total,
      status: 'Aguardando pagamento'
    };

    salvarDB();
  }

  const pixCopiaECola = gerarPixCopiaECola({
    chave: chavePix,
    nome: nomePix,
    cidade: 'SAO PAULO',
    valor: total,
    txid: `TICKET${dados ? dados.id : Date.now()}`
  });

  const qrBuffer = await QRCode.toBuffer(pixCopiaECola);

  const qrCode = new AttachmentBuilder(qrBuffer, {
    name: 'qrcode-pix.png'
  });

  const embed = new EmbedBuilder()
    .setTitle(titulo)
    .setDescription(
      `🛒 **Pedido:** ${descricao}\n` +
      `🔢 **Quantidade:** ${quantidade}\n` +
      `💰 **Valor total:** ${formatarDinheiro(total)}\n\n` +
      `👤 **Nome no Pix:** ${nomePix}\n` +
      `🔑 **Pix Copia e Cola:**\n\`\`\`${pixCopiaECola}\`\`\`\n` +
      `🟡 **Status:** Aguardando pagamento\n\n` +
      `Escaneie o QR Code abaixo ou copie o Pix. Depois clique em **✅ Já paguei**.`
    )
    .setImage('attachment://qrcode-pix.png')
    .setColor('#8A2BE2')
    .setThumbnail(logoLink);

  const copiar = new ButtonBuilder()
    .setCustomId('copiar_pix')
    .setLabel('📋 Ver Pix Copia e Cola')
    .setStyle(ButtonStyle.Secondary);

  const jaPaguei = new ButtonBuilder()
    .setCustomId('ja_paguei')
    .setLabel('✅ Já paguei')
    .setStyle(ButtonStyle.Success);

  const confirmar = new ButtonBuilder()
    .setCustomId('confirmar_pagamento')
    .setLabel('🟢 Confirmar Pagamento')
    .setStyle(ButtonStyle.Primary);

  await interaction.channel.send({
    embeds: [embed],
    files: [qrCode],
    components: [
      new ActionRowBuilder().addComponents(copiar, jaPaguei, confirmar)
    ]
  });
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
          { label: '👕 Roupas', description: 'Pedidos e personalizados', value: 'roupas' },
          { label: '🛠️ Suporte', description: 'Dúvidas e ajuda', value: 'suporte' }
        ]);

      return message.channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
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
        canal =>
          normalizar(canal.name) === normalizar(categoriaTicketsNome) &&
          canal.type === ChannelType.GuildCategory
      );

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
        assumidoPor: null,
        pagamento: null
      };

      salvarDB();

      const corCategoria = categoria === 'roupas' ? '#8A2BE2' : '#808080';

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

      const pagamento = new ButtonBuilder()
        .setCustomId('gerar_pagamento')
        .setLabel('💳 Gerar Pagamento')
        .setStyle(ButtonStyle.Success);

      const fechar = new ButtonBuilder()
        .setCustomId('fechar_ticket')
        .setLabel('🔒 Finalizar Ticket')
        .setStyle(ButtonStyle.Danger);

      await canal.send({
        content: `<@${interaction.user.id}>`,
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(assumir, pagamento, fechar)
        ]
      });

      return interaction.editReply(`✅ Ticket criado com sucesso: ${canal}`);
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

    if (interaction.isButton() && interaction.customId === 'gerar_pagamento') {
      if (!temCargoPermitido(interaction.member)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para gerar pagamento.',
          ephemeral: true
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('selecionar_produto')
        .setPlaceholder('Escolha o produto do pedido')
        .addOptions([
          { label: '👕 Camiseta — R$ 29,99', value: 'camiseta' },
          { label: '👖 Calça — R$ 29,99', value: 'calca' },
          { label: '🩳 Shorts — R$ 25,00', value: 'shorts' },
          { label: '📿 Cordão — R$ 29,99', value: 'cordao' },
          { label: '🧤 Manguito — R$ 25,00', value: 'manguito' },
          { label: '🔥 Kit FAC — R$ 569,99', value: 'kit_fac' },
          { label: '💰 Personalizado — escolher valor', value: 'personalizado' }
        ]);

      return interaction.reply({
        content: '🛒 Escolha o produto para gerar o pagamento:',
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'selecionar_produto') {
      if (!temCargoPermitido(interaction.member)) {
        return interaction.reply({
          content: '❌ Sem permissão.',
          ephemeral: true
        });
      }

      const produtoId = interaction.values[0];

      if (produtoId === 'personalizado') {
        const modal = new ModalBuilder()
          .setCustomId('modal_pagamento_personalizado')
          .setTitle('Pagamento Personalizado');

        const descricao = new TextInputBuilder()
          .setCustomId('descricao')
          .setLabel('Descrição do pedido')
          .setPlaceholder('Exemplo: Combo especial, roupa extra, taxa etc.')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const valor = new TextInputBuilder()
          .setCustomId('valor')
          .setLabel('Valor do pagamento')
          .setPlaceholder('Exemplo: 120,50')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(descricao),
          new ActionRowBuilder().addComponents(valor)
        );

        return interaction.showModal(modal);
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_quantidade_${produtoId}`)
        .setTitle('Quantidade do pedido');

      const input = new TextInputBuilder()
        .setCustomId('quantidade')
        .setLabel('Quantidade (1 até 50)')
        .setPlaceholder('Exemplo: 1')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_pagamento_personalizado') {
      await interaction.deferReply({ ephemeral: true });

      if (!temCargoPermitido(interaction.member)) {
        return interaction.editReply('❌ Sem permissão.');
      }

      const descricao = interaction.fields.getTextInputValue('descricao');
      const valorTexto = interaction.fields.getTextInputValue('valor').replace(',', '.');
      const total = Number(valorTexto);

      if (isNaN(total) || total <= 0) {
        return interaction.editReply('❌ Coloque um valor válido. Exemplo: 120,50');
      }

      await enviarPagamentoPix(interaction, {
        descricao,
        quantidade: 1,
        total,
        titulo: '💳 Pagamento Personalizado'
      });

      return interaction.editReply('✅ Pagamento personalizado com QR Code enviado no ticket.');
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_quantidade_')) {
      await interaction.deferReply({ ephemeral: true });

      if (!temCargoPermitido(interaction.member)) {
        return interaction.editReply('❌ Sem permissão.');
      }

      const produtoId = interaction.customId.replace('modal_quantidade_', '');
      const quantidade = Number(interaction.fields.getTextInputValue('quantidade'));

      if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 50) {
        return interaction.editReply('❌ A quantidade precisa ser um número de 1 até 50.');
      }

      const produto = produtos[produtoId];
      const total = produto.preco * quantidade;

      await enviarPagamentoPix(interaction, {
        descricao: produto.nome,
        quantidade,
        total,
        titulo: '💳 Pagamento Gerado'
      });

      return interaction.editReply('✅ Pagamento com QR Code enviado no ticket.');
    }

    if (interaction.isButton() && interaction.customId === 'copiar_pix') {
      return interaction.reply({
        content:
          `🔑 **Pix Copia e Cola:**\n\`\`\`Use o QR Code acima para pagar com valor automático.\`\`\`\n` +
          `👤 Nome: **${nomePix}**\n` +
          `🔑 Chave Pix: **${chavePix}**`,
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId === 'ja_paguei') {
      const dados = db.tickets[interaction.channel.id];

      if (dados && interaction.user.id !== dados.usuarioId) {
        return interaction.reply({
          content: '❌ Apenas o cliente do ticket pode marcar como pago.',
          ephemeral: true
        });
      }

      if (dados && dados.pagamento) {
        dados.pagamento.status = 'Aguardando verificação';
        salvarDB();
      }

      return interaction.reply({
        content: '🟡 Pagamento marcado como enviado. Aguardando verificação da equipe.'
      });
    }

    if (interaction.isButton() && interaction.customId === 'confirmar_pagamento') {
      if (!temCargoPermitido(interaction.member)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para confirmar pagamento.',
          ephemeral: true
        });
      }

      const dados = db.tickets[interaction.channel.id];

      if (dados && dados.pagamento) {
        dados.pagamento.status = 'Pagamento confirmado';
        salvarDB();
      }

      const producao = new ButtonBuilder()
        .setCustomId('em_producao')
        .setLabel('🔵 Em Produção')
        .setStyle(ButtonStyle.Primary);

      return interaction.reply({
        content:
          `🟢 Pagamento confirmado por ${interaction.user}.\n` +
          `Pedido pronto para ir para produção.`,
        components: [new ActionRowBuilder().addComponents(producao)]
      });
    }

    if (interaction.isButton() && interaction.customId === 'em_producao') {
      if (!temCargoPermitido(interaction.member)) {
        return interaction.reply({
          content: '❌ Sem permissão.',
          ephemeral: true
        });
      }

      const entregue = new ButtonBuilder()
        .setCustomId('pedido_entregue')
        .setLabel('✅ Pedido Entregue')
        .setStyle(ButtonStyle.Success);

      return interaction.reply({
        content: `🔵 Pedido colocado em produção por ${interaction.user}.`,
        components: [new ActionRowBuilder().addComponents(entregue)]
      });
    }

    if (interaction.isButton() && interaction.customId === 'pedido_entregue') {
      if (!temCargoPermitido(interaction.member)) {
        return interaction.reply({
          content: '❌ Sem permissão.',
          ephemeral: true
        });
      }

      const avaliar = new ButtonBuilder()
        .setCustomId('avaliar_atendimento')
        .setLabel('⭐ Avaliar Atendimento')
        .setStyle(ButtonStyle.Success);

      return interaction.reply({
        content: '✅ Pedido entregue! Cliente, clique abaixo para avaliar o atendimento.',
        components: [new ActionRowBuilder().addComponents(avaliar)]
      });
    }

    if (interaction.isButton() && interaction.customId === 'avaliar_atendimento') {
      const dados = db.tickets[interaction.channel.id];

      if (dados && interaction.user.id !== dados.usuarioId) {
        return interaction.reply({
          content: '❌ Apenas o cliente pode avaliar.',
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_avaliacao')
        .setTitle('Avaliar Atendimento');

      const estrelas = new TextInputBuilder()
        .setCustomId('estrelas')
        .setLabel('Quantas estrelas? (1 a 5)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const feedback = new TextInputBuilder()
        .setCustomId('feedback')
        .setLabel('Escreva seu feedback')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(estrelas),
        new ActionRowBuilder().addComponents(feedback)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_avaliacao') {
      await interaction.deferReply({ ephemeral: true });

      const estrelas = interaction.fields.getTextInputValue('estrelas');
      const feedback = interaction.fields.getTextInputValue('feedback');

      const numeroEstrelas = Number(estrelas);

      if (!Number.isInteger(numeroEstrelas) || numeroEstrelas < 1 || numeroEstrelas > 5) {
        return interaction.editReply('❌ Coloque uma nota de 1 até 5.');
      }

      const dados = db.tickets[interaction.channel.id];

      const canalFeedbacks = acharCanal(interaction.guild, canalFeedbacksNome);

      if (canalFeedbacks) {
        const embed = new EmbedBuilder()
          .setTitle('✅ Novo Feedback')
          .setDescription(
            `👤 **Cliente:** ${interaction.user}\n` +
            `🎫 **Ticket:** #${dados ? dados.id : 'sem-id'}\n` +
            `⭐ **Nota:** ${'⭐'.repeat(numeroEstrelas)}\n\n` +
            `💬 **Feedback:**\n${feedback}`
          )
          .setColor('#00FF00')
          .setThumbnail(logoLink)
          .setTimestamp();

        await canalFeedbacks.send({ embeds: [embed] });
      }

      return interaction.editReply('✅ Obrigado pelo feedback!');
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

      const mensagens = await interaction.channel.messages.fetch({
        limit: 100
      });

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

      const logChannel = acharCanal(interaction.guild, canalLogsNome);

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
          .setColor(
            dados && dados.categoria === 'roupas'
              ? '#8A2BE2'
              : '#808080'
          )
          .setThumbnail(logoLink)
          .setTimestamp();

        await logChannel.send({
          embeds: [logEmbed],
          files: [arquivo]
        });
      }

      await interaction.editReply(
        '🔒 Ticket finalizado. O canal será deletado em 3 segundos.'
      );

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