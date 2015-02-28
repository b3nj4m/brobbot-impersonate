var _ = require('underscore');
var Q = require('q');

function Markov(robot, caseSensitive, stripPunctuation, limit) {
  this.robot = robot;
  this.caseSensitive = !!caseSensitive;
  this.stripPunctuation = !!stripPunctuation;
  this.limit = limit;
}
  
//update the model using the supplied string
Markov.prototype.train = function(str, userId) {
  var text = (Buffer.isBuffer(str) ? str.toString() : str)
  var words = this.wordsFromText(text);
  var self = this;

  return this.robot.brain.scard(key(userId, 'words')).then(function(size) {
    var ops = [];
    var word;
    var next;
    var prev;
    var node;

    if (size < self.limit - words.length) {
      for (var i = 0; i < words.length; i++) {
        word = words[i];
        next = words[i + 1] || '';
        prev = words[i - 1] || '';

        ops.push(self.robot.brain.sadd(key(userId, 'words'), word));
        ops.push(self.robot.brain.incrby(key(userId, word, 'count'), 1));
        ops.push(self.robot.brain.hincrby(key(userId, word, 'next', 'counts'), next, 1));
        ops.push(self.robot.brain.sadd(key(userId, word, 'next'), next));
        ops.push(self.robot.brain.hincrby(key(userId, word, 'prev', 'counts'), prev, 1));
        ops.push(self.robot.brain.sadd(key(userId, word, 'prev'), prev));
      }
    }

    return Q.all(ops);
  });
};

//compute a node's weight using its count. uses ln(count) to prevent some nodes from being highly favored
Markov.prototype.computeWeight = function(count) {
  return Math.log(count) + 1;
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

//pick a word from the model, favoring words that appear in `text`
Markov.prototype.search = function(text, userId) {
  return this.pickWord(this.wordsFromText(text), userId);
};
  
Markov.prototype.randomWord = function(words, counts, favorWords) {
  var self = this;

  var maxSample = 0;
  var sample;

  var favorWordsTable = mapObject(favorWords, _.constant(true));

  return _.reduce(words, function(memo, word, idx) {
    //TODO tweak
    sample = Math.random() * self.computeWeight(counts[idx]) * (favorWordsTable[word] ? 2 : 1);

    if (sample > maxSample) {
      memo = word;
      maxSample = sample;
    }

    return memo;
  }, null);
};

//pick a word from `words`, optionally favoring words in `favorWords`
Markov.prototype.pickWord = function(favorWords, userId) {
  var self = this;

  return this.robot.brain.smembers(key(userId, 'words')).then(function(words) {
    if (favorWords) {
      favorWords = _.intersection(words, favorWords)
    }
    else {
      favorWords = [];
    }

    return Q.all(_.map(words, function(word) {
      return self.robot.brain.get(key(userId, word, 'count'));
    })).then(function(counts) {
      return self.randomWord(words, counts, favorWords);
    });
  });
};

//pick a word to follow `word`
Markov.prototype.next = function(word, userId) {
  var self = this;

  return this.robot.brain.smembers(key(userId, word, 'next')).then(function(words) {
    return Q.all(_.map(words, function(nextWord) {
      return self.robot.brain.hget(key(userId, word, 'next', 'counts'), nextWord);
    })).then(function(counts) {
      return self.randomWord(words, counts);
    });
  });
};

//pick a word to precede `word`
Markov.prototype.prev = function(word, userId) {
  var self = this;

  return this.robot.brain.smembers(key(userId, word, 'prev')).then(function(words) {
    return Q.all(_.map(words, function(prevWord) {
      return self.robot.brain.hget(key(userId, word, 'prev', 'counts'), prevWord);
    })).then(function(counts) {
      return self.randomWord(words, counts);
    });
  });
};

//construct a sentence starting from `word`, with at most `limit` words
Markov.prototype.fill = function(word, limit, userId) {
  var self = this;
  var response = [word];

  if (!response[0]) {
    return [];
  }

  if (limit && response.length >= limit) {
    return response;
  }
  
  var previousWord = word;
  var nextWord = word;
  
  var previous = function(previousWord) {
    return self.prev(previousWord, userId).then(function(previousWord) {
      if (previousWord) {
        response.unshift(previousWord);
      }
      if (previousWord && (!limit || response.length < limit)) {
        return previous(previousWord);
      }
      else {
        return next(nextWord);
      }
    });
  };
    
  var next = function(nextWord) {
    return self.next(nextWord, userId).then(function(nextWord) {
      if (nextWord) {
        response.push(nextWord);
      }
      if (nextWord && (!limit || response.length < limit)) {
        return next(nextWord);
      }
      else {
        return response.join(' ');
      }
    });
  };

  return previous(previousWord);
};

//construct a response to `text` with at most `limit` words
Markov.prototype.respond = function(text, limit, userId) {
  var self = this;
  limit = limit || 25;
  return this.search(text, userId).then(function(word) {
    return self.fill(word, limit, userId);
  });
};

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
