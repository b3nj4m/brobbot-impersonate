//Description:
//  Impersonate a user using Markov chains
//
//Dependencies:
//  markov-respond: ~6.0.0
//  underscore: ~1.7.0
//
//Configuration:
//  HUBOT_IMPERSONATE_MODE=mode - one of 'train', 'train_respond', 'respond'. (default 'train')
//  HUBOT_IMPERSONATE_MIN_WORDS=N - ignore messages with fewer than N words. (default 1)
//  HUBOT_IMPERSONATE_INIT_TIMEOUT=N - wait for N milliseconds for brain data to load from redis. (default 10000)
//  HUBOT_IMPERSONATE_CASE_SENSITIVE=true|false - whether to keep the original case of words (default false)
//  HUBOT_IMPERSONATE_STRIP_PUNCTUATION=true|false - whether to strip punctuation/symbols from messages (default false)
//
//Commands:
//  hubot impersonate <user> - impersonate <user> until told otherwise.
//  hubot stop impersonating - stop impersonating a user
//
//Author:
//  b3nj4m

var Markov = require('markov-respond');
var _ = require('underscore');

var MIN_WORDS = process.env.HUBOT_IMPERSONATE_MIN_WORDS ? parseInt(process.env.HUBOT_IMPERSONATE_MIN_WORDS) : 1;
var MODE = process.env.HUBOT_IMPERSONATE_MODE && _.contains(['train', 'train_respond', 'respond'], process.env.HUBOT_IMPERSONATE_MODE) ? process.env.HUBOT_IMPERSONATE_MODE : 'train';
var INIT_TIMEOUT = process.env.HUBOT_IMPERSONATE_INIT_TIMEOUT ? parseInt(process.env.HUBOT_IMPERSONATE_INIT_TIMEOUT) : 10000;
var CASE_SENSITIVE = (!process.env.HUBOT_IMPERSONATE_CASE_SENSITIVE || process.env.HUBOT_IMPERSONATE_CASE_SENSITIVE === 'false') ? false : true;
var STRIP_PUNCTUATION = (!process.env.HUBOT_IMPERSONATE_STRIP_PUNCTUATION || process.env.HUBOT_IMPERSONATE_STRIP_PUNCTUATION === 'false') ? false : true;

var shouldTrain = _.constant(_.contains(['train', 'train_respond'], MODE));

var shouldRespondMode = _.constant(_.contains(['respond', 'train_respond'], MODE));

function start(robot) {
  var impersonating = false;
  var lastMessageText;
  var markov = new Markov(robot, MIN_WORDS, CASE_SENSITIVE, STRIP_PUNCTUATION);

  function shouldRespond() {
    return shouldRespondMode() && impersonating;
  }

  robot.respond(/impersonate (\w*)/i, function(msg) {
    if (shouldRespondMode()) {
      var username = msg.match[1];
      var text = msg.message.text;

      return robot.brain.usersForFuzzyName(username).then(function(users) {
        if (users && users.length > 0) {
          var user = users[0];
          impersonating = user.id;
          msg.send('impersonating ' + user.name);

          return markov.respond(lastMessageText || 'beans', impersonating).then(function(message) {
            msg.send(message);
          });
        }
        else {
          msg.send("I don't know any " + username + ".");
        }
      });
    }
  });

  robot.respond(/stop impersonating/i, function(msg) {
    if (shouldRespond()) {
      var user = robot.brain.userForId(impersonating);
      impersonating = false;

      if (user) {
        msg.send('stopped impersonating ' + user.name);
      }
      else {
        msg.send('stopped');
      }
    }
    else {
      msg.send('Wat.');
    }
  });

  robot.hear(/.*/, function(msg) {
    var text = msg.message.text;
    var markov;

    if (text && !msg.isAddressedToBrobbot) {
      lastMessageText = text;

      if (shouldTrain()) {
        var userId = msg.message.user.id;
        markov.train(text);
      }

      if (shouldRespond()) {
        return markov.respond(text, impersonating).then(function(message) {
          msg.send(message);
        });
      }
    }
  });
}

module.exports = function(robot) {
  console.log('starting hubot-impersonate...');
  start(robot);
};
