var _ = require('underscore');
var Q = require('q');
var pos = require('pos');

var tagger = new pos.Tagger();

function Markov(robot, caseSensitive, stripPunctuation, limit, order) {
  this.robot = robot;
  this.caseSensitive = !!caseSensitive;
  this.stripPunctuation = !!stripPunctuation;
  this.limit = limit;
  this.order = Math.max(1, order);
}

Markov.prototype.exists = function(userId) {
  return this.robot.brain.exists(key(userId, 'words'));
};
  
//update the model using the supplied string
Markov.prototype.train = function(str, userId) {
  var text = (Buffer.isBuffer(str) ? str.toString() : str)
  var words = this.wordsFromText(text);
  var self = this;

  return this.robot.brain.scard(key(userId, 'words')).then(function(size) {
    var ops = [];
    var gram;
    var next;
    var prev;
    var node;

    if (size < self.limit - words.length) {
      for (var i = 0; i < words.length - self.order + 1; i++) {
        gram = words.slice(i, i + self.order).join(' ');
        next = words[i + self.order] || '';
        prev = words[i - 1] || '';

        ops.push(self.robot.brain.sadd(key(userId, 'words'), gram));
        ops.push(self.robot.brain.incrby(key(userId, gram, 'count'), 1));
        ops.push(self.robot.brain.hincrby(key(userId, gram, 'next', 'counts'), next, 1));
        ops.push(self.robot.brain.sadd(key(userId, gram, 'next'), next));
        ops.push(self.robot.brain.hincrby(key(userId, gram, 'prev', 'counts'), prev, 1));
        ops.push(self.robot.brain.sadd(key(userId, gram, 'prev'), prev));
      }
    }

    return Q.all(ops);
  });
};

//compute a node's weight using its count
Markov.prototype.computeWeight = function(count) {
  //TODO tweak
  return count;
};

//break a string into words, and remove punctuation, etc.
Markov.prototype.wordsFromText = function(text) {
  text = text.toString();

  if (!this.caseSensitive) {
    text = text.toLowerCase();
  }

  if (this.stripPunctuation) {
    text = clean(text);
  }

  return text.split(/\s+/);
};

//pick a word from the model, favoring grams that appear in `text`
Markov.prototype.search = function(text, userId) {
  return this.pickGram(this.importantGrams(this.wordsFromText(text)), userId);
};

Markov.prototype.importantGrams = function(words) {
  var self = this;

  //extract nouns and verbs from the word list
  return _.chain(tagger.tag(words)).map(function(item, idx) {
    return [words.slice(idx, self.order).join(' '), item[1]];
  }).filter(function(item, idx) {
    return /^(NN|VB)/.test(item[1]);
  }).map(function(item) {
    return item[0];
  }).value();
};
  
Markov.prototype.randomWord = function(words, counts, favorWords) {
  var self = this;

  var maxSample = 0;
  var sample;

  var favorWordsTable = mapObject(favorWords, _.constant(true));

  return _.reduce(words, function(memo, word, idx) {
    //TODO tweak
    sample = Math.random() * self.computeWeight(counts[idx]) * (favorWordsTable[word] ? 10 : 1);

    if (sample > maxSample) {
      memo = word;
      maxSample = sample;
    }

    return memo;
  }, null);
};

//pick a gram from `grams`, optionally favoring grams in `favorGrams`
Markov.prototype.pickGram = function(favorGrams, userId) {
  var self = this;

  return this.robot.brain.smembers(key(userId, 'words')).then(function(grams) {
    if (favorGrams) {
      favorGrams = _.intersection(grams, favorGrams)
    }
    else {
      favorGrams = [];
    }

    return Q.all(_.map(grams, function(gram) {
      return self.robot.brain.get(key(userId, gram, 'count'));
    })).then(function(counts) {
      return self.randomWord(grams, counts, favorGrams);
    });
  });
};

//pick a word to follow `gram`
Markov.prototype.next = function(gram, userId) {
  var self = this;

  return this.robot.brain.smembers(key(userId, gram, 'next')).then(function(words) {
    return Q.all(_.map(words, function(nextWord) {
      return self.robot.brain.hget(key(userId, gram, 'next', 'counts'), nextWord);
    })).then(function(counts) {
      return self.randomWord(words, counts);
    });
  });
};

//pick a word to precede `gram`
Markov.prototype.prev = function(gram, userId) {
  var self = this;

  return this.robot.brain.smembers(key(userId, gram, 'prev')).then(function(words) {
    return Q.all(_.map(words, function(prevWord) {
      return self.robot.brain.hget(key(userId, gram, 'prev', 'counts'), prevWord);
    })).then(function(counts) {
      return self.randomWord(words, counts);
    });
  });
};

//construct a sentence starting from `gram`, with at most `limit` words
Markov.prototype.fill = function(gram, limit, userId) {
  var self = this;
  var response = gram.split(' ');

  if (!response[0]) {
    return [];
  }

  if (limit && response.length >= limit) {
    return response;
  }
  
  var previous = function(previousGram) {
    return self.prev(previousGram, userId).then(function(previousWord) {
      if (previousWord) {
        response.unshift(previousWord);
      }
      if (previousWord && (!limit || response.length < limit)) {
        return previous(response.slice(0, self.order).join(' '));
      }
      else {
        return next(gram);
      }
    });
  };
    
  var next = function(nextGram) {
    return self.next(nextGram, userId).then(function(nextWord) {
      if (nextWord) {
        response.push(nextWord);
      }
      if (nextWord && (!limit || response.length < limit)) {
        return next(response.slice(response.length - self.order, response.length).join(' '));
      }
      else {
        return response.join(' ');
      }
    });
  };

  return previous(gram);
};

//construct a response to `text` with at most `limit` words
Markov.prototype.respond = function(text, userId, limit) {
  var self = this;
  limit = limit || 15;
  return this.search(text, userId).then(function(gram) {
    if (gram) {
      return self.fill(gram, limit, userId).then(function(str) {
        return sanitize(str);
      });
    }
    return '';
  });
};

function sanitize(s) {
  //remove unmatch double-quotes
  var open = null;
  for (var i = 0; i < s.length; i++) {
    if (s.charAt(i) === '"') {
      if (open === null) {
        open = i;
      }
      else {
        open = null;
      }
    }
  }
  if (open !== null) {
    s = s.substring(0, open) + s.substring(open + 1);
  }

  //remove trailing commas
  s = s.replace(/,$/, '');

  return s;
}

//clean a string
function clean(s) {
  return s.replace(/[^a-z\d ]+/ig, '')
}

//map a list to an object, using list values as keys
function mapObject(list, fn) {
  var ret = {};

  _.each(list, function(val, idx) {
    ret[val] = fn(val, idx);
  });

  return ret;
}

function key(parts) {
  return _.toArray(arguments).join(':');
}

module.exports = Markov;
