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
//  BROBBOT_IMPERSONATE_ORDER=N - the order of the markov chain (higher order = more accurate) (default 1)
//
//Author:
//  b3nj4m

var Markov = require('./markov');
var wikiQuotes = require('./wiki');
var _ = require('underscore');
var https = require('https');
var Url = require('url');

var MAX_WORDS = process.env.BROBBOT_IMPERSONATE_MAX_WORDS ? parseInt(process.env.BROBBOT_IMPERSONATE_MAX_WORDS) : 250;
var CASE_SENSITIVE = (!process.env.BROBBOT_IMPERSONATE_CASE_SENSITIVE || process.env.BROBBOT_IMPERSONATE_CASE_SENSITIVE === 'false') ? false : true;
var STRIP_PUNCTUATION = (!process.env.BROBBOT_IMPERSONATE_STRIP_PUNCTUATION || process.env.BROBBOT_IMPERSONATE_STRIP_PUNCTUATION === 'false') ? false : true;
var DEFAULT_RESPONSE = process.env.BROBBOT_IMPERSONATE_DEFAULT_RESPONSE || '...';
var ORDER = process.env.BROBBOT_IMPERSONATE_ORDER || 1;

function start(robot) {
  robot.helpCommand('brobbot impersonate `user`', 'impersonate `user` until told otherwise.');
  robot.helpCommand('brobbot stop impersonating', 'stop impersonating a user');

  var impersonating = false;
  var lastMessageText;
  var markov = new Markov(robot, CASE_SENSITIVE, STRIP_PUNCTUATION, MAX_WORDS, ORDER);

  function shouldRespond() {
    return !!impersonating;
  }

  function respond(msg, message) {
    return robot.brain.userForId(impersonating).then(function(user) {
      msg.send((user ? user.name + 'bot: ' : '') + (message === '' ? DEFAULT_RESPONSE : message));
    });
  }

  robot.respond(/^impersonate ([^\s]+)(.*)/i, function(msg) {
    var username = msg.match[1];
    var text = msg.match[2];

    return robot.brain.usersForFuzzyName(username).then(function(users) {
      if (users && users.length > 0) {
        var user = users[0];

        return markov.exists(user.id).then(function(exists) {
          if (exists) {
            impersonating = user.id;
            msg.send('impersonating ' + user.name);

            return markov.respond(lastMessageText || 'beans', impersonating).then(function(message) {
              return respond(msg, message);
            });
          }
          msg.send("I haven't heard " + user.name + " say anything!");
        });
      }
      else {
        //search for the subject on wikiquote and create a markov chain, store using the subject as the ID
        var subject = username + text;
        return wikiQuotes(subject).then(function (quotes) {
          if (quotes.length) {
            impersonating = subject;
            msg.send('impersonating ' + subject);

            var trains = Q.all(quotes.map(function (quote) {
              return markov.train(quote, subject);
            }));

            return trains.then(function () {
              return markov.respond(lastMessageText || 'beans', impersonating).then(function (message) {
                return respond(msg, message);
              });
            });
          }
          else {
            return msg.send('who?');
          }
        });
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

    if (text && !msg.message.isBrobbotCommand) {
      lastMessageText = text;

      markov.train(text, msg.message.user.id);

      if (shouldRespond()) {
        return markov.respond(text, impersonating).then(function(message) {
          return respond(msg, message);
        });
      }
    }
  });
}

module.exports = start;
