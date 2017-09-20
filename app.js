const builder = require('botbuilder');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// let insightsClient;
// if (process.env.APP_INSIGHTS_KEY) {
//     const appInsights = require("applicationinsights");
//     appInsights.setup(process.env.APP_INSIGHTS_KEY)
//         .setAutoDependencyCorrelation(false)
//         .setAutoCollectRequests(true)
//         .setAutoCollectPerformance(true)
//         .setAutoCollectExceptions(true)
//         .setAutoCollectDependencies(true)
//         .start();
//     insightsClient = appInsights.getClient();
// }

const Util = require('./Util');
const util = new Util();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//=========================================================
// Bot Setup
//=========================================================

const port = process.env.port || process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log('bot is listening on port %s', port);
});

// Create chat bot
const connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);

// for getting all user input
app.all('/api/messages', (req, res, next) => {
    if (req.body.type === 'message' && req.body.text) {
        // util.storeUserInput(req.body);
        console.log('message', req.body);

        // if (req.body.channelData) {
        //     console.log('channelData', req.body.channelData);
        //     if (insightsClient) {
        //         insightsClient.trackEvent('channelData', req.body.channelData);
        //     }
        // }
    }
    next();
});

app.post('/api/messages', connector.listen());

app.get('/', (req, res) => {
    res.send(`Bot is running on port ${port}!\n`);
});

//=========================================================
// Bots Dialogs
//=========================================================

// When user joins, it begin Greeting dialog
bot.on('conversationUpdate', message => {
    if (message.membersAdded) {
        message.membersAdded.forEach(identity => {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address, 'Greeting');
            }
        });
    }
});

const firstChoices = {
    "Recommend for lunch": {
        value: 'lunch',
        title: '行列のできるタイ料理屋',
        subtitle: 'ランチセットがコスパ良し',
        text: '品川駅から徒歩10分くらいのところにあるタイ料理屋。トムヤムクンヌードルがおすすめ。',
        imageURL: 'https://sakkuru.github.io/simple-bot-nodejs/images/tom.jpg',
        button: '予約する',
        url: 'http://example.com/'
    },
    "Recommend for drinking": {
        value: 'drink',
        title: '落ち着いた雰囲気の個室居酒屋',
        subtitle: 'なんでも美味しいが、特に焼き鳥がおすすめ',
        text: '品川駅から徒歩5分くらいの路地裏にひっそりある。',
        imageURL: 'https://sakkuru.github.io/simple-bot-nodejs/images/yaki.jpg',
        button: '予約する',
        url: 'http://example.com/'
    },
    "Image Recognition": {
        value: 'imageRecognition'
    },
    "Others": {
        value: 'others'
    }
};

// default first dialog
bot.dialog('/', [
    session => {
        session.send("Hello!", { token: 'hoge' });
        session.beginDialog('Greeting');
    }
]);

bot.dialog('Greeting', [
    session => {
        session.send("This is Saki's Bot.", { token: 'hoge', fuga: 'aaaaaaa' });
        session.beginDialog('FirstQuestion');
    }
]);

bot.dialog('FirstQuestion', [
    (session, results, next) => {
        builder.Prompts.choice(session, "What can I do for you?", firstChoices, { listStyle: 3 });
    },
    (session, results, next) => {
        const choice = firstChoices[results.response.entity];
        console.log(results.response);

        if (choice.value === 'others') {
            session.beginDialog('GetFreeText');
            return;
        } else if (choice.value === 'imageRecognition') {
            session.beginDialog('ImageRecognition');
            return;
        }

        session.send('How about this?');

        const card = new builder.HeroCard(session)
            .title(choice.title)
            .subtitle(choice.subtitle)
            .text(choice.text)
            .images([
                builder.CardImage.create(session, choice.imageURL)
            ])
            .buttons([
                builder.CardAction.openUrl(session, choice.url, choice.button)
            ]);

        const msg = new builder.Message(session).addAttachment(card);
        session.send(msg);
        session.beginDialog('EndDialog');
    }
]);

bot.dialog('GetFreeText', [
    session => {
        builder.Prompts.text(session, "Input freely.");
    },
    (session, results) => {
        console.log(results.response);
        const res = util.getLuis(results.response).then(res => {
            console.log('res', res);
            // process LUIS response
        });
    }
]);

bot.dialog('ImageRecognition', [
    session => {
        builder.Prompts.attachment(session, 'Please upload photos.');
    },
    (session, results) => {
        const promises = [];
        results.response.forEach(content => {
            if (content.contentType.match('image')) {
                promises.push(util.getCognitiveResults(content.contentUrl));
            }
        });

        Promise.all(promises).then(imageDescs => {
            imageDescs.forEach(res => {
                session.send(res.description.captions[0].text);
            });
        });
    }
]);

bot.dialog('EndDialog', [
    session => {
        builder.Prompts.confirm(session, "Have you solved your problem?", { listStyle: 3 });
    },
    (session, results) => {
        console.log(results.response);
        if (results.response) {
            session.send('Thank you!');
            session.endDialog();
        } else {
            session.send('I\'m sorry for the inconvenience.');
            session.beginDialog('FirstQuestion');
        }
    }
]);

// help command
bot.customAction({
    matches: /^help$/i,
    onSelectAction: (session, args, next) => {
        const helpTexts = [
            'help: このヘルプメニュー。前のdialogは続いています。',
            'exit: dialogを終わらせ、 最初に戻ります。',
        ]
        session.send(helpTexts.join('\n\n'));
    }
});

// exit command
bot.dialog('Exit', [
    session => {
        session.endDialog("スタックを消去して終了します。");
        session.beginDialog('FirstQuestion');
    },
]).triggerAction({
    matches: /^exit$/i
});

// Always accepts free text input
bot.dialog('Any', [
    session => {
        session.endDialog("自由入力を受け付けました。");
        session.beginDialog('FirstQuestion');
    },
]).triggerAction({
    matches: /^.*$/i
});