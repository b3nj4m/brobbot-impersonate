### brobbot-impersonate

Enable Brobbot to learn from chat history and impersonate users.

```
Bob: pizza is super good
Alice: brobbot impersonate bob
Brobbot: impersonating Bob
Eve: I love pizza
Brobbot: pizza is super
...
```

### Model

Currently uses simple Markov chain based on [markov-respond](https://github.com/b3nj4m/node-markov).

### Configuration

#### Maximum number of unique words

Limit the size of the Markov chain (it grows very quickly) to `N` unique words per-user (default 250).

```
BROBBOT_IMPERSONATE_MAX_WORDS=N
```

#### Case sensitivity

Whether to keep the original case of words. (default false)

```
BROBBOT_IMPERSONATE_CASE_SENSITIVE=true|false
```

#### Strip punctuation

Whether to strip punctuation/symbols from messages. (default false)

```
BROBBOT_IMPERSONATE_STRIP_PUNCTUATION=true|false
```

### Commands

#### Impersonate

Start impersonating `<user>`.

```
brobbot impersonate <user>
```

#### Stop

Stop impersonating.

```
brobbot stop impersonating
```

