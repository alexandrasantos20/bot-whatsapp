const {
    Client,
    LocalAuth,
    MessageMedia
} = require('whatsapp-web.js');

const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const CHROME_PATH =
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MUSIC_FOLDER =
    path.join(__dirname, 'musicas');

// =====================================================
// APRESENTAÇÕES EM ANDAMENTO
// =====================================================

// Cada participante terá uma apresentação temporária.
const apresentacoes = new Map();

// =====================================================
// PASTA DE MÚSICAS
// =====================================================

if (!fs.existsSync(MUSIC_FOLDER)) {
    fs.mkdirSync(MUSIC_FOLDER, {
        recursive: true
    });
}

// =====================================================
// WHATSAPP
// =====================================================

const client = new Client({

    authStrategy: new LocalAuth(),

    puppeteer: {

        executablePath: CHROME_PATH,

        headless: true,

        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    }
});

// =====================================================
// QR CODE
// =====================================================

client.on('qr', (qr) => {

    console.log('');
    console.log('========================================');
    console.log('📱 ESCANEIE O QR CODE COM O WHATSAPP');
    console.log('========================================');

    qrcode.generate(qr, {
        small: true
    });
});

// =====================================================
// BOT PRONTO
// =====================================================

client.on('ready', () => {

    console.log('');
    console.log('========================================');
    console.log('🤖 BOT CONECTADO COM SUCESSO!');
    console.log('🎵 SISTEMA DE MÚSICA: ATIVO');
    console.log('👋 APRESENTAÇÃO AUTOMÁTICA: ATIVA');
    console.log('========================================');
    console.log('');
});

// =====================================================
// AUTENTICAÇÃO
// =====================================================

client.on('authenticated', () => {

    console.log('🔐 WhatsApp autenticado.');
});

client.on('auth_failure', (msg) => {

    console.log('❌ Falha na autenticação:');
    console.log(msg);
});

client.on('disconnected', (reason) => {

    console.log('⚠️ Bot desconectado:');
    console.log(reason);
});

// =====================================================
// QUANDO ALGUÉM ENTRA NO GRUPO
// =====================================================

client.on('group_join', async (notification) => {

    try {

        console.log('');
        console.log('👋 NOVO PARTICIPANTE NO GRUPO!');

        const grupo =
            await notification.getChat();

        const participantes =
            await notification.getRecipients();

        for (const contato of participantes) {

            const id =
                contato.id._serialized;

            const nomeWhatsApp =
                contato.pushname ||
                contato.name ||
                'novo participante';

            console.log(
                '👤 Entrou:',
                nomeWhatsApp
            );

            // Inicia apresentação
            apresentacoes.set(id, {

                grupoId: grupo.id._serialized,

                etapa: 'foto',

                nome: '',

                idade: '',

                estado: '',

                foto: false
            });

            // -----------------------------------------
            // MENSAGEM NO PRÓPRIO GRUPO
            // -----------------------------------------

            await grupo.sendMessage(

                '👋 *BEM-VINDO(A), ' +
                nomeWhatsApp +
                '!*\n\n' +

                '🎉 Que bom ter você aqui!\n\n' +

                'Para participar, faça sua apresentação:\n\n' +

                '📸 *1º — Envie uma foto sua*\n' +

                '👤 *2º — Diga seu nome*\n' +

                '🎂 *3º — Diga sua idade*\n' +

                '📍 *4º — Diga seu estado (UF)*\n\n' +

                '🔞 Idade mínima: *14 anos*.\n\n' +

                '📸 Comece enviando sua foto aqui no grupo.'
            );
        }

    } catch (erro) {

        console.log('');
        console.log(
            '❌ Erro ao detectar entrada:'
        );

        console.log(erro);
    }
});

// =====================================================
// SPOTIFY
// =====================================================

async function obterMusicaDoSpotify(url) {

    try {

        const endpoint =
            `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;

        const resposta =
            await fetch(endpoint);

        if (!resposta.ok) {

            throw new Error(
                'Spotify não respondeu corretamente.'
            );
        }

        const dados =
            await resposta.json();

        if (!dados.title) {

            throw new Error(
                'Título não encontrado.'
            );
        }

        return (
            dados.title +
            ' ' +
            (dados.author_name || '')
        );

    } catch (erro) {

        console.log(
            '❌ Erro Spotify:',
            erro.message
        );

        return null;
    }
}

// =====================================================
// BAIXAR MÚSICA
// =====================================================

async function baixarMusica(pesquisa) {

    const arquivoEsperado =
        path.join(
            MUSIC_FOLDER,
            '%(id)s.%(ext)s'
        );

    const argumentos = [

        `ytsearch1:${pesquisa}`,

        '--no-playlist',

        '-x',

        '--audio-format',
        'mp3',

        '--audio-quality',
        '5',

        // Limite de 10 minutos
        '--match-filter',
        'duration<=600',

        '--no-warnings',

        '--print',
        'after_move:filepath',

        '-o',
        arquivoEsperado
    ];

    console.log('');
    console.log(
        '🎵 Procurando:',
        pesquisa
    );

    const resultado =
        await execFileAsync(
            'yt-dlp',
            argumentos,
            {
                windowsHide: true,
                maxBuffer: 10 * 1024 * 1024
            }
        );

    const linhas =
        resultado.stdout
            .split(/\r?\n/)
            .map(linha => linha.trim())
            .filter(Boolean);

    const arquivo =
        linhas
            .reverse()
            .find(linha =>
                linha.toLowerCase().endsWith('.mp3')
            );

    if (!arquivo) {

        throw new Error(
            'Arquivo MP3 não encontrado.'
        );
    }

    return arquivo;
}

// =====================================================
// PROCESSAR APRESENTAÇÃO NO GRUPO
// =====================================================

async function processarApresentacao(message) {

    // Só processa apresentações dentro de grupos.
    if (!message.from.endsWith('@g.us')) {
        return false;
    }

    const id =
        message.author;

    if (!id) {
        return false;
    }

    const dados =
        apresentacoes.get(id);

    if (!dados) {
        return false;
    }

    // Confirma que é do grupo correto.
    if (
        message.from !==
        dados.grupoId
    ) {
        return false;
    }

    const grupo =
        await message.getChat();

    const texto =
        message.body.trim();

    // =================================================
    // ETAPA 1 — FOTO
    // =================================================

    if (dados.etapa === 'foto') {

        if (!message.hasMedia) {

            await grupo.sendMessage(

                '📸 @' +
                id.split('@')[0] +
                ', precisamos primeiro da sua *foto*.\n\n' +

                'Envie uma foto aqui no grupo.',

                {
                    mentions: [id]
                }
            );

            return true;
        }

        try {

            const media =
                await message.downloadMedia();

            if (
                !media ||
                !media.mimetype ||
                !media.mimetype.startsWith('image/')
            ) {

                await grupo.sendMessage(

                    '❌ @' +
                    id.split('@')[0] +
                    ', esse arquivo não parece ser uma foto.\n\n' +

                    'Envie uma imagem.',

                    {
                        mentions: [id]
                    }
                );

                return true;
            }

            // Não salva a imagem no computador.
            dados.foto = true;

            dados.etapa = 'nome';

            await grupo.sendMessage(

                '📸 Foto recebida! ✅\n\n' +

                '👤 @' +
                id.split('@')[0] +
                ', agora diga seu *nome*.',

                {
                    mentions: [id]
                }
            );

        } catch (erro) {

            console.log(
                '❌ Erro ao receber foto:',
                erro.message
            );

            await grupo.sendMessage(

                '❌ Não consegui receber sua foto.\n' +
                'Tente enviar novamente.',

                {
                    mentions: [id]
                }
            );
        }

        return true;
    }

    // =================================================
    // ETAPA 2 — NOME
    // =================================================

    if (dados.etapa === 'nome') {

        if (!texto) {

            await grupo.sendMessage(

                '👤 @' +
                id.split('@')[0] +
                ', digite seu nome.',

                {
                    mentions: [id]
                }
            );

            return true;
        }

        dados.nome = texto;

        dados.etapa = 'idade';

        await grupo.sendMessage(

            '✅ Nome registrado!\n\n' +

            '🎂 @' +
            id.split('@')[0] +
            ', agora diga sua *idade*.\n\n' +

            'Digite somente o número.\n' +
            'Exemplo: 16',

            {
                mentions: [id]
            }
        );

        return true;
    }

    // =================================================
    // ETAPA 3 — IDADE
    // =================================================

    if (dados.etapa === 'idade') {

        const idade =
            parseInt(texto, 10);

        if (
            isNaN(idade) ||
            idade < 1 ||
            idade > 120
        ) {

            await grupo.sendMessage(

                '🎂 @' +
                id.split('@')[0] +
                ', digite uma idade válida.\n\n' +
                'Exemplo: 16',

                {
                    mentions: [id]
                }
            );

            return true;
        }

        // Menores de 14
        if (idade < 14) {

            await grupo.sendMessage(

                '⚠️ @' +
                id.split('@')[0] +
                ', a idade mínima deste grupo é *14 anos*.\n\n' +

                'Sua apresentação não pode ser concluída.',

                {
                    mentions: [id]
                }
            );

            apresentacoes.delete(id);

            return true;
        }

        dados.idade = idade;

        dados.etapa = 'estado';

        await grupo.sendMessage(

            '✅ Idade registrada!\n\n' +

            '📍 @' +
            id.split('@')[0] +
            ', agora diga seu *estado (UF)*.\n\n' +

            'Exemplo: MG\n' +
            'Exemplo: SP\n' +
            'Exemplo: RJ',

            {
                mentions: [id]
            }
        );

        return true;
    }

    // =================================================
    // ETAPA 4 — ESTADO
    // =================================================

    if (dados.etapa === 'estado') {

        const estado =
            texto
                .toUpperCase()
                .replace(/\s/g, '');

        const estadosValidos = [

            'AC',
            'AL',
            'AP',
            'AM',
            'BA',
            'CE',
            'DF',
            'ES',
            'GO',
            'MA',
            'MT',
            'MS',
            'MG',
            'PA',
            'PB',
            'PR',
            'PE',
            'PI',
            'RJ',
            'RN',
            'RS',
            'RO',
            'RR',
            'SC',
            'SP',
            'SE',
            'TO'
        ];

        if (
            !estadosValidos.includes(estado)
        ) {

            await grupo.sendMessage(

                '📍 @' +
                id.split('@')[0] +
                ', não reconheci essa UF.\n\n' +

                'Digite a sigla do seu estado.\n' +
                'Exemplo: MG',

                {
                    mentions: [id]
                }
            );

            return true;
        }

        dados.estado = estado;

        dados.etapa = 'concluido';

        // =================================================
        // APRESENTAÇÃO CONCLUÍDA
        // =================================================

        await grupo.sendMessage(

            '🎉 *APRESENTAÇÃO CONCLUÍDA!*\n\n' +

            '👤 Nome: ' +
            dados.nome +
            '\n' +

            '🎂 Idade: ' +
            dados.idade +
            '\n' +

            '📍 Estado: ' +
            dados.estado +
            '\n' +

            '📸 Foto: recebida ✅\n\n' +

            '❤️ Bem-vindo(a) ao grupo, @' +
            id.split('@')[0] +
            '!',

            {
                mentions: [id]
            }
        );

        console.log('');
        console.log(
            '===================================='
        );
        console.log(
            '🎉 APRESENTAÇÃO CONCLUÍDA'
        );
        console.log(
            '👤 Nome:',
            dados.nome
        );
        console.log(
            '🎂 Idade:',
            dados.idade
        );
        console.log(
            '📍 Estado:',
            dados.estado
        );
        console.log(
            '===================================='
        );

        // Remove o estado temporário.
        apresentacoes.delete(id);

        return true;
    }

    return false;
}

// =====================================================
// MENSAGENS
// =====================================================

client.on(
    'message',
    async (message) => {

        try {

            // ==========================================
            // APRESENTAÇÃO AUTOMÁTICA
            // ==========================================

            if (
                await processarApresentacao(
                    message
                )
            ) {
                return;
            }

            // ==========================================
            // COMANDOS
            // ==========================================

            const textoOriginal =
                message.body.trim();

            const texto =
                textoOriginal.toLowerCase();

            // ==========================================
            // MENU
            // ==========================================

            if (texto === '!menu') {

                await message.reply(

                    '🤖 *MENU DO BOT*\n\n' +

                    '📜 !regras\n' +

                    '👋 !apresentar\n' +

                    '🎵 !musica nome da música\n' +

                    '🎵 !musica artista - música\n' +

                    '🎵 !musica link do Spotify\n\n' +

                    'ℹ️ !menu'
                );

                return;
            }

            // ==========================================
            // REGRAS
            // ==========================================

            if (texto === '!regras') {

                await message.reply(

                    '📜 *REGRAS DO GRUPO*\n\n' +

                    '🔞 Proibido conteúdo +18\n' +

                    '🩸 Proibido gore\n' +

                    '🚫 Proibido conteúdo envolvendo menores\n' +

                    '🚫 Sem bullying ou perseguição\n' +

                    '🚫 Spam e links proibidos\n' +

                    '👤 Idade mínima: 14 anos\n\n' +

                    '⚠️ O descumprimento das regras poderá resultar em remoção.'
                );

                return;
            }

            // ==========================================
            // APRESENTAR MANUALMENTE
            // ==========================================

            if (texto === '!apresentar') {

                await message.reply(

                    '👋 *APRESENTAÇÃO*\n\n' +

                    '📸 Envie uma foto\n' +

                    '👤 Nome\n' +

                    '🎂 Idade\n' +

                    '📍 Estado (UF)\n\n' +

                    '🔞 Idade mínima: 14 anos.'
                );

                return;
            }

            // ==========================================
            // MÚSICA
            // ==========================================

            if (
                texto.startsWith('!musica')
            ) {

                let pesquisa =
                    textoOriginal
                        .substring(7)
                        .trim();

                // --------------------------------------
                // SEM PESQUISA
                // --------------------------------------

                if (!pesquisa) {

                    await message.reply(

                        '🎵 *COMANDO DE MÚSICA*\n\n' +

                        'Digite:\n' +

                        '!musica nome da música\n\n' +

                        'Exemplo:\n' +

                        '!musica Evidências\n\n' +

                        'Também aceito link do Spotify.'
                    );

                    return;
                }

                await message.reply(

                    '🎵 Procurando a música...\n' +
                    '⏳ Aguarde.'
                );

                // --------------------------------------
                // LINK SPOTIFY
                // --------------------------------------

                if (

                    pesquisa.includes(
                        'open.spotify.com'
                    ) ||

                    pesquisa.includes(
                        'spotify.com'
                    )

                ) {

                    const resultadoSpotify =
                        await obterMusicaDoSpotify(
                            pesquisa
                        );

                    if (!resultadoSpotify) {

                        await message.reply(

                            '❌ Não consegui identificar essa música pelo Spotify.\n\n' +

                            'Tente:\n' +

                            '!musica artista - música'
                        );

                        return;
                    }

                    pesquisa =
                        resultadoSpotify;
                }

                // --------------------------------------
                // BAIXAR
                // --------------------------------------

                let arquivo;

                try {

                    arquivo =
                        await baixarMusica(
                            pesquisa
                        );

                } catch (erro) {

                    console.log('');
                    console.log(
                        '❌ ERRO NO DOWNLOAD:'
                    );

                    console.log(
                        erro.message
                    );

                    await message.reply(

                        '❌ Não consegui encontrar essa música.\n\n' +

                        'Tente informar o artista também.\n\n' +

                        'Exemplo:\n' +

                        '!musica Ana Castela - Solteiro Forçado'
                    );

                    return;
                }

                // --------------------------------------
                // VERIFICA MP3
                // --------------------------------------

                if (
                    !fs.existsSync(arquivo)
                ) {

                    await message.reply(
                        '❌ Arquivo de áudio não encontrado.'
                    );

                    return;
                }

                try {

                    console.log(
                        '📤 Enviando música...'
                    );

                    const media =
                        MessageMedia.fromFilePath(
                            arquivo
                        );

                    await client.sendMessage(

                        message.from,

                        media,

                        {
                            sendMediaAsDocument: false
                        }
                    );

                    await message.reply(
                        '🎵 Música enviada! ✅'
                    );

                } catch (erro) {

                    console.log(
                        '❌ Erro ao enviar música:',
                        erro.message
                    );

                    await message.reply(

                        '❌ Ocorreu um erro ao enviar a música.'
                    );

                } finally {

                    // Apaga o arquivo depois.
                    try {

                        if (
                            fs.existsSync(arquivo)
                        ) {

                            fs.unlinkSync(arquivo);

                            console.log(
                                '🗑️ MP3 temporário apagado.'
                            );
                        }

                    } catch (erro) {

                        console.log(
                            '⚠️ Não consegui apagar o MP3:',
                            erro.message
                        );
                    }
                }

                return;
            }

        } catch (erro) {

            console.log('');
            console.log(
                '❌ ERRO NO BOT:'
            );

            console.log(erro);
        }
    }
);

// =====================================================
// INICIAR
// =====================================================

console.log('');
console.log('🚀 Iniciando bot...');
console.log('');

client.initialize();