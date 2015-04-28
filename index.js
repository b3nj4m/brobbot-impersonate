//Description:
//  Impersonate a user using Markov chains
//
//Dependencies:
//  underscore: ~1.7.0
//
//Configuration:
//  BROBBOT_IMPERSONATE_MAX_WORDS=N - stop training a particular user when the number of unique words in the Markov chain reaches `N`
//  BROBBOT_IMPERSONATE_CASE_SENSITIVE=true|false - whether to keep the original case of words (default false)
//  BROBBOT_IMPERSONATE_STRIP_PUNCTUATION=true|false - whether to strip punctuation/symbols from messages (default false)
//  BROBBOT_IMPERSONATE_DEFAULT_RESPONSE=response - default response to use when the markov chain produces an empty string
//
//Author:
//  b3nj4m

var Markov = require('./markov');
var _ = require('underscore');

var MAX_WORDS = process.env.BROBBOT_IMPERSONATE_MAX_WORDS ? parseInt(process.env.BROBBOT_IMPERSONATE_MAX_WORDS) : 250;
var CASE_SENSITIVE = (!process.env.BROBBOT_IMPERSONATE_CASE_SENSITIVE || process.env.BROBBOT_IMPERSONATE_CASE_SENSITIVE === 'false') ? false : true;
var STRIP_PUNCTUATION = (!process.env.BROBBOT_IMPERSONATE_STRIP_PUNCTUATION || process.env.BROBBOT_IMPERSONATE_STRIP_PUNCTUATION === 'false') ? false : true;
var DEFAULT_RESPONSE = process.env.BROBBOT_IMPERSONATE_DEFAULT_RESPONSE || '...';

function start(robot) {
  robot.helpCommand('brobbot impersonate `user`', 'impersonate `user` until told otherwise.');
  robot.helpCommand('brobbot stop impersonating', 'stop impersonating a user');

  var impersonating = false;
  var lastMessageText;
  var markov = new Markov(robot, CASE_SENSITIVE, STRIP_PUNCTUATION, MAX_WORDS);

  function shouldRespond() {
    return !!impersonating;
  }

  robot.respond(/^impersonate ([^\s]+)/i, function(msg) {
    var username = msg.match[1];
    var text = msg.message.text;

    return robot.brain.usersForFuzzyName(username).then(function(users) {
      if (users && users.length > 0) {
        var user = users[0];

        return markov.exists(user.id).then(function(exists) {
          if (exists) {
            impersonating = user.id;
            msg.send('impersonating ' + user.name);

            return markov.respond(lastMessageText || 'beans', impersonating).then(function(message) {
              msg.send(message === '' ? DEFAULT_RESPONSE : message);
            });
          }
          msg.send("I haven't heard " + user.name + " say anything!");
        });
      }
      else {
        msg.send("I don't know any " + username + ".");
      }
    });
  });

  robot.respond(/^stop impersonating/i, function(msg) {
    if (shouldRespond()) {
      robot.brain.userForId(impersonating).then(function(user) {
        impersonating = false;

        if (user) {
          msg.send('stopped impersonating ' + user.name);
        }
        else {
          msg.send('stopped');
        }
      });
    }
    else {
      msg.send('Wat.');
    }
  });

  robot.hear(/.*/, function(msg) {
    var text = msg.message.text;

    if (text && !msg.message.isAddressedToBrobbot) {
      lastMessageText = text;

      markov.train(text, msg.message.user.id);

      if (shouldRespond()) {
        return markov.respond(text, impersonating).then(function(message) {
          msg.send(message === '' ? DEFAULT_RESPONSE : message);
        });
      }
    }
  });
}

module.exports = start;
