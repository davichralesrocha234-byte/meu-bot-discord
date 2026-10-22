import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';

// --- CONFIGURAÇÕES BÁSICAS USANDO VARIÁVEIS DE AMBIENTE ---
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GEMINI_KEY = process.env.GEMINI_KEY;
const GROQ_KEY = process.env.GROQ_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const groq = new Groq({ apiKey: GROQ_KEY });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// --- BANCO DE DADOS EM MEMÓRIA ---
const economia = new Map();
const casamentos = new Map();

function getUsuario(id) {
    if (!economia.has(id)) {
        economia.set(id, { coins: 100, lastWork: 0 });
    }
    return economia.get(id);
}

// --- COMANDOS SLASH ---
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Verifica a latência e tempo de resposta do bot.'),
    new SlashCommandBuilder().setName('gemini').setDescription('Pergunte algo para o Gemini 2.5 (Google)!')
        .addStringOption(opt => opt.setName('pergunta').setDescription('O que você quer perguntar?').setRequired(true)),
    new SlashCommandBuilder().setName('meta').setDescription('Pergunte algo para a Meta AI (Llama 3.3 via Groq)!')
        .addStringOption(opt => opt.setName('pergunta').setDescription('O que você quer perguntar?').setRequired(true)),
    new SlashCommandBuilder().setName('trabalhar').setDescription('Trabalhe e ganhe coins! (Cooldown: 30s)'),
    new SlashCommandBuilder().setName('carteira').setDescription('Veja seu saldo de coins.'),
    new SlashCommandBuilder().setName('casar').setDescription('Peça alguém em casamento!')
        .addUserOption(opt => opt.setName('parceiro').setDescription('A pessoa que você quer casar').setRequired(true)),
    new SlashCommandBuilder().setName('lutar').setDescription('Desafie um membro para um duelo!')
        .addUserOption(opt => opt.setName('oponente').setDescription('O membro que você quer desafiar').setRequired(true)),
    new SlashCommandBuilder().setName('matar').setDescription('Um comando de zueira para eliminar um amigo do chat.')
        .addUserOption(opt => opt.setName('alvo').setDescription('Quem você deseja eliminar').setRequired(true)),
    new SlashCommandBuilder().setName('jogo_da_velha').setDescription('Jogue jogo da velha com um amigo!')
        .addUserOption(opt => opt.setName('oponente').setDescription('Quem você quer desafiar').setRequired(true)),
    new SlashCommandBuilder().setName('criar_canal').setDescription('Cria um novo canal no servidor.')
        .addStringOption(opt => opt.setName('nome').setDescription('Nome do canal').setRequired(true))
        .addStringOption(opt => opt.setName('tipo').setDescription('Tipo do canal').setRequired(true)
            .addChoices({ name: 'Texto', value: '0' }, { name: 'Voz', value: '2' })),
    new SlashCommandBuilder().setName('criar_cargo').setDescription('Cria um novo cargo no servidor.')
        .addStringOption(opt => opt.setName('nome').setDescription('Nome do cargo').setRequired(true))
        .addStringOption(opt => opt.setName('cor').setDescription('Cor em Hex (ex: #FF0000 para vermelho)').setRequired(false)),
    new SlashCommandBuilder().setName('banir').setDescription('Bane um membro do servidor.')
        .addUserOption(opt => opt.setName('alvo').setDescription('Membro a ser banido').setRequired(true))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo do banimento').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    new SlashCommandBuilder().setName('expulsar').setDescription('Expulsa um membro do servidor.')
        .addUserOption(opt => opt.setName('alvo').setDescription('Membro a ser expulsos').setRequired(true))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo da expulsão').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    new SlashCommandBuilder().setName('limpar').setDescription('Limpa mensagens do chat.')
        .addIntegerOption(opt => opt.setName('quantidade').setDescription('Número de mensagens (1 a 100)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// --- REGISTRO DE COMANDOS ---
client.once('ready', async () => {
    console.log(`🤖 Bot online como ${client.user.tag}!`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Todos os comandos Slash foram registrados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
});

// --- BOAS-VINDAS ---
client.on('guildMemberAdd', member => {
    const channel = member.guild.systemChannel || member.guild.channels.cache.find(c => c.isTextBased());
    if (channel) {
        channel.send(`🎉 Seja muito bem-vindo(a) ao servidor, ${member}! Divirta-se por aqui!`);
    }
});

// --- EXECUÇÃO DOS COMANDOS ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user, guild, client: bot } = interaction;
    const dados = getUsuario(user.id);

    // /ping
    if (commandName === 'ping') {
        const pingMs = bot.ws.ping;
        return interaction.reply(`🏓 **Pong!** A latência da API do Discord é de **${pingMs}ms**.`);
    }

    // /trabalhar
    if (commandName === 'trabalhar') {
        const AGORA = Date.now();
        const TEMPO_ESPERA = 30 * 1000;

        if (AGORA - dados.lastWork < TEMPO_ESPERA) {
            const restante = Math.ceil((TEMPO_ESPERA - (AGORA - dados.lastWork)) / 1000);
            return interaction.reply({ content: `⏳ Espere mais **${restante} segundos** para trabalhar novamente!`, ephemeral: true });
        }

        const ganho = Math.floor(Math.random() * 150) + 50;
        dados.coins += ganho;
        dados.lastWork = AGORA;

        return interaction.reply(`💼 Você trabalhou duro e ganhou **${ganho} coins**! Seu saldo atual é: **${dados.coins} coins**.`);
    }

    // /carteira
    if (commandName === 'carteira') {
        return interaction.reply(`💰 **${user.username}**, você possui **${dados.coins} coins** em sua carteira.`);
    }

    // /casar
    if (commandName === 'casar') {
        const parceiro = interaction.options.getUser('parceiro');
        if (parceiro.id === user.id) return interaction.reply({ content: 'Você não pode casar com você mesmo!', ephemeral: true });
        if (parceiro.bot) return interaction.reply({ content: 'Você não pode casar com um bot!', ephemeral: true });

        if (casamentos.has(user.id)) {
            return interaction.reply({ content: 'Você já está casado(a)!', ephemeral: true });
        }

        casamentos.set(user.id, parceiro.id);
        casamentos.set(parceiro.id, user.id);

        return interaction.reply(`💍 **${user.username}** e **${parceiro.username}** agora estão oficialmente casados! Felicidades ao casal! 🎉`);
    }

    // /lutar
    if (commandName === 'lutar') {
        const oponente = interaction.options.getUser('oponente');
        if (oponente.id === user.id) return interaction.reply({ content: 'Você não pode lutar contra si mesmo!', ephemeral: true });
        if (oponente.bot) return interaction.reply({ content: 'Você não pode desafiar um bot!', ephemeral: true });

        const danoUser = Math.floor(Math.random() * 50) + 10;
        const danoOponente = Math.floor(Math.random() * 50) + 10;

        let vencedor = danoUser > danoOponente ? user : oponente;
        if (danoUser === danoOponente) vencedor = null;

        if (!vencedor) {
            return interaction.reply(`⚔️ **${user.username}** e **${oponente.username}** lutaram bravamente, mas a batalha terminou em **Empate**!`);
        } else {
            return interaction.reply(`⚔️ **${user.username}** causou ${danoUser} de dano!\n🛡️ **${oponente.username}** causou ${danoOponente} de dano!\n\n🏆 O vencedor da luta foi **${vencedor.username}**!`);
        }
    }

    // /matar
    if (commandName === 'matar') {
        const alvo = interaction.options.getUser('alvo');
        if (alvo.id === user.id) return interaction.reply({ content: 'Você não pode se eliminar!', ephemeral: true });

        const mortes = [
            `☠️ **${user.username}** jogou um vaso na cabeça de **${alvo.username}**!`,
            `⚡ **${user.username}** invocou um raio que atingiu **${alvo.username}** diretamente!`,
            `🚗 **${user.username}** atropelou **${alvo.username}** em alta velocidade!`,
            `🍌 **${user.username}** colocou uma casca de banana e **${alvo.username}** escorregou feio!`
        ];

        return interaction.reply(mortes[Math.floor(Math.random() * mortes.length)]);
    }

    // /criar_canal
    if (commandName === 'criar_canal') {
        const nome = interaction.options.getString('nome');
        const tipo = parseInt(interaction.options.getString('tipo'));

        try {
            await guild.channels.create({ name: nome, type: tipo });
            return interaction.reply(`✅ Canal **${nome}** criado com sucesso!`);
        } catch (err) {
            return interaction.reply({ content: '❌ Erro ao criar canal. Verifique minhas permissões no servidor!', ephemeral: true });
        }
    }

    // /criar_cargo
    if (commandName === 'criar_cargo') {
        const nome = interaction.options.getString('nome');
        const cor = interaction.options.getString('cor') || '#99AAB5';

        try {
            await guild.roles.create({ name: nome, color: cor });
            return interaction.reply(`✅ Cargo **${nome}** criado com sucesso!`);
        } catch (err) {
            return interaction.reply({ content: '❌ Erro ao criar cargo. Verifique minhas permissões no servidor!', ephemeral: true });
        }
    }

    // /banir
    if (commandName === 'banir') {
        const alvo = interaction.options.getUser('alvo');
        const motivo = interaction.options.getString('motivo') || 'Nenhum motivo fornecido.';

        try {
            await guild.members.ban(alvo, { reason: motivo });
            return interaction.reply(`🔨 O membro **${alvo.username}** foi banido com sucesso!\n**Motivo:** ${motivo}`);
        } catch (err) {
            return interaction.reply({ content: '❌ Erro ao banir membro. Verifique minha hierarquia e permissões!', ephemeral: true });
        }
    }

    // /expulsar
    if (commandName === 'expulsar') {
        const alvo = interaction.options.getUser('alvo');
        const motivo = interaction.options.getString('motivo') || 'Nenhum motivo fornecido.';

        try {
            await guild.members.kick(alvo, motivo);
            return interaction.reply(`👞 O membro **${alvo.username}** foi expulsos com sucesso!\n**Motivo:** ${motivo}`);
        } catch (err) {
            return interaction.reply({ content: '❌ Erro ao expulsar membro. Verifique minha hierarquia e permissões!', ephemeral: true });
        }
    }

    // /limpar
    if (commandName === 'limpar') {
        const qtd = interaction.options.getInteger('quantidade');

        if (qtd < 1 || qtd > 100) {
            return interaction.reply({ content: 'Por favor, informe um valor entre 1 e 100.', ephemeral: true });
        }

        try {
            const deletadas = await interaction.channel.bulkDelete(qtd, true);
            return interaction.reply({ content: `🧹 Foram apagadas **${deletadas.size}** mensagens do chat!`, ephemeral: true });
        } catch (err) {
            return interaction.reply({ content: '❌ Erro ao apagar mensagens. Mensagens com mais de 14 dias não podem ser apagadas em massa.', ephemeral: true });
        }
    }

    // /gemini
    if (commandName === 'gemini') {
        const pergunta = interaction.options.getString('pergunta');
        await interaction.deferReply();

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: pergunta
            });
            return interaction.editReply(`🤖 **Resposta do Gemini:**\n${response.text}`);
        } catch (err) {
            return interaction.editReply('❌ Ocorreu um erro ao consultar o Gemini.');
        }
    }

    // /meta (Llama 3 via Groq)
    if (commandName === 'meta') {
        const pergunta = interaction.options.getString('pergunta');
        await interaction.deferReply();

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: pergunta }],
                model: 'llama-3.3-70b-versatile',
            });
            const resposta = completion.choices[0]?.message?.content || 'Sem resposta.';
            return interaction.editReply(`🦙 **Resposta da Meta AI (Llama 3):**\n${resposta}`);
        } catch (err) {
            return interaction.editReply('❌ Ocorreu um erro ao consultar a Meta AI via Groq.');
        }
    }

    // /jogo_da_velha
    if (commandName === 'jogo_da_velha') {
        const oponente = interaction.options.getUser('oponente');
        if (oponente.id === user.id || oponente.bot) return interaction.reply({ content: 'Desafie um membro válido!', ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('velha_1').setLabel('❌').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('velha_2').setLabel('⭕').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('velha_3').setLabel('❓').setStyle(ButtonStyle.Success)
        );

        return interaction.reply({
            content: `🎮 Partida de Jogo da Velha iniciada entre ${user} e ${oponente}!`,
            components: [row]
        });
    }
});

client.login(TOKEN);


const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot online!');
}).listen(process.env.PORT || 3000);

const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot online!');
}).listen(process.env.PORT || 3000);
