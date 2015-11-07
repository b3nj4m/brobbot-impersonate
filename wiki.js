var Q = require('q');
var https = require('https');
var Url = require('url');
var cheerio = require('cheerio');

function get (url) {
  var defer = Q.defer();
  https.get(url, function (res) {
    var data = [];
    res.on('data', function (chunk) { data.push(chunk); });
    res.on('end', function () {
      try {
        defer.resolve(JSON.parse(data.join('')));
      }
      catch (err) {
        defer.reject(err);
      }
    });
  });
  return defer.promise;
}

function search (subject) {
  var parsed = Url.parse('https://en.wikiquote.org/w/api.php', true);
  parsed.query.action = 'query';
  parsed.query.list = 'search';
  parsed.query.format = 'json';
  parsed.query.srsearch = subject;
  parsed.query.srnamespace = 0;
  parsed.query.srlimit = 10;

  return get(parsed.format()).then(function(data) {
    return data.query.search[0].title;
  });
}

function quotes (subject) {
  return search(subject).then(function (pageTitle) {
    var parsed = Url.parse('https://en.wikiquote.org/w/api.php', true);
    parsed.query.action = 'parse';
    parsed.query.contentmodel = 'wikitext';
    parsed.query.format = 'json';
    parsed.query.page = pageTitle;

    return get(parsed.format()).then(function (data) {
      var html = data.parse.text['*'];
      var $ = cheerio.load(html);
      var uls = $('#Quotes').parent().nextUntil('h2', 'ul');
      uls.find('ul').remove();
      return uls.find('li').slice(0, 20).map(function () {
        return $(this).text();
      }).get();
    });
  });
}

module.exports = quotes;
